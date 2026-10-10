const request = require('supertest');
const { app, registerUser, createUserAndAgent, uniqueEmail, VALID_PASSWORD, TEST_ORIGIN, createAgent, User } = require('./helpers');
const emailService = require('../services/email');

describe('POST /api/auth/verify-email', () => {
  it('marks the account verified when a freshly-emailed token is consumed', async () => {
    const sendVerification = vi.spyOn(emailService, 'sendVerificationEmail');

    const { res } = await registerUser();
    const email = res.body.user.email;

    const [, rawToken] = sendVerification.mock.calls[0];
    expect(rawToken).toBeTruthy();

    const verifyRes = await request(app).post('/api/auth/verify-email').set('Origin', TEST_ORIGIN).send({ token: rawToken });
    expect(verifyRes.status).toBe(200);

    const stored = await User.findOne({ email });
    expect(stored.emailVerified).toBe(true);

    sendVerification.mockRestore();
  });

  it('rejects an already-used token', async () => {
    const sendVerification = vi.spyOn(emailService, 'sendVerificationEmail');
    await registerUser();
    const [, rawToken] = sendVerification.mock.calls[0];

    const first = await request(app).post('/api/auth/verify-email').set('Origin', TEST_ORIGIN).send({ token: rawToken });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/auth/verify-email').set('Origin', TEST_ORIGIN).send({ token: rawToken });
    expect(second.status).toBe(400);

    sendVerification.mockRestore();
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
    const sendReset = vi.spyOn(emailService, 'sendPasswordResetEmail');
    const { email } = await createUserAndAgent();

    sendReset.mockClear(); // drop any calls from registration itself (there are none, but be explicit)

    const agent = createAgent();
    await agent.post('/api/auth/request-password-reset').send({ email });

    expect(sendReset).toHaveBeenCalledTimes(1);
    sendReset.mockRestore();
  });
});

describe('POST /api/auth/reset-password', () => {
  const resetToken = async (email) => {
    const sendReset = vi.spyOn(emailService, 'sendPasswordResetEmail');
    const agent = createAgent();
    await agent.post('/api/auth/request-password-reset').send({ email });
    const [, rawToken] = sendReset.mock.calls[0];
    sendReset.mockRestore();
    return rawToken;
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
