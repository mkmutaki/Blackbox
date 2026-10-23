// SECURITY_HARDENING_PROMPT.md §5.E: every route validates its input with
// zod (type-pinning, max lengths, ObjectId shape) instead of ad-hoc
// presence checks. These tests exercise the actual attack shapes the audit
// named (SEC-06, SEC-12, SEC-20) against the real middleware chain, not
// just the schemas in isolation.
const request = require('supertest');
const { app, createUserAndAgent, createAgent, uniqueEmail, VALID_PASSWORD, CURRENT_TERMS_VERSION } = require('./helpers');

describe('NoSQL operator injection (SEC-06)', () => {
  it('rejects an object-shaped email on login instead of reaching the database filter', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/login').send({ email: { $ne: null }, password: 'whatever' });
    expect(res.status).toBe(400);
  });

  it('rejects an object-shaped email on register', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/register').send({
      email: { $gt: '' }, password: VALID_PASSWORD, fullName: 'X', dateOfBirth: '1990-01-01', acceptedTermsVersion: CURRENT_TERMS_VERSION,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a regex-shaped email', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/login').send({ email: { $regex: '.*' }, password: 'whatever' });
    expect(res.status).toBe(400);
  });
});

describe('oversized fields are rejected consistently (SEC-20)', () => {
  it('rejects a full name over 100 characters on register', async () => {
    const agent = createAgent();
    const res = await agent.post('/api/auth/register').send({
      email: uniqueEmail(), password: VALID_PASSWORD, fullName: 'x'.repeat(101), dateOfBirth: '1990-01-01', acceptedTermsVersion: CURRENT_TERMS_VERSION,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a username over 32 characters on profile update (previously uncapped)', async () => {
    const { agent } = await createUserAndAgent();
    const res = await agent.put('/api/profile/update').send({ username: 'x'.repeat(33), dateOfBirth: '1990-01-01' });
    expect(res.status).toBe(400);
  });

  it('rejects a username over 32 characters on onboarding', async () => {
    const { agent } = await createUserAndAgent();
    const res = await agent.post('/api/profile/onboarding').send({ username: 'x'.repeat(33) });
    expect(res.status).toBe(400);
  });

  it('rejects a video title over 200 characters on finalize', async () => {
    const { agent } = await createUserAndAgent();
    const presignRes = await agent.post('/api/videos/presign').send({});
    const res = await agent.post('/api/videos/finalize').send({
      key: presignRes.body.key,
      iv: 'aabbccddeeff00112233445566778899',
      jwk: JSON.stringify({ kty: 'oct', k: 'x' }),
      title: 'x'.repeat(201),
    });
    expect(res.status).toBe(400);
  });
});

describe('malformed ObjectId returns 400, not 500 (SEC-12)', () => {
  it('on GET /api/videos/:id', async () => {
    const { agent } = await createUserAndAgent();
    const res = await agent.get('/api/videos/not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('on PATCH /api/videos/:id', async () => {
    const { agent } = await createUserAndAgent();
    const res = await agent.patch('/api/videos/not-a-valid-id').send({ title: 'Renamed' });
    expect(res.status).toBe(400);
  });

  it('on DELETE /api/videos/:id', async () => {
    const { agent } = await createUserAndAgent();
    const res = await agent.delete('/api/videos/not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('a well-formed but non-existent id still reaches the ownership-scoped query and 404s', async () => {
    const { agent } = await createUserAndAgent();
    const res = await agent.get('/api/videos/507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('prototype-pollution-shaped keys are stripped, not merged in (SEC-26 context)', () => {
  it('a __proto__ key in the register body does not pollute Object.prototype and registration still succeeds normally', async () => {
    const agent = createAgent();
    const email = uniqueEmail();
    const res = await agent.post('/api/auth/register').send({
      email,
      password: VALID_PASSWORD,
      fullName: 'X',
      dateOfBirth: '1990-01-01', acceptedTermsVersion: CURRENT_TERMS_VERSION,
      __proto__: { polluted: true },
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    // eslint-disable-next-line no-extend-native
    expect(({}).polluted).toBeUndefined();
  });

  it('a constructor.prototype key does not survive validation into the stored profile', async () => {
    const { agent } = await createUserAndAgent();
    const res = await agent.put('/api/profile/update').send({
      dateOfBirth: '1990-01-01',
      constructor: { prototype: { polluted: true } },
    });

    expect(res.status).toBe(200);
    // eslint-disable-next-line no-extend-native
    expect(({}).polluted).toBeUndefined();
  });
});
