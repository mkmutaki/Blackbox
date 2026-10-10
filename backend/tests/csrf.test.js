const request = require('supertest');
const { app, TEST_ORIGIN } = require('./helpers');

describe('CSRF Origin allowlist', () => {
  it('allows a state-changing request from an allowed Origin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'nobody@example.com', password: 'whatever' });

    // 401 (bad credentials) proves it passed the CSRF gate and reached the
    // real handler, rather than being blocked at 403.
    expect(res.status).not.toBe(403);
  });

  it('blocks a state-changing request from a disallowed Origin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example.com')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).toBe(403);
  });

  it('blocks a state-changing request with neither Origin nor Referer', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever' });
    expect(res.status).toBe(403);
  });

  it('falls back to an allowed Referer when Origin is absent', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Referer', `${TEST_ORIGIN}/login`)
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).not.toBe(403);
  });

  it('blocks a disallowed Referer when Origin is absent', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Referer', 'https://evil.example.com/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).toBe(403);
  });

  it('never blocks GET requests regardless of Origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(200);
  });
});
