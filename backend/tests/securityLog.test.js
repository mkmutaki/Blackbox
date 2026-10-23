// SECURITY_HARDENING_PROMPT.md §5.G: structured security-event logging for
// login success/failure, password change, Google linking, token reuse, and
// account deletion — redacting tokens/passwords/jwk/full emails.
const request = require('supertest');
const { logSecurityEvent, maskEmail } = require('../services/securityLog');
const { app, registerUser, createUserAndAgent, createAgent, uniqueEmail, VALID_PASSWORD, TEST_ORIGIN, User, CURRENT_TERMS_VERSION } = require('./helpers');
const emailService = require('../services/email');
const googleAuthService = require('../services/googleAuth');

const parseCookie = (setCookieHeaders, name) => {
  const line = (setCookieHeaders || []).find((c) => c.startsWith(`${name}=`));
  if (!line) return null;
  return line.split(';')[0].slice(name.length + 1);
};

// console.log also carries the (unrelated) email-stub output during
// register/reset-request — collect every call and pick out the one(s)
// that are actually structured security_event JSON for the action under
// test, rather than asserting a brittle total call count.
const securityEventsFrom = (spy, action) => spy.mock.calls
  .map(([line]) => {
    try { return JSON.parse(line); } catch { return null; }
  })
  .filter((entry) => entry?.type === 'security_event' && entry.action === action);

describe('securityLog unit behaviour', () => {
  it('maskEmail keeps only the first character of the local part', () => {
    expect(maskEmail('jordan@example.com')).toBe('j***@example.com');
  });

  it('redacts password/token/jwk/iv/credential keys in meta', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logSecurityEvent('test_event', {
      userId: 'u1',
      ip: '1.2.3.4',
      meta: { password: 'secret', jwk: '{"k":"x"}', iv: 'abc', credential: 'cred', safeField: 'kept' },
    });

    const [entry] = securityEventsFrom(spy, 'test_event');
    expect(entry.meta.password).toBe('[redacted]');
    expect(entry.meta.jwk).toBe('[redacted]');
    expect(entry.meta.iv).toBe('[redacted]');
    expect(entry.meta.credential).toBe('[redacted]');
    expect(entry.meta.safeField).toBe('kept');
    spy.mockRestore();
  });

  it('masks an email in meta instead of dropping or fully exposing it', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logSecurityEvent('test_event', { meta: { email: 'victim@example.com' } });

    const [entry] = securityEventsFrom(spy, 'test_event');
    expect(entry.meta.email).toBe('v***@example.com');
    expect(JSON.stringify(entry)).not.toContain('victim@example.com');
    spy.mockRestore();
  });
});

describe('security events wired into real auth flows', () => {
  let spy;
  beforeEach(() => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('logs login_success and login_failure', async () => {
    const { agent, email, password } = await createUserAndAgent();
    spy.mockClear();

    await agent.post('/api/auth/login').send({ email, password });
    expect(securityEventsFrom(spy, 'login_success')).toHaveLength(1);

    await createAgent().post('/api/auth/login').send({ email, password: 'Wr0ng!Password' });
    expect(securityEventsFrom(spy, 'login_failure')).toHaveLength(1);
  });

  it('logs google_link_blocked_unverified and google_link_success', async () => {
    const email = uniqueEmail('linktest');
    await createAgent().post('/api/auth/register').send({
      email, password: VALID_PASSWORD, fullName: 'X', dateOfBirth: '1990-01-01', acceptedTermsVersion: CURRENT_TERMS_VERSION,
    });

    const verifyGoogleToken = vi.spyOn(googleAuthService, 'verifyGoogleToken');
    verifyGoogleToken.mockResolvedValueOnce({ sub: 'sub-1', email, email_verified: true, name: 'X' });

    spy.mockClear();
    await createAgent().post('/api/auth/google').send({ credential: 'cred' });
    expect(securityEventsFrom(spy, 'google_link_blocked_unverified')).toHaveLength(1);

    await User.updateOne({ email }, { emailVerified: true });
    verifyGoogleToken.mockResolvedValueOnce({ sub: 'sub-1', email, email_verified: true, name: 'X' });

    spy.mockClear();
    await createAgent().post('/api/auth/google').send({ credential: 'cred' });
    expect(securityEventsFrom(spy, 'google_link_success')).toHaveLength(1);

    verifyGoogleToken.mockRestore();
  });

  it('logs refresh_token_reuse when an already-rotated refresh token is replayed', async () => {
    // Same scenario tests/session.test.js covers end-to-end: rotate once
    // legitimately, then replay the now-superseded original token — the
    // shape reuse detection exists to catch.
    const { res: registerRes } = await registerUser();
    const originalRefresh = parseCookie(registerRes.headers['set-cookie'], 'refreshToken');

    await request(app).post('/api/auth/refresh').set('Origin', TEST_ORIGIN).set('Cookie', `refreshToken=${originalRefresh}`);

    spy.mockClear();
    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', `refreshToken=${originalRefresh}`);

    expect(replay.status).toBe(401);
    expect(securityEventsFrom(spy, 'refresh_token_reuse')).toHaveLength(1);
  });

  it('logs password_change on a successful password reset', async () => {
    const { email } = await createUserAndAgent();
    const sendReset = vi.spyOn(emailService, 'sendPasswordResetEmail');

    await createAgent().post('/api/auth/request-password-reset').send({ email });
    const [, rawToken] = sendReset.mock.calls[0];
    sendReset.mockRestore();

    spy.mockClear();
    const res = await createAgent().post('/api/auth/reset-password').send({ token: rawToken, password: 'N3w!Password' });
    expect(res.status).toBe(200);
    expect(securityEventsFrom(spy, 'password_change')).toHaveLength(1);
  });

  it('logs account_deleted when an account is deleted', async () => {
    const { agent, password } = await createUserAndAgent();
    spy.mockClear();

    const res = await agent.delete('/api/auth/account').send({ password });
    expect(res.status).toBe(200);
    expect(securityEventsFrom(spy, 'account_deleted')).toHaveLength(1);
  });
});
