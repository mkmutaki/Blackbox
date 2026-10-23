// SECURITY_HARDENING_PROMPT.md §6.1: `role` is settable only by a direct
// database operation or the bootstrap script — never through HTTP. The
// route allowlists already guarantee this; these tests lock it in so a
// future route can't quietly regress it.
const { createAgent, createUserAndAgent, uniqueEmail, VALID_PASSWORD, User, CURRENT_TERMS_VERSION, GOOGLE_SIGNUP } = require('./helpers');
const googleAuthService = require('../services/googleAuth');

// Every shape a client might try: a top-level field, a nested one, and a
// raw Mongo update operator.
const ESCALATION_FIELDS = {
  role: 'admin',
  profile: { role: 'admin' },
  $set: { role: 'admin' },
};

const roleOf = async (email) => (await User.findOne({ email }).select('role')).role;

describe('User.role', () => {
  it('defaults to "user" for a new account', async () => {
    const { email } = await createUserAndAgent();
    expect(await roleOf(email)).toBe('user');
  });

  it('rejects values outside the enum at the schema level', async () => {
    const user = new User({ email: uniqueEmail(), password: 'x', role: 'superuser' });
    await expect(user.validate()).rejects.toThrow();
  });

  it('cannot be set at registration', async () => {
    const email = uniqueEmail();
    const res = await createAgent().post('/api/auth/register').send({
      email, password: VALID_PASSWORD, fullName: 'Mallory', dateOfBirth: '1990-01-01', acceptedTermsVersion: CURRENT_TERMS_VERSION, ...ESCALATION_FIELDS,
    });

    expect(res.status).toBe(201);
    expect(await roleOf(email)).toBe('user');
  });

  it('cannot be set on Google sign-up', async () => {
    const email = uniqueEmail('google');
    const spy = vi.spyOn(googleAuthService, 'verifyGoogleToken')
      .mockResolvedValueOnce({ sub: 'sub-role', email, email_verified: true, name: 'G' });

    const res = await createAgent().post('/api/auth/google').send({ credential: 'cred', ...GOOGLE_SIGNUP, ...ESCALATION_FIELDS });
    spy.mockRestore();

    expect(res.status).toBe(200);
    expect(await roleOf(email)).toBe('user');
  });

  it('cannot be set via PUT /api/profile/update', async () => {
    const { agent, email } = await createUserAndAgent();
    const res = await agent.put('/api/profile/update').send({ dateOfBirth: '1990-01-01', ...ESCALATION_FIELDS });

    expect(res.status).toBe(200);
    expect(await roleOf(email)).toBe('user');
  });

  it('cannot be set via POST /api/profile/onboarding', async () => {
    const { agent, email } = await createUserAndAgent();
    const res = await agent.post('/api/profile/onboarding').send({ username: 'mallory', ...ESCALATION_FIELDS });

    expect(res.status).toBe(200);
    expect(await roleOf(email)).toBe('user');
  });

  it('is never returned in an auth or profile response, even for an admin', async () => {
    const { agent, email } = await createUserAndAgent();
    await User.updateOne({ email }, { role: 'admin' });

    const me = await agent.get('/api/auth/me');
    const profile = await agent.get('/api/profile');

    expect(me.status).toBe(200);
    expect(me.body).not.toHaveProperty('role');
    expect(profile.body).not.toHaveProperty('role');
  });
});
