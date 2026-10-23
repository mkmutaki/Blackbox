// Phase 4 (SECURITY_HARDENING_PROMPT.md §7) — malformed input, resource
// abuse, and upload-key tampering. Each test runs the attack and asserts it
// fails; the SEC id names the fix in SECURITY_AUDIT.md.
const crypto = require('node:crypto');
const request = require('supertest');
const { app, createAgent, createUserAndAgent, registerUser, uniqueEmail, VALID_PASSWORD, TEST_ORIGIN, User, CURRENT_TERMS_VERSION } = require('../helpers');
const { presignAndUpload, finalize, cookieFrom, withEnv, captureConsole } = require('./attackKit');
const Video = require('../../models/Video');
const RefreshToken = require('../../models/RefreshToken');

// Rate limiting is off under NODE_ENV=test; these flip it on around real
// requests to the real app. Each test uses its own client IP (via the
// X-Forwarded-For header that `trust proxy` reads) so limiter state from
// one test can't leak into another.
const withLimitsOn = (fn) => withEnv({ NODE_ENV: 'development' }, fn);
let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

describe('SEC-34: endpoints that write documents are not an unbounded write primitive', () => {
  beforeAll(() => Video.init()); // unique s3Key index must exist

  it('finalize cannot be replayed to mint many records from one upload', async () => {
    const { agent } = await createUserAndAgent();
    const key = await presignAndUpload(agent);

    expect((await finalize(agent, key)).status).toBe(201);
    for (let i = 0; i < 5; i++) {
      expect((await finalize(agent, key)).status).toBe(409);
    }
    expect(await Video.countDocuments({ s3Key: key })).toBe(1);
  });

  it('concurrent finalizes of one key produce exactly one record', async () => {
    const { agent } = await createUserAndAgent();
    const key = await presignAndUpload(agent);

    const statuses = (await Promise.all(Array.from({ length: 10 }, () => finalize(agent, key)))).map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
    expect(await Video.countDocuments({ s3Key: key })).toBe(1);
  });

  it('distinct concurrent uploads still each get their own entry number', async () => {
    const { agent } = await createUserAndAgent();
    const keys = await Promise.all(Array.from({ length: 8 }, () => presignAndUpload(agent)));

    const results = await Promise.all(keys.map((key) => finalize(agent, key)));

    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(results.map((r) => r.body.entryNumber).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  // Mirrors refreshIpLimiter in middleware/rateLimit.js.
  const REFRESH_LIMIT = 300;

  it('/refresh is rate limited per IP', async () => {
    await withLimitsOn(async () => {
      const ip = freshIp();
      const statuses = [];
      for (let i = 0; i <= REFRESH_LIMIT; i++) {
        statuses.push((await request(app).post('/api/auth/refresh').set('Origin', TEST_ORIGIN).set('X-Forwarded-For', ip)).status);
      }
      expect(statuses.slice(0, REFRESH_LIMIT).every((s) => s === 401)).toBe(true);
      expect(statuses[REFRESH_LIMIT]).toBe(429);
    });
  });

  it('a refresh loop with a valid session stops creating tokens once limited', async () => {
    const { agent, email } = await createUserAndAgent();
    const user = await User.findOne({ email });
    const ip = freshIp();

    await withLimitsOn(async () => {
      // Cookies become Secure outside the test env and supertest won't send
      // those over http, so carry the rotating token by hand.
      let raw = cookieFrom(await agent.post('/api/auth/refresh'), 'refreshToken');
      for (let i = 0; i < REFRESH_LIMIT + 10; i++) {
        const res = await request(app).post('/api/auth/refresh')
          .set('Origin', TEST_ORIGIN).set('X-Forwarded-For', ip).set('Cookie', `refreshToken=${raw}`);
        if (res.status === 200) raw = cookieFrom(res, 'refreshToken');
      }
    });

    // 1 from register + 1 from the warm-up refresh + at most REFRESH_LIMIT limited ones.
    expect(await RefreshToken.countDocuments({ userId: user._id })).toBeLessThanOrEqual(REFRESH_LIMIT + 2);
  });

  it('/finalize is rate limited per account', async () => {
    const { agent } = await createUserAndAgent();
    const ip = freshIp();

    await withLimitsOn(async () => {
      const statuses = [];
      for (let i = 0; i < 16; i++) {
        statuses.push((await agent.post('/api/videos/finalize').set('X-Forwarded-For', ip).send({})).status);
      }
      expect(statuses.slice(0, 15).every((s) => s === 400)).toBe(true);
      expect(statuses[15]).toBe(429);
    });
  });
});

describe('SEC-37: malformed input gets a 4xx, never a 500 or an echo', () => {
  const rawPost = (path, body, cookie) => {
    const req = request(app).post(path).set('Origin', TEST_ORIGIN).set('Content-Type', 'application/json');
    if (cookie) req.set('Cookie', cookie);
    return req.send(body);
  };

  it('malformed JSON is a 400 that does not quote the body back', async () => {
    const res = await rawPost('/api/auth/login', '{"email": "ECHO-MARKER", oops');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('ECHO-MARKER');
  });

  it('an oversized JSON body is a 413', async () => {
    const res = await rawPost('/api/auth/login', JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('in production mode, neither leaks a stack trace', async () => {
    await withEnv({ NODE_ENV: 'production' }, async () => {
      for (const res of [
        await rawPost('/api/auth/verify-email', '{bad'),
        await rawPost('/api/auth/verify-email', JSON.stringify({ token: 'x'.repeat(200 * 1024) })),
      ]) {
        expect(res.status).toBeLessThan(500);
        expect(JSON.stringify(res.body)).not.toMatch(/at \S+ \(|node_modules|SyntaxError/);
      }
    });
  });

  it('JSON-decoded (`j:`) cookies are treated as absent, not handed to token code', async () => {
    const quiet = captureConsole();
    const injected = 'j:{"$ne":null}';
    const refresh = await rawPost('/api/auth/refresh', '{}', `refreshToken=${injected}`);
    const logout = await rawPost('/api/auth/logout', '{}', `refreshToken=${injected}; accessToken=${injected}`);
    const me = await request(app).get('/api/auth/me').set('Cookie', `accessToken=${injected}`);
    const arrayCookie = await rawPost('/api/auth/refresh', '{}', 'refreshToken=j:["a","b"]');
    quiet.restore();

    expect(refresh.status).toBe(401);
    expect(logout.status).toBe(200);
    expect(me.status).toBe(401);
    expect(arrayCookie.status).toBe(401);
  });

  it('a jwk that parses but is not an object is a 400', async () => {
    const { agent } = await createUserAndAgent();
    for (const jwk of ['null', '123', '"text"', '[]', 'true']) {
      const key = await presignAndUpload(agent);
      expect((await finalize(agent, key, { jwk })).status).toBe(400);
    }
  });
});

describe('SEC-40: finalize accepts only the exact key shape the server issued', () => {
  it('rejects keys that merely start with the caller\'s prefix', async () => {
    const { agent, email } = await createUserAndAgent();
    const victim = await createUserAndAgent();
    const ownId = (await User.findOne({ email }))._id.toString();
    const victimId = (await User.findOne({ email: victim.email }))._id.toString();
    const uuid = crypto.randomUUID();

    for (const key of [
      `videos/${ownId}/../${victimId}/${uuid}`,
      `videos/${ownId}/${uuid}/../../${victimId}/${uuid}`,
      `videos/${ownId}/${uuid}/extra`,
      `videos/${ownId}/`,
      `videos/${ownId}/${uuid.toUpperCase()}`,
      `videos/${ownId}/not-a-uuid`,
      `videos/${victimId}/${uuid}`,
    ]) {
      expect((await finalize(agent, key)).status).toBe(403);
    }
  });

  it('still accepts the genuine server-issued key', async () => {
    const { agent } = await createUserAndAgent();
    expect((await finalize(agent, await presignAndUpload(agent))).status).toBe(201);
  });
});

describe('SEC-39: passwords bcrypt would silently truncate are refused', () => {
  const register = (password) => createAgent().post('/api/auth/register')
    .send({ email: uniqueEmail(), password, fullName: 'Long', dateOfBirth: '1990-01-01', acceptedTermsVersion: CURRENT_TERMS_VERSION });

  it('accepts exactly 72 bytes and refuses 73', async () => {
    const base = 'Aa1!';
    expect((await register(base + 'x'.repeat(68))).status).toBe(201);
    const tooLong = await register(base + 'x'.repeat(69));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toMatch(/too long/);
  });

  it('counts bytes, not characters (multibyte characters)', async () => {
    // 4 + 35 × 2 bytes = 74 bytes in only 39 characters.
    expect((await register('Aa1!' + 'é'.repeat(35))).status).toBe(400);
  });

  it('applies on password reset too', async () => {
    const emailService = require('../../services/email');
    const spy = vi.spyOn(emailService, 'sendPasswordResetEmail');
    const { email } = await createUserAndAgent();
    await createAgent().post('/api/auth/request-password-reset').send({ email });
    const token = spy.mock.calls[0][1];
    spy.mockRestore();

    const res = await createAgent().post('/api/auth/reset-password').send({ token, password: 'Aa1!' + 'x'.repeat(69) });
    expect(res.status).toBe(400);
  });

  it('existing accounts still sign in normally', async () => {
    const { agent, body } = await registerUser();
    expect((await agent.post('/api/auth/login').send({ email: body.email, password: VALID_PASSWORD })).status).toBe(200);
  });
});
