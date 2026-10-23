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

const resolvedIpFor = async (forwardedFor, extraHeaders = {}) => {
  await request(app).post('/api/auth/login').set('Origin', TEST_ORIGIN).set('X-Forwarded-For', forwardedFor)
    .set(extraHeaders).send({ email: uniqueEmail('ip'), password: 'Wr0ng!Password' });
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

// What a deploy actually showed: Render's chain ends in a Cloudflare edge
// address (104.22.160.49), and Cloudflare carries the real client in
// CF-Connecting-IP.
const CF_EDGE = '104.22.160.49';
const viaCloudflare = (client, edge = CF_EDGE) => [`${client}, ${edge}, ${RENDER_HOP}`, { 'CF-Connecting-IP': client }];

describe('req.ip is the real client behind Cloudflare', () => {
  it('uses CF-Connecting-IP when the hop Render recorded is a Cloudflare edge', async () => {
    expect(await resolvedIpFor(...viaCloudflare('203.0.113.70'))).toBe('203.0.113.70');
  });

  it('works for IPv6 clients and IPv6 Cloudflare edges', async () => {
    expect(await resolvedIpFor(...viaCloudflare('2001:db8::70', '2606:4700::1'))).toBe('2001:db8::70');
  });

  it('ignores CF-Connecting-IP on a request that did not come through Cloudflare', async () => {
    // A client hitting the origin some other way sends the header itself.
    expect(await resolvedIpFor(`203.0.113.9, ${RENDER_HOP}`, { 'CF-Connecting-IP': '1.2.3.4' })).toBe('203.0.113.9');
  });

  it('ignores a client prepending a fake Cloudflare hop', async () => {
    // Only the right-most public hop counts, and Render's proxy writes it.
    expect(await resolvedIpFor(`${CF_EDGE}, 203.0.113.9, ${RENDER_HOP}`, { 'CF-Connecting-IP': '1.2.3.4' })).toBe('203.0.113.9');
  });

  it('falls back to the edge address, never a garbage value, when the header is missing or malformed', async () => {
    expect(await resolvedIpFor(`203.0.113.70, ${CF_EDGE}, ${RENDER_HOP}`)).toBe(CF_EDGE);
    expect(await resolvedIpFor(`203.0.113.70, ${CF_EDGE}, ${RENDER_HOP}`, { 'CF-Connecting-IP': 'not-an-ip' })).toBe(CF_EDGE);
    expect(await resolvedIpFor(`203.0.113.70, ${CF_EDGE}, ${RENDER_HOP}`, { 'CF-Connecting-IP': '1.2.3.4, 5.6.7.8' })).toBe(CF_EDGE);
  });
});

describe('rate-limit buckets are per real client, not shared by everyone', () => {
  it('two clients arriving through the same Cloudflare edge get separate buckets', async () => {
    const reset = (client) => {
      const [chain, headers] = viaCloudflare(client);
      return request(app).post('/api/auth/request-password-reset').set('Origin', TEST_ORIGIN)
        .set('X-Forwarded-For', chain).set(headers).send({ email: uniqueEmail('cf') });
    };

    await withEnv({ NODE_ENV: 'development' }, async () => {
      const statuses = [];
      for (let i = 0; i <= 100; i++) statuses.push((await reset('203.0.113.80')).status);

      expect(statuses[100]).toBe(429);
      expect((await reset('203.0.113.81')).status).toBe(200);
    });
  });

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
