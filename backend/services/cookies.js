// Centralizes the session cookies so every option (httpOnly, Secure,
// SameSite, path, lifetime) is set in exactly one place.
//
// SameSite defaults to 'none' because the live deployment today is
// genuinely cross-site — frontend on GitHub Pages, backend on Render, two
// different sites. SameSite=None requires Secure, which is set
// unconditionally below; modern browsers treat localhost as a secure
// context even over plain http, so this still works in local dev. CSRF
// protection therefore comes from the Origin/Referer allowlist
// (middleware/csrf.js), not from SameSite, until the planned custom domain
// unifies both into one site — at that point set COOKIE_SAME_SITE=lax (or
// strict) via env and SameSite starts pulling real CSRF weight too.
const ACCESS_TOKEN_COOKIE = 'accessToken';
const REFRESH_TOKEN_COOKIE = 'refreshToken';
const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const VALID_SAME_SITE = ['lax', 'strict', 'none'];

// supertest's agent talks to the app over plain HTTP in-process — a real
// browser (correctly) withholds a Secure cookie entirely on a non-HTTPS
// connection, and SameSite=None without Secure is an invalid combination
// browsers reject outright. Neither constraint means anything in a test
// process that never speaks TLS, so both relax under NODE_ENV=test, same
// reasoning as rate limiting being disabled there. Checked at call time
// (not cached at module load) so tests can flip NODE_ENV around a real
// call and see real behaviour without reloading the module.
const isTest = () => process.env.NODE_ENV === 'test';

const resolvedSameSite = () => {
  if (isTest()) return 'lax';
  const configured = (process.env.COOKIE_SAME_SITE || 'none').toLowerCase();
  return VALID_SAME_SITE.includes(configured) ? configured : 'none';
};

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: !isTest(),
  sameSite: resolvedSameSite(),
});

// Scoped to '/api/auth' only — the refresh token never needs to leave the
// browser on every API call, just the handful of auth endpoints that use
// it, which narrows how often it's ever actually transmitted.
const REFRESH_COOKIE_PATH = '/api/auth';

const setAccessTokenCookie = (res, token) => {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...baseCookieOptions(),
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
};

const setRefreshTokenCookie = (res, token) => {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...baseCookieOptions(),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...baseCookieOptions(), path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH });
};

module.exports = {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
};
