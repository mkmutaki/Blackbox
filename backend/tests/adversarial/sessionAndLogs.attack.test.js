// Phase 4 (SECURITY_HARDENING_PROMPT.md §7) — attacks on sessions and on
// what ends up in the host's logs. Each test runs the attack and asserts it
// fails; the SEC id names the fix in SECURITY_AUDIT.md.
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const request = require('supertest');
const { app, createAgent, registerUser, createUserAndAgent, uniqueEmail, VALID_PASSWORD, TEST_ORIGIN, User } = require('../helpers');
const { cookieFrom, withEnv, captureConsole } = require('./attackKit');
const emailService = require('../../services/email');
const googleAuthService = require('../../services/googleAuth');
const { JWT_ISSUER, JWT_AUDIENCE } = require('../../services/jwt');

const withAccess = (token) => (req) => req.set('Cookie', `accessToken=${token}`);

describe('SEC-33: an access token stops working the moment its session is logged out', () => {
  it('a copied access token is rejected after logout, on every protected route', async () => {
    const { agent, res } = await registerUser();
    const stolen = cookieFrom(res, 'accessToken');

    expect((await withAccess(stolen)(request(app).get('/api/videos'))).status).toBe(200);

    await agent.post('/api/auth/logout');

    for (const path of ['/api/videos', '/api/auth/me', '/api/profile']) {
      expect((await withAccess(stolen)(request(app).get(path))).status).toBe(401);
    }
  });

  it('logout still ends the session when only the access cookie is present', async () => {
    const { res } = await registerUser();
    const access = cookieFrom(res, 'accessToken');

    const logout = await request(app).post('/api/auth/logout').set('Origin', TEST_ORIGIN).set('Cookie', `accessToken=${access}`);
    expect(logout.status).toBe(200);

    expect((await withAccess(access)(request(app).get('/api/auth/me'))).status).toBe(401);
  });

  it('logging out one device leaves the user\'s other devices signed in', async () => {
    const { agent: laptop, email } = await createUserAndAgent();
    const phone = createAgent();
    expect((await phone.post('/api/auth/login').send({ email, password: VALID_PASSWORD })).status).toBe(200);

    await laptop.post('/api/auth/logout');

    expect((await laptop.get('/api/auth/me')).status).toBe(401);
    expect((await phone.get('/api/auth/me')).status).toBe(200);
  });

  it('a refreshed access token works, and dies with its session too', async () => {
    const { agent } = await createUserAndAgent();
    const refreshed = await agent.post('/api/auth/refresh');
    expect(refreshed.status).toBe(200);
    const access = cookieFrom(refreshed, 'accessToken');

    expect((await withAccess(access)(request(app).get('/api/auth/me'))).status).toBe(200);
    await agent.post('/api/auth/logout');
    expect((await withAccess(access)(request(app).get('/api/auth/me'))).status).toBe(401);
  });

  it('a correctly signed token naming no session, or a made-up session, is rejected', async () => {
    const { email } = await createUserAndAgent();
    const user = await User.findOne({ email });
    const sign = (claims) => jwt.sign(
      { userId: user._id.toString(), tokenVersion: user.tokenVersion, ...claims },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: '15m' },
    );

    expect((await withAccess(sign({}))(request(app).get('/api/auth/me'))).status).toBe(401);
    expect((await withAccess(sign({ sid: 'made-up-session' }))(request(app).get('/api/auth/me'))).status).toBe(401);
  });

  it('another user\'s live session id can\'t be borrowed', async () => {
    const victim = await createUserAndAgent();
    const attacker = await createUserAndAgent();
    const RefreshToken = require('../../models/RefreshToken');
    const victimUser = await User.findOne({ email: victim.email });
    const attackerUser = await User.findOne({ email: attacker.email });
    const { familyId: victimSid } = await RefreshToken.findOne({ userId: victimUser._id });

    // Even if the signing key leaked, a sid only counts for its own user.
    const token = jwt.sign(
      { userId: attackerUser._id.toString(), tokenVersion: attackerUser.tokenVersion, sid: victimSid },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: '15m' },
    );
    await attacker.agent.post('/api/auth/logout');

    expect((await withAccess(token)(request(app).get('/api/auth/me'))).status).toBe(401);
  });
});

