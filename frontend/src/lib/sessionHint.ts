// The session itself lives in httpOnly cookies this code can't read, so
// the only way to learn whether one exists is to ask /auth/me — which, for
// a signed-out visitor, means a 401 and a failed refresh in the console on
// every page load. This remembers the last known answer so a visitor who
// was signed out last time skips that check.
//
// It's a hint, not a credential: it grants nothing and the server never
// sees it. A stale "yes" just costs the check it would have made anyway; a
// missing hint (first visit, or storage unavailable) also falls back to
// checking, so a session that predates this hint is still picked up.
const SESSION_HINT_KEY = 'bb_session_hint';

export const wasSignedOut = (): boolean => {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === 'signed-out';
  } catch {
    return false;
  }
};

export const rememberSessionState = (isLoggedIn: boolean) => {
  try {
    localStorage.setItem(SESSION_HINT_KEY, isLoggedIn ? 'signed-in' : 'signed-out');
  } catch {
    // Storage blocked (private mode, disabled site data) — every load
    // just checks with the server, same as before this hint existed.
  }
};
