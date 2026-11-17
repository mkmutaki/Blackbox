const request = require('supertest');
const { app, TEST_ORIGIN, deliverEmails } = require('./helpers');
const WaitlistEntry = require('../models/WaitlistEntry');
const EmailJob = require('../models/EmailJob');
const emailProvider = require('../services/emailProvider');
const { EmailSendError } = emailProvider;
const { drainEmailQueue, requeueFailedEmails, WAITLIST_DAILY_CAP } = require('../services/emailQueue');
const { deriveUnsubscribeToken } = require('../services/tokens');
const { exportWaitlist } = require('../scripts/exportWaitlist');

const join = (body) => request(app).post('/api/waitlist').set('Origin', TEST_ORIGIN).send(body);

describe('POST /api/waitlist', () => {
  it('stores a normalized address without needing an account', async () => {
    const res = await join({ email: '  Someone@Example.COM ' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    const entries = await WaitlistEntry.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].email).toBe('someone@example.com');
  });

  it('answers a repeat sign-up the same way and keeps one entry with the original time', async () => {
    await join({ email: 'repeat@example.com' });
    const [first] = await WaitlistEntry.find().lean();

    const res = await join({ email: 'REPEAT@example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    const entries = await WaitlistEntry.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].createdAt).toEqual(first.createdAt);
  });

  it.each([
    [{}],
    [{ email: 'not-an-email' }],
    [{ email: { $ne: null } }],
    [{ email: `${'a'.repeat(250)}@example.com` }],
  ])('rejects %j', async (body) => {
    const res = await join(body);

    expect(res.status).toBe(400);
    expect(await WaitlistEntry.countDocuments()).toBe(0);
  });

  it('ignores fields other than email', async () => {
    await join({ email: 'extra@example.com', createdAt: '2000-01-01T00:00:00.000Z', role: 'admin' });

    const [entry] = await WaitlistEntry.find().lean();
    expect(entry.createdAt.getFullYear()).not.toBe(2000);
    expect(entry).not.toHaveProperty('role');
  });

  it('is behind the CSRF origin check', async () => {
    const res = await request(app).post('/api/waitlist').set('Origin', 'https://evil.example').send({ email: 'x@example.com' });

    expect(res.status).toBe(403);
    expect(await WaitlistEntry.countDocuments()).toBe(0);
  });

  it('rate-limits sign-ups per IP', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      let last;
      for (let i = 0; i < 21; i += 1) {
        last = await join({ email: `limit-${i}@example.com` });
      }
      expect(last.status).toBe(429);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe('waitlist welcome email', () => {
  const HOUR = 60 * 60 * 1000;

  // Every worker line goes through console.log; keep test output readable.
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Welcomes already sent `hoursAgo`, counting toward the daily cap.
  const sentWelcomes = (count, hoursAgo) =>
    EmailJob.insertMany(Array.from({ length: count }, () => ({
      kind: 'waitlist_welcome',
      status: 'sent',
      sentAt: new Date(Date.now() - hoursAgo * HOUR),
      giveUpAt: new Date(),
    })));

  it('sends one welcome to a new address, and keeps the address afterwards', async () => {
    await join({ email: 'Welcome@Example.com' });

    const messages = await deliverEmails();

    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe('welcome@example.com');
    expect(messages[0].subject).toBe("You're on the Blackbox waitlist");
    expect(messages[0].text).toContain('1565 E Farwell, Spokane, Washington, 99208');
    expect(messages[0].html).toContain('1565 E Farwell, Spokane, Washington, 99208');
    expect(messages[0].html).toContain('>Unsubscribe</a>');
    expect(await WaitlistEntry.countDocuments({ email: 'welcome@example.com' })).toBe(1);
    const [job] = await EmailJob.find({ kind: 'waitlist_welcome' }).lean();
    expect(job).toMatchObject({ status: 'sent', email: null });
  });

  it('sends nothing more when the same address signs up again', async () => {
    await join({ email: 'again@example.com' });
    await deliverEmails();

    await join({ email: 'AGAIN@example.com' });

    expect(await deliverEmails()).toHaveLength(0);
    expect(await EmailJob.countDocuments({ kind: 'waitlist_welcome' })).toBe(1);
  });

  it('still adds the address when the welcome cannot be queued', async () => {
    vi.spyOn(EmailJob, 'create').mockRejectedValueOnce(new Error('database blip'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await join({ email: 'blip@example.com' });

    expect(res.status).toBe(201);
    expect(await WaitlistEntry.countDocuments({ email: 'blip@example.com' })).toBe(1);
  });

  it('cancels the welcome if the entry was removed before it went out', async () => {
    await join({ email: 'gone@example.com' });
    await WaitlistEntry.deleteMany({});

    expect(await deliverEmails()).toHaveLength(0);
    const [job] = await EmailJob.find({ kind: 'waitlist_welcome' }).lean();
    expect(job).toMatchObject({ status: 'cancelled', lastError: 'no_entry' });
  });

  it(`holds welcomes past ${WAITLIST_DAILY_CAP} in 24 hours until the oldest leaves the window`, async () => {
    await sentWelcomes(1, 20);
    await sentWelcomes(WAITLIST_DAILY_CAP - 1, 1);
    await join({ email: 'over-cap@example.com' });

    expect(await deliverEmails()).toHaveLength(0);
    const job = await EmailJob.findOne({ kind: 'waitlist_welcome', status: 'pending' }).lean();
    const expected = Date.now() + 4 * HOUR;
    expect(Math.abs(job.runAt.getTime() - expected)).toBeLessThan(60 * 1000);
    expect(job.lastError).toBeNull();
  });

  it('sends again once a send ages out of the 24-hour window', async () => {
    await sentWelcomes(WAITLIST_DAILY_CAP, 25);
    await join({ email: 'next-day@example.com' });

    expect(await deliverEmails()).toHaveLength(1);
  });

  it('gives up if the cap would hold a welcome past its retry window', async () => {
    await sentWelcomes(WAITLIST_DAILY_CAP, 1);
    await join({ email: 'too-late@example.com' });
    await EmailJob.updateOne({ status: 'pending' }, { $set: { giveUpAt: new Date(Date.now() + HOUR) } });

    expect(await deliverEmails()).toHaveLength(0);
    const job = await EmailJob.findOne({ status: 'failed' }).lean();
    expect(job.lastError).toBe('daily_cap');
  });

  it('does not count verification or reset emails toward the cap', async () => {
    await EmailJob.insertMany(Array.from({ length: WAITLIST_DAILY_CAP }, () => ({
      kind: 'email_verify', status: 'sent', sentAt: new Date(), giveUpAt: new Date(),
    })));
    await join({ email: 'uncapped@example.com' });

    expect(await deliverEmails()).toHaveLength(1);
  });

  it('requeues a failed welcome, which then goes out', async () => {
    await join({ email: 'outage@example.com' });
    const send = vi.spyOn(emailProvider, 'sendEmail').mockRejectedValue(new EmailSendError('validation_error', { retryable: false }));
    await drainEmailQueue();
    send.mockRestore();
    expect(await EmailJob.countDocuments({ kind: 'waitlist_welcome', status: 'failed' })).toBe(1);

    expect(await requeueFailedEmails()).toBe(1);

    const [message] = await deliverEmails();
    expect(message.to).toBe('outage@example.com');
  });
});

describe('unsubscribing from the waitlist', () => {
  const unsubscribe = (body) => request(app).post('/api/waitlist/unsubscribe').set('Origin', TEST_ORIGIN).send(body);

  // The id and token from the unsubscribe link, read the way a person would follow it.
  const linkFrom = (message) => {
    const url = new URL(message.text.match(/Unsubscribe: (\S+)/)[1]);
    return { path: url.pathname, id: url.searchParams.get('id'), token: url.searchParams.get('token') };
  };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes the address with the link from the welcome email, and accepts a second click', async () => {
    await join({ email: 'leaving@example.com' });
    await join({ email: 'staying@example.com' });
    const messages = await deliverEmails();
    const link = linkFrom(messages.find((message) => message.to === 'leaving@example.com'));
    expect(link.path).toBe('/unsubscribe');

    const res = await unsubscribe({ id: link.id, token: link.token });

    expect(res.status).toBe(200);
    expect(await WaitlistEntry.find().distinct('email')).toEqual(['staying@example.com']);
    expect((await unsubscribe({ id: link.id, token: link.token })).status).toBe(200);
  });

  it("rejects a token made for another entry, and removes nothing", async () => {
    await join({ email: 'victim@example.com' });
    await join({ email: 'attacker@example.com' });
    const victim = await WaitlistEntry.findOne({ email: 'victim@example.com' });
    const attacker = await WaitlistEntry.findOne({ email: 'attacker@example.com' });

    const res = await unsubscribe({ id: victim.id, token: deriveUnsubscribeToken(attacker.id) });

    expect(res.status).toBe(400);
    expect(await WaitlistEntry.countDocuments()).toBe(2);
  });

  it.each([
    [{}],
    [{ id: 'not-an-id', token: 'a'.repeat(64) }],
    [{ id: 'a'.repeat(24), token: 'short' }],
    [{ id: { $ne: null }, token: { $ne: null } }],
  ])('rejects %j', async (body) => {
    await join({ email: 'kept@example.com' });

    expect((await unsubscribe(body)).status).toBe(400);
    expect(await WaitlistEntry.countDocuments()).toBe(1);
  });

  it('cancels a welcome that had not gone out yet', async () => {
    await join({ email: 'quick@example.com' });
    const entry = await WaitlistEntry.findOne();

    await unsubscribe({ id: entry.id, token: deriveUnsubscribeToken(entry.id) });

    expect(await deliverEmails()).toHaveLength(0);
  });
});

describe('exportWaitlist', () => {
  it('returns every entry as CSV, oldest first', async () => {
    await WaitlistEntry.create({ email: 'second@example.com', createdAt: new Date('2026-02-01T00:00:00Z') });
    await WaitlistEntry.create({ email: 'first@example.com', createdAt: new Date('2026-01-01T00:00:00Z') });

    const { count, csv } = await exportWaitlist();

    expect(count).toBe(2);
    expect(csv).toBe([
      'email,joined_at',
      'first@example.com,2026-01-01T00:00:00.000Z',
      'second@example.com,2026-02-01T00:00:00.000Z',
    ].join('\n'));
  });
});
