const request = require('supertest');
const { app, createUserAndToken } = require('./helpers');

describe('GET /api/profile', () => {
  it('returns the profile for the authenticated user', async () => {
    const { token, email } = await createUserAndToken();

    const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body.password).toBeUndefined();
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/profile/update', () => {
  it('updates username and date of birth', async () => {
    const { token } = await createUserAndToken();

    const res = await request(app)
      .put('/api/profile/update')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'Ghost', dateOfBirth: '1995-05-05' });

    expect(res.status).toBe(200);
    expect(res.body.user.profile.username).toBe('Ghost');
    expect(res.body.user.profile.isProfileComplete).toBe(true);
  });

  it('rejects a missing date of birth', async () => {
    const { token } = await createUserAndToken();

    const res = await request(app)
      .put('/api/profile/update')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'Ghost' });

    expect(res.status).toBe(400);
  });

  it('rejects a future date of birth', async () => {
    const { token } = await createUserAndToken();

    const res = await request(app)
      .put('/api/profile/update')
      .set('Authorization', `Bearer ${token}`)
      .send({ dateOfBirth: '2999-01-01' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/profile/onboarding', () => {
  it('sets username, autoLockMinutes and marks onboarding complete', async () => {
    const { token } = await createUserAndToken();

    const res = await request(app)
      .post('/api/profile/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'Callsign', autoLockMinutes: 15 });

    expect(res.status).toBe(200);
    expect(res.body.user.profile.username).toBe('Callsign');
    expect(res.body.user.profile.autoLockMinutes).toBe(15);
    expect(res.body.user.profile.onboardingComplete).toBe(true);
  });

  it('rejects an invalid auto-lock interval', async () => {
    const { token } = await createUserAndToken();

    const res = await request(app)
      .post('/api/profile/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ autoLockMinutes: 999 });

    expect(res.status).toBe(400);
  });

  it('rejects an empty callsign', async () => {
    const { token } = await createUserAndToken();

    const res = await request(app)
      .post('/api/profile/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: '   ' });

    expect(res.status).toBe(400);
  });
});
