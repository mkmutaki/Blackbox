// Containment check for SECURITY_HARDENING_PROMPT.md §5.B: jwk/iv must
// never appear anywhere except the video's own owner-scoped endpoints.
// Because E2EE is deferred, the server can decrypt any video — this test is
// what makes "an admin can never see decrypted content by accident" a code
// guarantee instead of a hope, and it's meant to keep failing loudly if a
// future endpoint (admin panel included) ever leaks these fields.
const request = require('supertest');
const { app, createUserAndAgent, TEST_ORIGIN, CURRENT_TERMS_VERSION, GOOGLE_SIGNUP } = require('./helpers');

const IV = 'aabbccddeeff00112233445566778899';
const JWK_SECRET_MARKER = 'do-not-leak-this-key-material';
const JWK = JSON.stringify({ kty: 'oct', k: JWK_SECRET_MARKER, alg: 'A256GCM' });

const uploadVideo = async (agent, title = 'Contained Entry') => {
  const presignRes = await agent
    .post('/api/videos/presign')
    .send({ contentType: 'application/octet-stream', contentLength: 17 });

  const uploadPath = new URL(presignRes.body.url).pathname;
  const uploadReq = request(app).post(uploadPath).set('Origin', TEST_ORIGIN);
  Object.entries(presignRes.body.fields).forEach(([field, value]) => uploadReq.field(field, value));
  await uploadReq.attach('file', Buffer.from('encrypted-bytes'), 'encrypted_video.dat');

  return agent.post('/api/videos/finalize').send({ key: presignRes.body.key, iv: IV, jwk: JWK, title });
};

// Every response body is stringified and scanned for the raw key material —
// this catches the field showing up under any name, not just `jwk`/`iv`.
const assertNoKeyMaterial = (res) => {
  const serialized = JSON.stringify(res.body);
  expect(serialized).not.toContain(JWK_SECRET_MARKER);
  expect(serialized).not.toContain(IV);
};

describe('key material containment (jwk/iv)', () => {
  it('IS returned to the video\'s own owner via GET /videos and GET /videos/:id', async () => {
    const { agent } = await createUserAndAgent();
    const upload = await uploadVideo(agent);

    const list = await agent.get('/api/videos');
    expect(JSON.stringify(list.body)).toContain(JWK_SECRET_MARKER);

    const single = await agent.get(`/api/videos/${upload.body.id}`);
    expect(JSON.stringify(single.body)).toContain(JWK_SECRET_MARKER);
  });

  it('is NOT returned to another user who owns nothing', async () => {
    const { agent: owner } = await createUserAndAgent();
    const { agent: stranger } = await createUserAndAgent();
    const upload = await uploadVideo(owner);

    assertNoKeyMaterial(await stranger.get('/api/videos'));
    assertNoKeyMaterial(await stranger.get(`/api/videos/${upload.body.id}`));
  });

  it('never appears in presign, finalize, patch, delete, auth, or profile responses', async () => {
    const { agent } = await createUserAndAgent();
    const upload = await uploadVideo(agent);

    const presign = await agent.post('/api/videos/presign').send({ contentType: 'application/octet-stream', contentLength: 17 });
    assertNoKeyMaterial(presign);

    // The finalize response that just created this exact video's record.
    assertNoKeyMaterial(upload);

    const patch = await agent.patch(`/api/videos/${upload.body.id}`).send({ title: 'Renamed' });
    assertNoKeyMaterial(patch);

    const me = await agent.get('/api/auth/me');
    assertNoKeyMaterial(me);

    const profile = await agent.get('/api/profile');
    assertNoKeyMaterial(profile);

    const del = await agent.delete(`/api/videos/${upload.body.id}`);
    assertNoKeyMaterial(del);
  });

  it('never appears in an error response, even when the request references this video', async () => {
    const { agent } = await createUserAndAgent();
    await uploadVideo(agent);

    // Malformed id -> the generic error path, not the happy path.
    const res = await agent.get('/api/videos/not-a-valid-id');
    assertNoKeyMaterial(res);
  });
});

