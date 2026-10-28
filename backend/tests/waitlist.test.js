const request = require('supertest');
const { app, TEST_ORIGIN } = require('./helpers');
const WaitlistEntry = require('../models/WaitlistEntry');
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
