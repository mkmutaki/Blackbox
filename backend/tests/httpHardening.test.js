// SECURITY_HARDENING_PROMPT.md §5.F: helmet with explicit settings + HSTS,
// and a CORS allowlist that drops localhost in production (SEC-15).
const request = require('supertest');
const { app, TEST_ORIGIN } = require('./helpers');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;

// middleware/csrf.js computes the allowlist per-request (not once at
// require time) specifically so this kind of env flip is observable
// without reloading the app module — same pattern as
// tests/rateLimit.test.js uses for NODE_ENV.
const withEnv = async (overrides, fn) => {
  Object.assign(process.env, overrides);
  try {
    await fn();
  } finally {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_ALLOWED_ORIGINS === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = ORIGINAL_ALLOWED_ORIGINS;
    }
  }
};

describe('helmet security headers', () => {
  it('sends a locked-down Content-Security-Policy on every response', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('sends HSTS', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
  });

  it('sends X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS allowlist (SEC-15)', () => {
  it('reflects an allowed origin with credentials enabled', async () => {
    const res = await request(app).get('/api/health').set('Origin', TEST_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not reflect a disallowed origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('drops localhost from the allowlist when NODE_ENV=production', async () => {
    await withEnv({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://mkmutaki.github.io' }, async () => {
      const localhost = await request(app).get('/api/health').set('Origin', 'http://localhost:8080');
      expect(localhost.headers['access-control-allow-origin']).toBeUndefined();

      const prod = await request(app).get('/api/health').set('Origin', 'https://mkmutaki.github.io');
      expect(prod.headers['access-control-allow-origin']).toBe('https://mkmutaki.github.io');
    });
  });

  it('honours ALLOWED_ORIGINS for a custom domain without a code change', async () => {
    await withEnv({ ALLOWED_ORIGINS: 'https://app.example.com' }, async () => {
      const res = await request(app).get('/api/health').set('Origin', 'https://app.example.com');
      expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
    });
  });
});
