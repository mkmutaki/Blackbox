// Email delivery: the Resend client (fetch is mocked; nothing leaves the
// process) and the outbox worker that makes sends survive provider
// failures, restarts and multiple server instances.
const {
  createUserAndAgent, createAgent, registerUser, uniqueEmail, User, deliverEmails, linkTokenFrom,
} = require('./helpers');
const { withEnv, captureConsole } = require('./adversarial/attackKit');
const EmailJob = require('../models/EmailJob');
const ActionToken = require('../models/ActionToken');
const emailProvider = require('../services/emailProvider');
const { EmailSendError } = emailProvider;
const { claimNextJob, drainEmailQueue, requeueFailedVerificationEmails, KINDS, LEASE_MS } = require('../services/emailQueue');
const { deriveActionToken, hashToken } = require('../services/tokens');
const { deleteUserAccount } = require('../services/accountDeletion');
const { summarizeFailedEmails } = require('../scripts/requeueEmails');
const { validateEnv } = require('../validateEnv');

// Every worker line goes through console.log; keep test output readable.
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const MINUTE = 60 * 1000;

// Mocks the provider for one drain and returns what it was asked to send.
const drainWith = async (impl) => {
  const send = vi.spyOn(emailProvider, 'sendEmail').mockImplementation(impl);
  await drainEmailQueue();
  const calls = send.mock.calls.map(([message]) => message);
  send.mockRestore();
  return calls;
};

const retryable = (code, retryAfterMs = null) => new EmailSendError(code, { retryable: true, retryAfterMs });

// Makes a job due now, as if its retry delay had passed.
const makeDue = (job) => EmailJob.updateOne({ _id: job._id }, { $set: { runAt: new Date(Date.now() - 1000) } });

describe('Resend client', () => {
  const ENV = { RESEND_API_KEY: 're_test_not_a_real_key', EMAIL_FROM: 'Blackbox <no-reply@mail.example.com>', EMAIL_REPLY_TO: 'hello@example.com' };
  const MESSAGE = { to: 'person@example.com', subject: 'Subject', text: 'Text', html: '<p>Html</p>', idempotencyKey: 'email-job-123' };

  const respond = (status, body, headers = {}) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers })));

  afterEach(() => vi.unstubAllGlobals());

  const send = () => withEnv(ENV, () => emailProvider.sendEmail(MESSAGE));
  const sendError = async () => {
    try {
      await send();
    } catch (err) {
      return err;
    }
    throw new Error('expected the send to fail');
  };

  it('posts the message with auth, an idempotency key and a User-Agent, and returns the message id', async () => {
    respond(200, { id: 'resend-id-1' });

    expect(await send()).toEqual({ id: 'resend-id-1' });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer re_test_not_a_real_key',
      'Idempotency-Key': 'email-job-123',
      'User-Agent': 'blackbox-backend',
    });
    expect(JSON.parse(init.body)).toEqual({
      from: ENV.EMAIL_FROM,
      to: ['person@example.com'],
      subject: 'Subject',
      text: 'Text',
      html: '<p>Html</p>',
      reply_to: 'hello@example.com',
    });
  });

  it('marks a rate limit as retryable, honouring retry-after', async () => {
    respond(429, { name: 'rate_limit_exceeded', message: 'Too many requests' }, { 'retry-after': '3' });
    const err = await sendError();
    expect(err).toBeInstanceOf(EmailSendError);
    expect(err).toMatchObject({ code: 'rate_limit_exceeded', retryable: true, retryAfterMs: 3000 });
  });

  it.each([
    [500, 'application_error', true],
    [503, 'service_unavailable', true],
    [409, 'concurrent_idempotent_requests', true],
    [429, 'daily_quota_exceeded', true],
    [401, 'validation_error', true], // bad key: every send fails until it's fixed, so keep the queue
    [403, 'validation_error', true], // unverified sending domain, same
    [422, 'validation_error', false],
    [400, 'validation_error', false],
    [409, 'invalid_idempotent_request', false],
  ])('classifies %i %s as retryable=%s', async (status, name, expected) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    respond(status, { name, message: 'details' });
    const err = await sendError();
    expect(err).toMatchObject({ code: name, retryable: expected, status });
  });

  it('treats a network failure as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(await sendError()).toMatchObject({ code: 'network_error', retryable: true });
  });

  it("never carries the provider's message, which can quote the recipient", async () => {
    respond(422, { name: 'validation_error', message: 'Invalid `to` field: person@example.com' });
    const err = await sendError();
    expect(err.message).not.toContain('person@example.com');
    expect(err.code).toBe('validation_error');
  });
});

