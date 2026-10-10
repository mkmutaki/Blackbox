// Per-IP and per-account rate limiting for the routes
// SECURITY_HARDENING_PROMPT.md §5.D names explicitly: login, register,
// Google auth, password reset, and upload/presign. Relies on
// `app.set('trust proxy', ...)` in app.js for req.ip to reflect the real
// client behind Render's proxy, not the proxy itself.
//
// Disabled under NODE_ENV=test — the backend test suite creates dozens of
// users per run from one supertest "IP"; throttling that would make the
// rest of the suite flaky for a reason that has nothing to do with what
// each test is actually checking. The check happens at request time (not
// once at module load) specifically so tests/rateLimit.test.js can flip
// NODE_ENV around a real request and see real behaviour without needing to
// bust and reload the module in between.
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

const isDisabled = () => process.env.NODE_ENV === 'test';

const buildLimiter = ({ windowMs, max, message, keyGenerator }) => {
  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    message: { error: message },
  });

  return (req, res, next) => (isDisabled() ? next() : limiter(req, res, next));
};

const makeIpLimiter = (opts) => buildLimiter({ ...opts, keyGenerator: undefined });

// keyFn reads whatever identifies "the account" for this route — the
// login/register email from the body, or the authenticated user's id for
// routes that already ran through authMiddleware. Falls back to IP (via
// express-rate-limit's own helper, which normalizes IPv6 addresses so one
// client can't bypass the limit by varying its representation) so a
// request with neither never bypasses limiting entirely.
const makeAccountLimiter = ({ keyFn, ...opts }) =>
  buildLimiter({ ...opts, keyGenerator: (req) => keyFn(req) || ipKeyGenerator(req.ip) });

const emailKey = (req) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null);
const userIdKey = (req) => req.user?.userId?.toString() || null;

const FIFTEEN_MIN = 15 * 60 * 1000;

const authIpLimiter = makeIpLimiter({
  windowMs: FIFTEEN_MIN,
  max: 20,
  message: 'Too many attempts from this network, please try again later.',
});

const authAccountLimiter = makeAccountLimiter({
  windowMs: FIFTEEN_MIN,
  max: 5,
  message: 'Too many attempts for this account, please try again later.',
  keyFn: emailKey,
});

const presignIpLimiter = makeIpLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many upload requests, please slow down.',
});

const presignAccountLimiter = makeAccountLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many upload requests for this account, please slow down.',
  keyFn: userIdKey,
});

module.exports = {
  makeIpLimiter,
  makeAccountLimiter,
  authIpLimiter,
  authAccountLimiter,
  presignIpLimiter,
  presignAccountLimiter,
};
