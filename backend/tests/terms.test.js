// Terms of Service / Privacy Policy acceptance (services/legal.js): no
// account is created without it, accounts that predate it are asked once,
// and recording new entries is blocked server-side until they accept.
const { createAgent, createUserAndAgent, registerUser, uniqueEmail, User, CURRENT_TERMS_VERSION, GOOGLE_SIGNUP } = require('./helpers');
const AuditLog = require('../models/AuditLog');
const googleAuthService = require('../services/googleAuth');

const presign = (agent) =>
  agent.post('/api/videos/presign').send({ contentType: 'application/octet-stream', contentLength: 17 });

const yearsAgo = (years) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
};

// Simulates an account created before acceptance was recorded (or one that
// accepted a version that has since been replaced).
const makeLegacy = (email, version = null) =>
  User.updateOne({ email }, { $set: { 'termsAcceptance.version': version, 'termsAcceptance.acceptedAt': null } });

describe('terms acceptance at email registration', () => {
  it('is required: no acceptance, no account', async () => {
    const email = uniqueEmail();
    const { res } = await registerUser({ email, acceptedTermsVersion: undefined });

    expect(res.status).toBe(400);
    expect(await User.exists({ email })).toBeNull();
  });

  it('refuses a stale version with a code the frontend can act on', async () => {
    const email = uniqueEmail();
    const { res } = await registerUser({ email, acceptedTermsVersion: '2000-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');
    expect(await User.exists({ email })).toBeNull();
  });

  it('records the version, the time, and an audit entry', async () => {
    const before = Date.now();
    const { res, body } = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.user.termsAcceptanceRequired).toBe(false);

    const stored = await User.findOne({ email: body.email });
    expect(stored.termsAcceptance.version).toBe(CURRENT_TERMS_VERSION);
    expect(stored.termsAcceptance.acceptedAt.getTime()).toBeGreaterThanOrEqual(before);

    const entry = await AuditLog.findOne({ action: 'terms_accepted', targetId: String(stored._id) });
    expect(entry.meta).toEqual({ version: CURRENT_TERMS_VERSION, via: 'register' });
  });

  it('rejects a 12-year-old', async () => {
    const email = uniqueEmail();
    const { res } = await registerUser({ email, dateOfBirth: yearsAgo(12) });

    expect(res.status).toBe(400);
    expect(await User.exists({ email })).toBeNull();
  });
});

describe('terms acceptance at Google sign-up', () => {
  let verifyGoogleToken;
  let email;

  beforeEach(() => {
    email = uniqueEmail('google');
    verifyGoogleToken = vi.spyOn(googleAuthService, 'verifyGoogleToken')
      .mockResolvedValue({ sub: `sub-${email}`, email, email_verified: true, name: 'G User' });
  });

  afterEach(() => {
    verifyGoogleToken.mockRestore();
  });

  it('stores nothing for a new identity until it sends a date of birth and acceptance', async () => {
    const res = await createAgent().post('/api/auth/google').send({ credential: 'cred' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SIGNUP_DETAILS_REQUIRED');
    expect(await User.exists({ email })).toBeNull();
  });

  it('rejects an under-age date of birth without creating the account', async () => {
    const res = await createAgent().post('/api/auth/google')
      .send({ credential: 'cred', ...GOOGLE_SIGNUP, dateOfBirth: yearsAgo(12) });

    expect(res.status).toBe(400);
    expect(await User.exists({ email })).toBeNull();
  });

  it('refuses a stale version', async () => {
    const res = await createAgent().post('/api/auth/google')
      .send({ credential: 'cred', ...GOOGLE_SIGNUP, acceptedTermsVersion: '2000-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');
    expect(await User.exists({ email })).toBeNull();
  });

  it('creates a complete profile with the acceptance recorded', async () => {
    const res = await createAgent().post('/api/auth/google').send({ credential: 'cred', ...GOOGLE_SIGNUP });

    expect(res.status).toBe(200);
    expect(res.body.user.termsAcceptanceRequired).toBe(false);
    expect(res.body.user.profile.isProfileComplete).toBe(true);

    const stored = await User.findOne({ email });
    expect(stored.profile.dateOfBirth.toISOString().slice(0, 10)).toBe(GOOGLE_SIGNUP.dateOfBirth);
    expect(stored.termsAcceptance.version).toBe(CURRENT_TERMS_VERSION);
    expect(await AuditLog.exists({ action: 'terms_accepted', targetId: String(stored._id), 'meta.via': 'google_signup' })).not.toBeNull();
  });

  it('signs an existing Google account straight in without asking again', async () => {
    await createAgent().post('/api/auth/google').send({ credential: 'cred', ...GOOGLE_SIGNUP });

    const res = await createAgent().post('/api/auth/google').send({ credential: 'cred' });
    expect(res.status).toBe(200);
  });
});

describe('accounts that have not accepted the current terms', () => {
  it('are told so, can still read their entries, but cannot record new ones', async () => {
    const { agent, email } = await createUserAndAgent();
    await makeLegacy(email);

    const me = await agent.get('/api/auth/me');
    expect(me.body.termsAcceptanceRequired).toBe(true);

    expect((await agent.get('/api/videos')).status).toBe(200);

    const blocked = await presign(agent);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');

    const finalize = await agent.post('/api/videos/finalize').send({ key: 'k', iv: 'iv', jwk: '{}', title: 't' });
    expect(finalize.status).toBe(403);
    expect(finalize.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');
  });

  it('a superseded version counts as not accepted', async () => {
    const { agent, email } = await createUserAndAgent();
    await makeLegacy(email, '2000-01-01');

    expect((await agent.get('/api/auth/me')).body.termsAcceptanceRequired).toBe(true);
    expect((await presign(agent)).status).toBe(403);
  });

  it('can accept, after which recording works again', async () => {
    const { agent, email } = await createUserAndAgent();
    await makeLegacy(email);

    const res = await agent.post('/api/auth/accept-terms').send({ acceptedTermsVersion: CURRENT_TERMS_VERSION });
    expect(res.status).toBe(200);
    expect(res.body.user.termsAcceptanceRequired).toBe(false);

    const stored = await User.findOne({ email });
    expect(stored.termsAcceptance.version).toBe(CURRENT_TERMS_VERSION);
    expect(await AuditLog.exists({ action: 'terms_accepted', targetId: String(stored._id), 'meta.via': 'prompt' })).not.toBeNull();

    expect((await presign(agent)).status).toBe(200);
  });

  it('cannot accept a stale version', async () => {
    const { agent, email } = await createUserAndAgent();
    await makeLegacy(email);

    const res = await agent.post('/api/auth/accept-terms').send({ acceptedTermsVersion: '2000-01-01' });
    expect(res.status).toBe(400);
    expect((await User.findOne({ email })).termsAcceptance.version).toBeNull();
  });

  it('cannot accept when the account belongs to someone under the minimum age', async () => {
    // Possible only for accounts created while the minimum age was 8.
    const { agent, email } = await createUserAndAgent();
    await makeLegacy(email);
    await User.updateOne({ email }, { $set: { 'profile.dateOfBirth': new Date(yearsAgo(10)) } });

    const res = await agent.post('/api/auth/accept-terms').send({ acceptedTermsVersion: CURRENT_TERMS_VERSION });
    expect(res.status).toBe(403);
    expect((await presign(agent)).status).toBe(403);
  });

  it('accept-terms requires a session', async () => {
    const res = await createAgent().post('/api/auth/accept-terms').send({ acceptedTermsVersion: CURRENT_TERMS_VERSION });
    expect(res.status).toBe(401);
  });
});
