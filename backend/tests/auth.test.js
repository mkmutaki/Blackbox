const request = require('supertest');
const { app, registerUser, uniqueEmail, createUserAndToken } = require('./helpers');
const googleAuthService = require('../services/googleAuth');

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token', async () => {
    const { res, body } = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(body.email);
    expect(res.body.user.password).toBeUndefined();
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: uniqueEmail() });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    const email = uniqueEmail();
    await registerUser({ email });
    const { res } = await registerUser({ email });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const { email, password } = await createUserAndToken();

    const res = await request(app).post('/api/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(email);
  });

  it('rejects a wrong password', async () => {
    const { email } = await createUserAndToken();

    const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail(), password: 'whatever' });

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

  it('creates a new account from a verified Google credential', async () => {
    const email = uniqueEmail('google');
    verifyGoogleToken.mockResolvedValue({
      sub: 'google-sub-123',
      email,
      email_verified: true,
      name: 'Google User',
    });

    const res = await request(app).post('/api/auth/google').send({ credential: 'fake-credential' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.authProvider).toBe('google');
  });

  it('rejects an unverified Google email', async () => {
    verifyGoogleToken.mockResolvedValue({
      sub: 'google-sub-456',
      email: uniqueEmail('google'),
      email_verified: false,
      name: 'Google User',
    });

    const res = await request(app).post('/api/auth/google').send({ credential: 'fake-credential' });

    expect(res.status).toBe(401);
  });

  it('rejects an invalid credential', async () => {
    verifyGoogleToken.mockRejectedValue(new Error('invalid token'));

    const res = await request(app).post('/api/auth/google').send({ credential: 'garbage' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when the credential is missing', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const { token, email } = await createUserAndToken();

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body.password).toBeUndefined();
    expect(res.body.googleId).toBeUndefined();
  });

  it('rejects a missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
