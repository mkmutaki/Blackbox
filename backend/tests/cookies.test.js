// Direct, environment-accurate check of the security-critical cookie
// options. HTTP-level tests (auth.test.js etc.) can't assert Secure/
// SameSite=none meaningfully — supertest talks plain HTTP in-process, and a
// real browser would (correctly) discard those exact cookies over that
// connection, the same way it would in production over real HTTPS. So this
// checks the option object cookies.js actually builds, outside the test
// environment, instead.
const { setAccessTokenCookie, setRefreshTokenCookie } = require('../services/cookies');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SAME_SITE = process.env.COOKIE_SAME_SITE;

const withRealEnv = (fn) => {
  process.env.NODE_ENV = 'production';
  try {
    fn();
  } finally {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_SAME_SITE === undefined) delete process.env.COOKIE_SAME_SITE;
    else process.env.COOKIE_SAME_SITE = ORIGINAL_SAME_SITE;
  }
};

describe('cookie options outside the test environment', () => {
  it('sets httpOnly and Secure on the access token cookie', () => {
    withRealEnv(() => {
      const res = { cookie: vi.fn() };
      setAccessTokenCookie(res, 'token-value');

      expect(res.cookie).toHaveBeenCalledWith(
        'accessToken',
        'token-value',
        expect.objectContaining({ httpOnly: true, secure: true })
      );
    });
  });

  it('sets httpOnly and Secure on the refresh token cookie, scoped to /api/auth', () => {
    withRealEnv(() => {
      const res = { cookie: vi.fn() };
      setRefreshTokenCookie(res, 'token-value');

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'token-value',
        expect.objectContaining({ httpOnly: true, secure: true, path: '/api/auth' })
      );
    });
  });

  it('defaults SameSite to none (the live frontend/backend split is cross-site)', () => {
    withRealEnv(() => {
      delete process.env.COOKIE_SAME_SITE;
      const res = { cookie: vi.fn() };
      setAccessTokenCookie(res, 'token-value');

      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'token-value', expect.objectContaining({ sameSite: 'none' }));
    });
  });

  it('honours COOKIE_SAME_SITE=lax once the custom domain unifies both sites', () => {
    withRealEnv(() => {
      process.env.COOKIE_SAME_SITE = 'lax';
      const res = { cookie: vi.fn() };
      setAccessTokenCookie(res, 'token-value');

      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'token-value', expect.objectContaining({ sameSite: 'lax' }));
    });
  });

  it('falls back to none for a garbage COOKIE_SAME_SITE value', () => {
    withRealEnv(() => {
      process.env.COOKIE_SAME_SITE = 'whatever';
      const res = { cookie: vi.fn() };
      setAccessTokenCookie(res, 'token-value');

      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'token-value', expect.objectContaining({ sameSite: 'none' }));
    });
  });
});