describe('SEC-32: the email stub never writes live links or full addresses to logs', () => {
  const user = { email: 'victim.person@example.com' };

  it('prints neither the reset token nor the address by default', async () => {
    const logs = captureConsole();
    await withEnv({ EMAIL_STUB_PRINT_LINKS: undefined }, async () => {
      await emailService.sendPasswordResetEmail(user, 'RAW-RESET-TOKEN-123');
      await emailService.sendVerificationEmail(user, 'RAW-VERIFY-TOKEN-456');
    });
    logs.restore();

    expect(logs.text()).not.toContain('RAW-RESET-TOKEN-123');
    expect(logs.text()).not.toContain('RAW-VERIFY-TOKEN-456');
    expect(logs.text()).not.toContain('victim.person@example.com');
    expect(logs.text()).toContain('v***@example.com');
  });

  it('prints the link only when explicitly opted in for local development', async () => {
    const logs = captureConsole();
    await withEnv({ EMAIL_STUB_PRINT_LINKS: 'true' }, () => emailService.sendPasswordResetEmail(user, 'RAW-RESET-TOKEN-123'));
    logs.restore();

    expect(logs.text()).toContain('RAW-RESET-TOKEN-123');
  });

  it('a full register / reset / login lifecycle leaks no token, password or full email into logs', async () => {
    const resetSpy = vi.spyOn(emailService, 'sendPasswordResetEmail');
    const verifySpy = vi.spyOn(emailService, 'sendVerificationEmail');
    const logs = captureConsole();

    const { res, agent, body } = await registerUser();
    await agent.post('/api/auth/login').send({ email: body.email, password: 'Wr0ng!Password' });
    await agent.post('/api/auth/login').send({ email: uniqueEmail('nobody'), password: 'Wr0ng!Password' });
    await createAgent().post('/api/auth/request-password-reset').send({ email: body.email });
    await agent.post('/api/auth/refresh');

    logs.restore();
    const secrets = [
      body.email,
      body.password,
      cookieFrom(res, 'accessToken'),
      cookieFrom(res, 'refreshToken'),
      verifySpy.mock.calls[0][1],
      resetSpy.mock.calls[0][1],
    ];
    resetSpy.mockRestore();
    verifySpy.mockRestore();

    for (const secret of secrets) {
      expect(secret).toBeTruthy();
      expect(logs.text()).not.toContain(secret);
    }
  });
});

describe('SEC-36: Google credential errors are not echoed into logs', () => {
  const INJECTED = 'ATTACKER-TEXT\n{"type":"security_event","action":"login_success","actor":"forged"}';

  it('the real google-auth-library error text (which quotes the token) is not logged', async () => {
    // Skip only the certificate download; token parsing runs for real.
    const certs = vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({ certs: {}, format: 'PEM' });
    const logs = captureConsole();

    const res = await createAgent().post('/api/auth/google').send({ credential: INJECTED });

    logs.restore();
    certs.mockRestore();
    expect(res.status).toBe(401);
    expect(logs.text()).not.toContain('ATTACKER-TEXT');
    expect(logs.text()).not.toContain('"actor":"forged"');
  });

  it('a verification error carrying the payload email is not logged either', async () => {
    const verify = vi.spyOn(googleAuthService, 'verifyGoogleToken')
      .mockRejectedValue(new Error('Token used too late: {"email":"someone.real@gmail.com","name":"Someone"}'));
    const logs = captureConsole();

    await createAgent().post('/api/auth/google').send({ credential: 'x.y.z' });

    logs.restore();
    verify.mockRestore();
    expect(logs.text()).not.toContain('someone.real@gmail.com');
  });

  it('an oversized credential is refused before any parsing', async () => {
    const res = await createAgent().post('/api/auth/google').send({ credential: 'a'.repeat(5000) });
    expect(res.status).toBe(400);
  });
});

describe('SEC-38: racing duplicate registrations', () => {
  it('produce exactly one account, no 500s, and no full email in logs', async () => {
    await User.init(); // unique index on email must exist for the race to be decided by the database
    const email = uniqueEmail('race');
    const logs = captureConsole();

    const results = await Promise.all(Array.from({ length: 8 }, () =>
      createAgent().post('/api/auth/register').send({ email, password: VALID_PASSWORD, fullName: 'Racer', dateOfBirth: '1990-01-01' })));

    logs.restore();
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.every((s) => s === 201 || s === 400)).toBe(true);
    expect(await User.countDocuments({ email })).toBe(1);
    expect(logs.text()).not.toContain(email);
  });
});

describe('SEC-35: login response time does not reveal whether an account exists', () => {
  it('runs a full-cost bcrypt comparison for unknown emails and for password-less (Google) accounts', async () => {
    const dummy = vi.spyOn(User, 'compareAgainstDummyHash');

    await createAgent().post('/api/auth/login').send({ email: uniqueEmail('nobody'), password: VALID_PASSWORD });
    expect(dummy).toHaveBeenCalledTimes(1);

    await User.create({ email: uniqueEmail('g'), googleId: 'sub-timing', authProvider: 'google', emailVerified: true });
    const googleUser = await User.findOne({ googleId: 'sub-timing' });
    await createAgent().post('/api/auth/login').send({ email: googleUser.email, password: VALID_PASSWORD });
    expect(dummy).toHaveBeenCalledTimes(2);

    dummy.mockRestore();
  });

  it('measured: unknown-email and wrong-password logins take comparable time', async () => {
    const { email } = await createUserAndAgent();
    const time = async (body) => {
      const start = process.hrtime.bigint();
      await createAgent().post('/api/auth/login').send(body);
      return Number(process.hrtime.bigint() - start) / 1e6;
    };
    const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];

    const known = [];
    const unknown = [];
    for (let i = 0; i < 7; i++) {
      known.push(await time({ email, password: 'Wr0ng!Password' }));
      unknown.push(await time({ email: uniqueEmail('nobody'), password: 'Wr0ng!Password' }));
    }

    // Before the fix the unknown path skipped bcrypt entirely and ran an
    // order of magnitude faster. Loose bound so a busy CI box can't flake it.
    expect(median(unknown)).toBeGreaterThan(median(known) * 0.5);
  });
});