describe('email outbox', () => {
  it('queues a job at registration and sends a link that verifies the account', async () => {
    const { res } = await registerUser();
    const email = res.body.user.email;

    // Nothing is sent, and no token exists, until the worker runs.
    const [queued] = await EmailJob.find({});
    expect(queued).toMatchObject({ kind: 'email_verify', status: 'pending', email: null });
    expect(await ActionToken.countDocuments()).toBe(0);

    const [message] = await deliverEmails();
    expect(message.to).toBe(email);
    expect(message.idempotencyKey).toBe(`email-job-${queued._id}`);
    expect(message.html).toContain('/verify-email?token=');

    const job = await EmailJob.findById(queued._id);
    expect(job).toMatchObject({ status: 'sent', attempts: 1, providerMessageId: 'test-message-id' });
    expect(job.purgeAt.getTime()).toBeGreaterThan(Date.now());

    // The emailed token is the derived one, and only its hash is stored.
    const rawToken = linkTokenFrom(message);
    expect(rawToken).toBe(deriveActionToken(queued._id));
    const stored = await ActionToken.findOne({ tokenHash: hashToken(rawToken) });
    expect(stored.purpose).toBe('email_verify');
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + KINDS.email_verify.linkTtlMs - MINUTE);

    expect((await createAgent().post('/api/auth/verify-email').send({ token: rawToken })).status).toBe(200);
    expect((await User.findOne({ email })).emailVerified).toBe(true);
  });

  it('retries a failed send with the identical message and idempotency key', async () => {
    await registerUser();

    const first = await drainWith(() => Promise.reject(retryable('service_unavailable')));
    const job = await EmailJob.findOne({});
    expect(job).toMatchObject({ status: 'pending', attempts: 1, lastError: 'service_unavailable' });
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());

    // Not due yet: a drain right now sends nothing.
    expect(await drainWith(() => Promise.resolve({ id: 'x' }))).toHaveLength(0);

    await makeDue(job);
    const second = await drainWith(() => Promise.resolve({ id: 'x' }));
    expect(second).toEqual(first);
    expect((await EmailJob.findById(job._id)).status).toBe('sent');
  });

  it("waits as long as the provider's retry-after asks", async () => {
    await registerUser();
    await drainWith(() => Promise.reject(retryable('rate_limit_exceeded', 10 * MINUTE)));
    const job = await EmailJob.findOne({});
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now() + 9 * MINUTE);
  });

  it('retries failures that are not provider errors (e.g. a database blip)', async () => {
    await registerUser();
    vi.spyOn(ActionToken, 'updateOne').mockRejectedValueOnce(new Error('connection reset'));
    await drainWith(() => Promise.resolve({ id: 'x' }));
    expect(await EmailJob.findOne({})).toMatchObject({ status: 'pending', lastError: 'Error' });
  });

  it('marks a non-retryable failure failed and leaves it alone afterwards', async () => {
    await registerUser();
    await drainWith(() => Promise.reject(new EmailSendError('validation_error', { retryable: false })));
    const job = await EmailJob.findOne({});
    expect(job).toMatchObject({ status: 'failed', lastError: 'validation_error' });
    expect(job.purgeAt).toBeTruthy();

    expect(await drainWith(() => Promise.resolve({ id: 'x' }))).toHaveLength(0);
  });

  it('gives up once the next retry would fall past the deadline', async () => {
    await registerUser();
    await EmailJob.updateOne({}, { $set: { giveUpAt: new Date(Date.now() + 1000) } });
    await drainWith(() => Promise.reject(retryable('service_unavailable')));
    expect(await EmailJob.findOne({})).toMatchObject({ status: 'failed', lastError: 'service_unavailable' });
  });

  it('does not send a job whose deadline has already passed', async () => {
    await registerUser();
    await EmailJob.updateOne({}, { $set: { giveUpAt: new Date(Date.now() - 1000) } });
    expect(await drainWith(() => Promise.resolve({ id: 'x' }))).toHaveLength(0);
    expect(await EmailJob.findOne({})).toMatchObject({ status: 'failed', lastError: 'expired' });
  });

  it('reclaims a job whose worker died mid-send, but not one still leased', async () => {
    await registerUser();
    await registerUser();
    const [stale, live] = await EmailJob.find({}).sort({ createdAt: 1 });
    await EmailJob.updateOne({ _id: stale._id }, { $set: { status: 'sending', attempts: 1, lockedUntil: new Date(Date.now() - 1000) } });
    await EmailJob.updateOne({ _id: live._id }, { $set: { status: 'sending', attempts: 1, lockedUntil: new Date(Date.now() + LEASE_MS) } });

    const sent = await drainWith(() => Promise.resolve({ id: 'x' }));
    expect(sent.map((message) => message.idempotencyKey)).toEqual([`email-job-${stale._id}`]);
    expect((await EmailJob.findById(stale._id)).attempts).toBe(2);
    expect((await EmailJob.findById(live._id)).status).toBe('sending');
  });

  it('hands each job to exactly one claimer when several compete', async () => {
    for (let i = 0; i < 5; i += 1) await registerUser();
    const claims = await Promise.all(Array.from({ length: 12 }, () => claimNextJob()));
    const claimed = claims.filter(Boolean).map((job) => String(job._id));
    expect(claimed).toHaveLength(5);
    expect(new Set(claimed).size).toBe(5);
  });

  it('cancels a verification email for an account verified or deleted since', async () => {
    const verified = await registerUser();
    await User.updateOne({ email: verified.body.email }, { $set: { emailVerified: true } });
    const deleted = await registerUser();
    await User.deleteOne({ email: deleted.body.email });

    expect(await drainWith(() => Promise.resolve({ id: 'x' }))).toHaveLength(0);
    const reasons = (await EmailJob.find({})).map((job) => [job.status, job.lastError]).sort();
    expect(reasons).toEqual([['cancelled', 'already_verified'], ['cancelled', 'no_account']]);
  });

  it('still registers the account when the email cannot be queued', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(EmailJob, 'create').mockRejectedValueOnce(new Error('db down'));

    const { res, body } = await registerUser();
    expect(res.status).toBe(201);
    expect(await User.exists({ email: body.email })).toBeTruthy();
    expect(errors.mock.calls.flat().join('\n')).toContain('could not queue verification email');
  });

  it('removes queued emails along with the account', async () => {
    const { user } = await createUserAndAgent();
    expect(await EmailJob.countDocuments({ userId: user.id })).toBe(1);
    await deleteUserAccount(user.id);
    expect(await EmailJob.countDocuments({ userId: user.id })).toBe(0);
  });

  it('logs job ids and outcomes, never addresses or links', async () => {
    const logs = captureConsole();
    const { body } = await registerUser();
    await createAgent().post('/api/auth/request-password-reset').send({ email: body.email });
    const sent = await drainWith(() => Promise.resolve({ id: 'x' }));
    logs.restore();

    expect(logs.text()).toContain('kind=email_verify');
    expect(logs.text()).not.toContain(body.email);
    for (const message of sent) expect(logs.text()).not.toContain(linkTokenFrom(message));
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('queues a new verification email for an unverified account, once while one is waiting', async () => {
    const { agent, user } = await createUserAndAgent();
    await deliverEmails(); // the one from registration

    expect((await agent.post('/api/auth/resend-verification')).status).toBe(200);
    expect((await agent.post('/api/auth/resend-verification')).status).toBe(200);
    expect(await EmailJob.countDocuments({ userId: user.id, status: 'pending' })).toBe(1);

    const [message] = await deliverEmails();
    expect(message.to).toBe(user.email);
    expect((await createAgent().post('/api/auth/verify-email').send({ token: linkTokenFrom(message) })).status).toBe(200);
  });

  it('queues nothing for an already-verified account', async () => {
    const { agent, user } = await createUserAndAgent();
    await deliverEmails();
    await User.updateOne({ _id: user.id }, { $set: { emailVerified: true } });

    const res = await agent.post('/api/auth/resend-verification');
    expect(res.status).toBe(200);
    expect(await EmailJob.countDocuments({ status: 'pending' })).toBe(0);
  });

  it('requires a signed-in user', async () => {
    expect((await createAgent().post('/api/auth/resend-verification')).status).toBe(401);
  });
});

