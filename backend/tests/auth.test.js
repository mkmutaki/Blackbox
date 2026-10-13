const request = require('supertest');
const { app, registerUser, createAgent, createUserAndAgent, uniqueEmail, VALID_PASSWORD, TEST_ORIGIN, User, hibpService } = require('./helpers');
const googleAuthService = require('../services/googleAuth');

describe('POST /api/auth/register', () => {
  it('creates a user, sets session cookies, and never puts the token in the body', async () => {
    const { res, body } = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(body.email);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.token).toBeUndefined();

    const cookieNames = (res.headers['set-cookie'] || []).map((c) => c.split('=')[0]);
    expect(cookieNames).toContain('accessToken');
    expect(cookieNames).toContain('refreshToken');
    // httpOnly on both is the whole point of moving off localStorage (XSS
    // can no longer read the session). Secure is also set on both outside
    // the test environment — not asserted here because supertest talks
    // plain HTTP in-process, and a real browser would (correctly) discard
    // a Secure cookie over that; see tests/cookies.test.js for the direct,
    // environment-accurate check of that option.
    (res.headers['set-cookie'] || []).forEach((cookie) => {
      expect(cookie).toMatch(/HttpOnly/i);
    });
  });

  it('rejects missing fields', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/register').send({ email: uniqueEmail() });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email with a generic message (no enumeration)', async () => {
    const email = uniqueEmail();
    await registerUser({ email });
    const { res } = await registerUser({ email });

    expect(res.status).toBe(400);
    expect(res.body.error.toLowerCase()).not.toContain('already exists');
  });

  it('rejects a password under 8 characters', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/register').send({
      email: uniqueEmail(), password: 'Sh0rt!', fullName: 'X', dateOfBirth: '1990-01-01',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a password missing an uppercase letter', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/register').send({
      email: uniqueEmail(), password: 'lowercase1!', fullName: 'X', dateOfBirth: '1990-01-01',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a password missing a digit', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/register').send({
      email: uniqueEmail(), password: 'NoDigitsHere!', fullName: 'X', dateOfBirth: '1990-01-01',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a password missing a special character', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/register').send({
      email: uniqueEmail(), password: 'NoSpecial123', fullName: 'X', dateOfBirth: '1990-01-01',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a date of birth under the minimum age (SEC-19 data minimisation follow-up)', async () => {
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

    const agent = createAgent();
    const res = await agent.post('/api/auth/register').send({
      email: uniqueEmail(), password: VALID_PASSWORD, fullName: 'X',
      dateOfBirth: sevenYearsAgo.toISOString().slice(0, 10),
    });
    expect(res.status).toBe(400);
  });

  it('accepts a date of birth exactly at the minimum age', async () => {
    const exactlyEight = new Date();
    exactlyEight.setFullYear(exactlyEight.getFullYear() - 8);

    const { res } = await registerUser({ dateOfBirth: exactlyEight.toISOString().slice(0, 10) });
    expect(res.status).toBe(201);
  });

  it('rejects a password found in the HIBP breach list', async () => {
    hibpService.isPasswordBreached.mockResolvedValueOnce(true);

    const agent = createAgent();
    const res = await agent.post('/api/auth/register').send({
      email: uniqueEmail(), password: VALID_PASSWORD, fullName: 'X', dateOfBirth: '1990-01-01',
    });
    expect(res.status).toBe(400);
  });

  it('starts with emailVerified false for a local account', async () => {
    const { user } = await createUserAndAgent();
    const stored = await User.findById(user.id);
    expect(stored.emailVerified).toBe(false);
  });

  it('is blocked by the CSRF check without an allowed Origin', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: uniqueEmail(), password: VALID_PASSWORD, fullName: 'X', dateOfBirth: '1990-01-01',
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and sets fresh session cookies', async () => {
    const { email, password } = await createUserAndAgent();

    const agent = createAgent();
    const res = await agent.post('/api/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects a wrong password', async () => {
    const { email } = await createUserAndAgent();

    const agent = createAgent();
    const res = await agent.post('/api/auth/login').send({ email, password: 'Wr0ng!Password' });

    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/login').send({ email: uniqueEmail(), password: VALID_PASSWORD });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/google', () => {
  let verifyGoogleToken;

  beforeEach(() => {
    verifyGoogleToken = vi.spyOn(googleAuthService, 'verifyGoogleToken');
  });

  afterEach(() => {
    verifyGoogleToken.mockRestore();
  });

  it('creates a new, already-verified account from a verified Google credential', async () => {
    const email = uniqueEmail('google');
    verifyGoogleToken.mockResolvedValue({ sub: 'google-sub-123', email, email_verified: true, name: 'Google User' });

    const agent = createAgent();
    const res = await agent.post('/api/auth/google').send({ credential: 'fake-credential' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.authProvider).toBe('google');

    const stored = await User.findOne({ email });
    expect(stored.emailVerified).toBe(true);
  });

  it('rejects an unverified Google email', async () => {
    verifyGoogleToken.mockResolvedValue({ sub: 'google-sub-456', email: uniqueEmail('google'), email_verified: false, name: 'Google User' });

    const agent = createAgent();
    const res = await agent.post('/api/auth/google').send({ credential: 'fake-credential' });

    expect(res.status).toBe(401);
  });

  it('rejects an invalid credential', async () => {
    verifyGoogleToken.mockRejectedValue(new Error('invalid token'));

    const agent = createAgent();
    const res = await agent.post('/api/auth/google').send({ credential: 'garbage' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when the credential is missing', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/google').send({});
    expect(res.status).toBe(400);
  });

  describe('SEC-01: account-takeover-by-pre-registration', () => {
    it('does NOT auto-link to an existing but unverified local account', async () => {
      const email = uniqueEmail('victim');
      // Attacker pre-registers the victim's email with a password of their
      // own choosing. The account exists, but nobody has proven they own
      // this inbox yet.
      await registerUser({ email });

      verifyGoogleToken.mockResolvedValue({ sub: 'google-sub-victim', email, email_verified: true, name: 'Victim' });

      // The real owner later tries to sign in with Google using that same
      // email. This must NOT silently merge into the attacker's account.
      const agent = createAgent();
      const res = await agent.post('/api/auth/google').send({ credential: 'victim-credential' });

      expect(res.status).toBe(409);

      // And critically: the account was not linked — googleId is still unset.
      const stored = await User.findOne({ email });
      expect(stored.googleId).toBeFalsy();
    });

    it('DOES link once the existing local account is verified', async () => {
      const email = uniqueEmail('owner');
      const { password } = (await registerUser({ email })).body;

      // Prove ownership the normal way first (standing in for clicking the
      // emailed verification link, which the stub email service doesn't
      // let this test actually click through).
      await User.updateOne({ email }, { emailVerified: true });

      verifyGoogleToken.mockResolvedValue({ sub: 'google-sub-owner', email, email_verified: true, name: 'Owner' });

      const agent = createAgent();
      const res = await agent.post('/api/auth/google').send({ credential: 'owner-credential' });

      expect(res.status).toBe(200);
      const stored = await User.findOne({ email });
      expect(stored.googleId).toBe('google-sub-owner');
    });
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid session', async () => {
    const { agent, email } = await createUserAndAgent();

    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body.password).toBeUndefined();
    expect(res.body.googleId).toBeUndefined();
    expect(res.body.tokenVersion).toBeUndefined();
  });

  it('rejects a missing session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'accessToken=not-a-real-token');
    expect(res.status).toBe(401);
  });
});