// SECURITY_HARDENING_PROMPT.md §6.7 — the invariant itself, not a sample
// of it: across EVERY route the app mounts, called by an anonymous client,
// a stranger and the owner, no response contains the key material except
// the owner's own GET /api/videos and GET /api/videos/:id.
//
// Two guards make this hold as the app grows (admin panel included):
// - The route inventory is read from Express itself. A new route, or a
//   new mounted router, fails the test until it gets a recipe below.
// - Responses are captured at res.send — the point every res.json() and
//   error handler goes through — rather than inspected per test, so a
//   leak can't hide in a path nobody thought to assert on.
describe('key material invariant across every mounted route', () => {
  const express = require('express');
  const videoRoutes = require('../routes/videoRoutes');
  const authRoutes = require('../routes/authRoutes');
  const profileRoutes = require('../routes/profileRoutes');
  const googleAuthService = require('../services/googleAuth');
  const { createAgent, uniqueEmail, VALID_PASSWORD } = require('./helpers');

  const MOUNT_PREFIXES = new Map([
    [videoRoutes, '/api/videos'],
    [authRoutes, '/api/auth'],
    [profileRoutes, '/api/profile'],
  ]);

  // Test-only stand-ins for S3, never mounted in production (app.js gates
  // them on USE_FAKE_S3 and NODE_ENV). They serve ciphertext, not keys.
  const isTestOnlyRoute = (path) => path.startsWith('/__fake-s3__');

  const routeKeys = (stack, prefix = '') => stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods)
      .map((method) => `${method.toUpperCase()} ${prefix}${layer.route.path === '/' && prefix ? '' : layer.route.path}`));

  const inventory = () => {
    const keys = routeKeys(app.router.stack).filter((key) => !isTestOnlyRoute(key.split(' ')[1]));
    const unknownRouters = [];

    for (const layer of app.router.stack) {
      if (!layer.handle?.stack) continue;
      const prefix = MOUNT_PREFIXES.get(layer.handle);
      if (!prefix) {
        unknownRouters.push(layer.name);
        continue;
      }
      keys.push(...routeKeys(layer.handle.stack, prefix));
    }
    return { keys, unknownRouters };
  };

  // One request per route. Ordered so the destructive ones run last for
  // each caller.
  const RECIPES = [
    ['GET /api/health', (a) => a.get('/api/health')],
    ['POST /api/videos/presign', (a) => a.post('/api/videos/presign').send({})],
    ['POST /api/videos/finalize', (a, c) => a.post('/api/videos/finalize').send({ key: c.s3Key, iv: IV, jwk: JWK, title: 'Again' })],
    ['GET /api/videos', (a) => a.get('/api/videos')],
    ['GET /api/videos/:id', (a, c) => a.get(`/api/videos/${c.videoId}`)],
    ['PATCH /api/videos/:id', (a, c) => a.patch(`/api/videos/${c.videoId}`).send({ title: 'Renamed' })],
    ['POST /api/auth/register', (a) => a.post('/api/auth/register').send({
      email: uniqueEmail(), password: VALID_PASSWORD, fullName: 'New', dateOfBirth: '1990-01-01', acceptedTermsVersion: CURRENT_TERMS_VERSION,
    })],
    ['POST /api/auth/login', (a, c) => a.post('/api/auth/login').send({ email: c.email, password: c.password })],
    ['POST /api/auth/google', (a) => a.post('/api/auth/google').send({ credential: 'cred', ...GOOGLE_SIGNUP })],
    ['POST /api/auth/refresh', (a) => a.post('/api/auth/refresh')],
    ['POST /api/auth/verify-email', (a) => a.post('/api/auth/verify-email').send({ token: 'bogus' })],
    ['POST /api/auth/request-password-reset', (a, c) => a.post('/api/auth/request-password-reset').send({ email: c.email })],
    ['POST /api/auth/reset-password', (a) => a.post('/api/auth/reset-password').send({ token: 'bogus', password: VALID_PASSWORD })],
    ['GET /api/auth/me', (a) => a.get('/api/auth/me')],
    ['POST /api/auth/accept-terms', (a) => a.post('/api/auth/accept-terms').send({ acceptedTermsVersion: CURRENT_TERMS_VERSION })],
    ['GET /api/profile', (a) => a.get('/api/profile')],
    ['PUT /api/profile/update', (a) => a.put('/api/profile/update').send({ dateOfBirth: '1990-01-01' })],
    ['POST /api/profile/onboarding', (a) => a.post('/api/profile/onboarding').send({ username: 'probe' })],
    ['DELETE /api/videos/:id', (a, c) => a.delete(`/api/videos/${c.videoId}`)],
    ['DELETE /api/auth/account', (a, c) => a.delete('/api/auth/account').send({ password: c.password })],
    ['POST /api/auth/logout', (a) => a.post('/api/auth/logout')],
  ];

  // Not keyed to a route — extra shapes that exercise error paths.
  const EXTRA_PROBES = [
    (a) => a.get('/api/videos/not-a-valid-id'),
    (a) => a.get('/api/videos/000000000000000000000000'),
    (a) => a.get('/api/no-such-route'),
  ];

  it('has a recipe for every mounted route, and no stale ones', () => {
    const { keys, unknownRouters } = inventory();

    expect(unknownRouters).toEqual([]);
    expect(keys.filter((k) => !RECIPES.some(([r]) => r === k))).toEqual([]);
    expect(RECIPES.map(([r]) => r).filter((r) => !keys.includes(r))).toEqual([]);
  });

  it('no response outside the owner\'s own GET /api/videos(/:id) contains jwk or iv', async () => {
    const google = vi.spyOn(googleAuthService, 'verifyGoogleToken')
      .mockImplementation(async () => ({ sub: `sub-${Math.random()}`, email: uniqueEmail('g'), email_verified: true, name: 'G' }));
    const quiet = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error')].map((s) => s.mockImplementation(() => {}));

    const owner = await createUserAndAgent();
    const upload = await uploadVideo(owner.agent);
    const ctx = {
      email: owner.email,
      password: owner.password,
      videoId: upload.body.id,
      s3Key: (await require('../models/Video').findById(upload.body.id)).s3Key,
    };

    const captured = [];
    const originalSend = express.response.send;
    const sendSpy = vi.spyOn(express.response, 'send').mockImplementation(function (body) {
      const { req } = this;
      captured.push({
        label: `${req.method} ${req.originalUrl}`,
        allowed: req.method === 'GET'
          && req.baseUrl === '/api/videos'
          && ['/', '/:id'].includes(req.route?.path)
          && String(req.user?.userId) === String(owner.user.id),
        body: Buffer.isBuffer(body) ? body.toString('latin1') : String(body ?? ''),
      });
      return originalSend.call(this, body);
    });

    try {
      const stranger = await createUserAndAgent();
      const callers = [
        [createAgent(), { ...ctx, password: 'Wr0ng!Password' }],
        [stranger.agent, { ...ctx, email: stranger.email, password: stranger.password }],
        [owner.agent, ctx],
      ];

      for (const [agent, c] of callers) {
        for (const probe of EXTRA_PROBES) await probe(agent);
        for (const [, recipe] of RECIPES) await recipe(agent, c);
      }
    } finally {
      sendSpy.mockRestore();
      google.mockRestore();
      quiet.forEach((s) => s.mockRestore());
    }

    const containsKey = (entry) => entry.body.includes(JWK_SECRET_MARKER) || entry.body.includes(IV);
    const leaks = captured.filter((e) => !e.allowed && containsKey(e)).map((e) => e.label);

    // Positive control: proves the capture actually sees key material when
    // it's legitimately there, so an empty `leaks` list means something.
    expect(captured.some((e) => e.allowed && containsKey(e))).toBe(true);
    expect(captured.length).toBeGreaterThan(RECIPES.length * 3);
    expect(leaks).toEqual([]);
  });
});
