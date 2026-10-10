// The real app disables rate limiting under NODE_ENV=test (see
// middleware/rateLimit.js) so the rest of the suite — which creates dozens
// of users per run — doesn't throttle itself for reasons unrelated to what
// each test is actually checking. These tests exercise the limiter's
// actual behaviour directly, against throwaway apps, by briefly flipping
// NODE_ENV around a real request.
const express = require('express');
const request = require('supertest');
const { makeIpLimiter, makeAccountLimiter } = require('../middleware/rateLimit');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const withLimitingForcedOn = async (fn) => {
  process.env.NODE_ENV = 'development';
  try {
    await fn();
  } finally {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
};

describe('rate limiting', () => {
  it('blocks further requests once the per-IP limit is exceeded', async () => {
    await withLimitingForcedOn(async () => {
      const limiter = makeIpLimiter({ windowMs: 60_000, max: 3, message: 'slow down' });
      const app = express();
      app.get('/test', limiter, (req, res) => res.json({ ok: true }));

      for (let i = 0; i < 3; i++) {
        expect((await request(app).get('/test')).status).toBe(200);
      }

      expect((await request(app).get('/test')).status).toBe(429);
    });
  });

  it('keys per-account limiting by the configured field, not by IP', async () => {
    await withLimitingForcedOn(async () => {
      const limiter = makeAccountLimiter({
        windowMs: 60_000,
        max: 1,
        message: 'slow down',
        keyFn: (req) => req.body?.email || null,
      });
      const app = express();
      app.use(express.json());
      app.post('/test', limiter, (req, res) => res.json({ ok: true }));

      expect((await request(app).post('/test').send({ email: 'a@example.com' })).status).toBe(200);
      // Same account, same loopback IP -> blocked.
      expect((await request(app).post('/test').send({ email: 'a@example.com' })).status).toBe(429);
      // Different account, same IP -> allowed — proves the key is the
      // account, not just the IP underneath it.
      expect((await request(app).post('/test').send({ email: 'b@example.com' })).status).toBe(200);
    });
  });

  it('falls back to IP when the account key is absent, rather than bypassing the limit', async () => {
    await withLimitingForcedOn(async () => {
      const limiter = makeAccountLimiter({
        windowMs: 60_000,
        max: 1,
        message: 'slow down',
        keyFn: (req) => req.body?.email || null,
      });
      const app = express();
      app.use(express.json());
      app.post('/test', limiter, (req, res) => res.json({ ok: true }));

      expect((await request(app).post('/test').send({})).status).toBe(200);
      expect((await request(app).post('/test').send({})).status).toBe(429);
    });
  });

  it('is disabled under NODE_ENV=test, so the rest of the suite is never throttled', async () => {
    const limiter = makeIpLimiter({ windowMs: 60_000, max: 1, message: 'slow down' });
    const app = express();
    app.get('/test', limiter, (req, res) => res.json({ ok: true }));

    for (let i = 0; i < 5; i++) {
      expect((await request(app).get('/test')).status).toBe(200);
    }
  });
});