describe('requeueing failed emails (scripts/requeueEmails.js)', () => {
  it('reports failures by kind and reason, and requeues only verification emails', async () => {
    await registerUser();
    const { email } = await createUserAndAgent();
    await deliverEmails();
    await createAgent().post('/api/auth/request-password-reset').send({ email });
    await EmailJob.updateMany({}, { $set: { status: 'failed', lastError: 'service_unavailable' } });

    const summary = await summarizeFailedEmails();
    expect(summary.map(({ _id, count }) => [_id.kind, _id.lastError, count]).sort()).toEqual([
      ['email_verify', 'service_unavailable', 2],
      ['password_reset', 'service_unavailable', 1],
    ]);

    expect(await requeueFailedVerificationEmails()).toBe(2);
    expect(await EmailJob.countDocuments({ kind: 'email_verify', status: 'pending', attempts: 0 })).toBe(2);
    expect(await EmailJob.countDocuments({ kind: 'password_reset', status: 'failed' })).toBe(1);

    // Requeued jobs go out on the next drain, with the same link as before.
    expect(await deliverEmails()).toHaveLength(2);
  });
});

describe('startup env validation for email', () => {
  const BASE_ENV = {
    MONGO_URI: 'mongodb://localhost:27017/',
    JWT_SECRET: process.env.JWT_SECRET,
    GOOGLE_CLIENT_ID: 'id',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'id',
    AWS_SECRET_ACCESS_KEY: 'secret',
    S3_BUCKET_NAME: 'bucket',
  };

  const run = (vars) => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const saved = { ...process.env };
    // Only the vars given, so an email setting in the shell can't leak in.
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, BASE_ENV, vars);
    try {
      validateEnv();
      return { ok: true };
    } catch {
      return { ok: false, output: errors.mock.calls.flat().join('\n') };
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, saved);
      exit.mockRestore();
      errors.mockRestore();
    }
  };

  it('accepts no email settings at all (stubbed email)', () => {
    expect(run({}).ok).toBe(true);
  });

  it('requires a sender and a link target once a Resend key is set', () => {
    const result = run({ RESEND_API_KEY: 're_test_not_a_real_key' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('EMAIL_FROM');
    expect(result.output).toContain('FRONTEND_URL');
    expect(result.output).not.toContain('re_test_not_a_real_key');
  });

  it('accepts a complete Resend configuration', () => {
    expect(run({
      RESEND_API_KEY: 're_test_not_a_real_key',
      EMAIL_FROM: 'Blackbox <no-reply@mail.example.com>',
      FRONTEND_URL: 'https://example.com',
      EMAIL_REPLY_TO: 'hello@example.com',
    }).ok).toBe(true);
  });
});

// Address shape for the unknown-address reset case lives in
// passwordFlows.test.js; this checks nothing about it leaks to the provider.
describe('password reset for an address with no account', () => {
  it('sends nothing and keeps nothing', async () => {
    await createAgent().post('/api/auth/request-password-reset').send({ email: uniqueEmail('nobody') });
    expect(await drainWith(() => Promise.resolve({ id: 'x' }))).toHaveLength(0);
    expect(await EmailJob.countDocuments()).toBe(0);
  });
});
