const request = require('supertest');
const { app, registerUser, createUserAndAgent, TEST_ORIGIN } = require('./helpers');

const parseCookie = (setCookieHeaders, name) => {
  const line = (setCookieHeaders || []).find((c) => c.startsWith(`${name}=`));
  if (!line) return null;
  return line.split(';')[0].slice(name.length + 1);
};

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const { agent } = await createUserAndAgent();

    const refreshRes = await agent.post('/api/auth/refresh');
    expect(refreshRes.status).toBe(200);

    const setCookies = refreshRes.headers['set-cookie'] || [];
    expect(setCookies.some((c) => c.startsWith('accessToken='))).toBe(true);
    expect(setCookies.some((c) => c.startsWith('refreshToken='))).toBe(true);

    // The agent's jar now holds the rotated cookies — normal use still works.
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', 'refreshToken=not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects when no refresh token cookie is present', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(401);
  });

  describe('reuse detection', () => {
    it('revokes the whole family — including a currently-live access token — when a rotated-away refresh token is replayed', async () => {
      const { res: registerRes } = await registerUser();
      const originalRefresh = parseCookie(registerRes.headers['set-cookie'], 'refreshToken');
      const originalAccess = parseCookie(registerRes.headers['set-cookie'], 'accessToken');

      // Legitimate rotation: the real client uses the original token once.
      const firstRefresh = await request(app)
        .post('/api/auth/refresh')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', `refreshToken=${originalRefresh}`);
      expect(firstRefresh.status).toBe(200);
      const rotatedAccess = parseCookie(firstRefresh.headers['set-cookie'], 'accessToken');

      // The rotated access token works right now.
      const meWithRotated = await request(app).get('/api/auth/me').set('Cookie', `accessToken=${rotatedAccess}`);
      expect(meWithRotated.status).toBe(200);

      // Someone replays the ORIGINAL refresh token — e.g. it was stolen
      // before rotation and is being used by an attacker now. The
      // legitimate client would never do this; it already moved on.
      const replay = await request(app)
        .post('/api/auth/refresh')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', `refreshToken=${originalRefresh}`);
      expect(replay.status).toBe(401);

      // The entire family is now dead — even the token that was
      // legitimately rotated to a moment ago stops working, because reuse
      // detection also bumps tokenVersion, not just revokes the family.
      const meAfterReuse = await request(app).get('/api/auth/me').set('Cookie', `accessToken=${rotatedAccess}`);
      expect(meAfterReuse.status).toBe(401);

      // And the original access token (from before any rotation at all) is
      // equally dead.
      const meWithOriginal = await request(app).get('/api/auth/me').set('Cookie', `accessToken=${originalAccess}`);
      expect(meWithOriginal.status).toBe(401);
    });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears cookies and revokes the refresh token family', async () => {
    const { agent } = await createUserAndAgent();

    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);

    // Using the now-revoked refresh token afterward must fail — whether
    // the agent still has it or the server already cleared it, either way
    // the session is over.
    const refreshAfterLogout = await agent.post('/api/auth/refresh');
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('is a safe no-op without a session', async () => {
    const res = await request(app).post('/api/auth/logout').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(200);
  });
});
