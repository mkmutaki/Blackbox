// Client-IP resolution behind Render's proxies. A deployed `trust proxy 1`
// reported Render's internal 10.x hop as every client's IP, putting all
// users in one rate-limit bucket. These send X-Forwarded-For chains shaped
// like Render's (client first, internal hops appended on the right) and
// read back what the app resolved, via the `ip` the login_failure audit
// entry records — the same field to check on a real deploy.
const request = require('supertest');
const { app, createAgent, uniqueEmail, TEST_ORIGIN } = require('../helpers');
const { withEnv } = require('./attackKit');
const AuditLog = require('../../models/AuditLog');
const googleAuthService = require('../../services/googleAuth');

const RENDER_HOP = '10.24.63.117';

const resolvedIpFor = async (forwardedFor) => {
  await request(app).post('/api/auth/login').set('Origin', TEST_ORIGIN).set('X-Forwarded-For', forwardedFor)
    .send({ email: uniqueEmail('ip'), password: 'Wr0ng!Password' });
  const entry = await AuditLog.findOne({ action: 'login_failure' }).sort({ createdAt: -1 });
  return entry.ip;
};

describe('req.ip is the real client behind Render\'s internal proxies', () => {
  it('skips one internal hop', async () => {
    expect(await resolvedIpFor(`203.0.113.9, ${RENDER_HOP}`)).toBe('203.0.113.9');
  });

  it('skips several internal hops, so a change in Render\'s topology doesn\'t matter', async () => {
    expect(await resolvedIpFor(`203.0.113.9, 172.16.4.2, 192.168.1.1, ${RENDER_HOP}`)).toBe('203.0.113.9');
  });

  it('ignores a spoofed public address the client prepends', async () => {
    expect(await resolvedIpFor(`1.2.3.4, 203.0.113.9, ${RENDER_HOP}`)).toBe('203.0.113.9');
  });

  it('ignores a spoofed private address the client prepends', async () => {
    expect(await resolvedIpFor(`10.9.9.9, 203.0.113.9, ${RENDER_HOP}`)).toBe('203.0.113.9');
  });

  it('handles IPv6 clients', async () => {
    expect(await resolvedIpFor(`2001:db8::42, ${RENDER_HOP}`)).toBe('2001:db8::42');
  });
});

describe('rate-limit buckets are per real client, not shared by everyone', () => {
  const resetRequest = (clientIp) => request(app).post('/api/auth/request-password-reset')
    .set('Origin', TEST_ORIGIN).set('X-Forwarded-For', `${clientIp}, ${RENDER_HOP}`)
    .send({ email: uniqueEmail('bucket') });

  it('one client exhausting its limit leaves another client behind the same proxy unaffected', async () => {
    await withEnv({ NODE_ENV: 'development' }, async () => {
      const statuses = [];
      for (let i = 0; i <= 100; i++) statuses.push((await resetRequest('203.0.113.50')).status);

      expect(statuses.slice(0, 100).every((s) => s === 200)).toBe(true);
      expect(statuses[100]).toBe(429);
      expect((await resetRequest('203.0.113.51')).status).toBe(200);
    });
  });

  it('Google sign-in is no longer capped at 5 per IP', async () => {
    const verify = vi.spyOn(googleAuthService, 'verifyGoogleToken').mockRejectedValue(new Error('bad'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    await withEnv({ NODE_ENV: 'development' }, async () => {
      for (let i = 0; i < 20; i++) {
        const res = await createAgent().post('/api/auth/google')
          .set('X-Forwarded-For', `203.0.113.60, ${RENDER_HOP}`).send({ credential: `cred-${i}` });
        expect(res.status).toBe(401);
      }
    });

    verify.mockRestore();
    quiet.mockRestore();
  });
});
