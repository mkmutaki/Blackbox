// CSRF defence for state-changing requests. The session cookies are also
// SameSite=Lax (services/cookies.js), but this check stays the primary
// layer — it doesn't depend on cookie settings or browser behaviour. A browser
// reliably sends Origin on every fetch/XHR request that isn't a simple
// top-level navigation, including same-origin ones, so a missing Origin
// *and* Referer on a state-changing request is itself treated as
// suspicious rather than quietly allowed.
//
// Also doubles as the CORS allowlist in app.js — one list, not two to keep
// in sync. Computed per-call (not frozen at require time) so
// NODE_ENV can be flipped mid-test the same way middleware/rateLimit.js
// does, and so a real deploy picks up an env change without a restart.
const PROD_ORIGINS = [
  'https://www.blackb0x.app',
  'https://blackb0x.app',
];

const DEV_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:3000',
];

// ALLOWED_ORIGINS env var (comma-separated) overrides the production
// origins without a code change (SEC-15). Falls back to the hardcoded
// blackb0x.app origins otherwise. Localhost is never included in
// production (SEC-15), regardless of this env var.
const getAllowedOrigins = () => {
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const base = envOrigins.length ? envOrigins : PROD_ORIGINS;
  const devOrigins = process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS;

  return [...base, ...devOrigins];
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const originFromReferer = (referer) => {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

const csrfOriginCheck = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin || originFromReferer(req.headers.referer);

  if (!origin || !getAllowedOrigins().includes(origin)) {
    return res.status(403).json({ error: 'Request origin not allowed' });
  }

  next();
};

module.exports = { csrfOriginCheck, getAllowedOrigins };
