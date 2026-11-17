const request = require('supertest');
const {
  app, registerUser, createUserAndAgent, uniqueEmail, VALID_PASSWORD, TEST_ORIGIN, createAgent, User, hibpService,
  deliverEmails, deliverLinkToken,
} = require('./helpers');
const EmailJob = require('../models/EmailJob');

describe('POST /api/auth/verify-email', () => {
  it('marks the account verified when a freshly-emailed token is consumed', async () => {
    const { res } = await registerUser();
    const email = res.body.user.email;

    const rawToken = await deliverLinkToken('/verify-email');
    expect(rawToken).toBeTruthy();

    const verifyRes = await request(app).post('/api/auth/verify-email').set('Origin', TEST_ORIGIN).send({ token: rawToken });
    expect(verifyRes.status).toBe(200);

    const stored = await User.findOne({ email });
    expect(stored.emailVerified).toBe(true);
  });

  it('rejects an already-used token', async () => {
    await registerUser();
    const rawToken = await deliverLinkToken('/verify-email');

    const first = await request(app).post('/api/auth/verify-email').set('Origin', TEST_ORIGIN).send({ token: rawToken });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/auth/verify-email').set('Origin', TEST_ORIGIN).send({ token: rawToken });
    expect(second.status).toBe(400);
  });

  it('rejects an unknown token', async () => {
    const res = await request(app).post('/api/auth/verify-email').set('Origin', TEST_ORIGIN).send({ token: 'not-a-real-token' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/request-password-reset', () => {
  it('returns the same response whether or not the email has an account (no enumeration — SEC-10)', async () => {
    const { email } = await createUserAndAgent();

    const agent1 = createAgent();
    const existing = await agent1.post('/api/auth/request-password-reset').send({ email });

    const agent2 = createAgent();
    const nonExistent = await agent2.post('/api/auth/request-password-reset').send({ email: uniqueEmail('nobody') });

    expect(existing.status).toBe(nonExistent.status);
    expect(existing.body).toEqual(nonExistent.body);
  });

  it('emails a reset link only when the account actually exists', async () => {
    const { email } = await createUserAndAgent();
    await deliverEmails(); // the verification email from registration

    await createAgent().post('/api/auth/request-password-reset').send({ email });
    await createAgent().post('/api/auth/request-password-reset').send({ email: uniqueEmail('nobody') });

    // Both requests queued a job: the request itself never checks whether
    // the account exists, so it takes the same time either way.
    expect(await EmailJob.countDocuments({ kind: 'password_reset' })).toBe(2);

    const sent = await deliverEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].text).toContain('/reset-password?token=');

    // The job for the unknown address is gone, address and all.
    expect(await EmailJob.countDocuments({ kind: 'password_reset' })).toBe(1);
    const remaining = await EmailJob.find({}).lean();
    expect(remaining.every((job) => job.email === null)).toBe(true);
  });

  it('matches the account however the address is capitalised', async () => {
    const { email } = await createUserAndAgent();
    await deliverEmails();

    await createAgent().post('/api/auth/request-password-reset').send({ email: `  ${email.toUpperCase()} ` });

    const sent = await deliverEmails();
    expect(sent.map((message) => message.to)).toEqual([email]);
  });

  it('queues nothing for input that is not an email address, with the same response', async () => {
    const res = await createAgent().post('/api/auth/request-password-reset').send({ email: { $ne: null } });
    expect(res.status).toBe(200);
    expect(await EmailJob.countDocuments({ kind: 'password_reset' })).toBe(0);
  });
});

describe('POST /api/auth/reset-password', () => {
  const resetToken = async (email) => {
    await createAgent().post('/api/auth/request-password-reset').send({ email });
    return deliverLinkToken('/reset-password');
  };

  it('sets a new password, verifies the email, and logs out every existing session', async () => {
    const { agent, email } = await createUserAndAgent();

    // The old session works right now.
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const rawToken = await resetToken(email);
    const newPassword = 'N3w!Password';

    const resetAgent = createAgent();
    const resetRes = await resetAgent.post('/api/auth/reset-password').send({ token: rawToken, password: newPassword });
    expect(resetRes.status).toBe(200);

    // The pre-reset session is dead — this is the point: a reset should
    // kick out anyone else (e.g. an attacker who set the original
    // password) who was already logged in.
    const meAfterReset = await agent.get('/api/auth/me');
    expect(meAfterReset.status).toBe(401);

    // The reset also counts as proof of inbox ownership.
    const stored = await User.findOne({ email });
    expect(stored.emailVerified).toBe(true);

    // And the new password actually works.
    const loginAgent = createAgent();
    const loginRes = await loginAgent.post('/api/auth/login').send({ email, password: newPassword });
    expect(loginRes.status).toBe(200);
  });

  it('rejects a weak new password', async () => {
    const { email } = await createUserAndAgent();
    const rawToken = await resetToken(email);

    const agent = createAgent();
    const res = await agent.post('/api/auth/reset-password').send({ token: rawToken, password: 'weak' });
    expect(res.status).toBe(400);
  });

  it('warns about a breached new password without using up the reset link', async () => {
    const { email } = await createUserAndAgent();
    const rawToken = await resetToken(email);
    hibpService.isPasswordBreached.mockResolvedValueOnce(true);

    const agent = createAgent();
    const warned = await agent.post('/api/auth/reset-password').send({ token: rawToken, password: 'N3w!Password' });
    expect(warned.status).toBe(400);
    expect(warned.body.code).toBe('PASSWORD_BREACHED');

    // The same link still works for a different password.
    const retry = await agent.post('/api/auth/reset-password').send({ token: rawToken, password: 'An0ther!Password' });
    expect(retry.status).toBe(200);
  });

  it('accepts a breached new password when the user chose to keep it', async () => {
    const { email } = await createUserAndAgent();
    const rawToken = await resetToken(email);
    hibpService.isPasswordBreached.mockResolvedValue(true);

    const agent = createAgent();
    const res = await agent.post('/api/auth/reset-password').send({ token: rawToken, password: 'N3w!Password', acceptBreachedPassword: true });
    hibpService.isPasswordBreached.mockResolvedValue(false);
    expect(res.status).toBe(200);

    const loginRes = await createAgent().post('/api/auth/login').send({ email, password: 'N3w!Password' });
    expect(loginRes.status).toBe(200);
  });

  it('rejects an already-used reset token', async () => {
    const { email } = await createUserAndAgent();
    const rawToken = await resetToken(email);

    const agent1 = createAgent();
    const first = await agent1.post('/api/auth/reset-password').send({ token: rawToken, password: 'N3w!Password1' });
    expect(first.status).toBe(200);

    const agent2 = createAgent();
    const second = await agent2.post('/api/auth/reset-password').send({ token: rawToken, password: 'An0ther!Password' });
    expect(second.status).toBe(400);
  });

  it('rejects an unknown token', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/reset-password').send({ token: 'not-a-real-token', password: VALID_PASSWORD });
    expect(res.status).toBe(400);
  });
});
