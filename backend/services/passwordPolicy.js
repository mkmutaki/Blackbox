// Password rules per SECURITY_HARDENING_PROMPT.md §5.D: min 8 chars, at
// least one uppercase letter, one digit, one special character, plus a
// breached-password check. bcrypt cost is set where the hash actually
// happens (models/User.js) — ≥8 there already (currently 10), which the
// same spec requires.
// Not destructured — tests spy on this module's own method (vi.spyOn); a
// destructured reference is bound before a spy can ever intercept it.
const hibpService = require('./hibp');

const MIN_LENGTH = 8;
// bcrypt only ever reads the first 72 bytes of its input and silently
// ignores the rest, so a longer password would be quietly weaker than the
// user thinks — anything differing only after byte 72 would also unlock
// the account. Refuse it up front instead (SEC-39). Bytes, not characters:
// non-ASCII characters take 2-4 bytes each in UTF-8.
const MAX_BYTES = 72;

const COMPOSITION_RULES = [
  { test: /[A-Z]/, message: 'must contain at least one uppercase letter' },
  { test: /[0-9]/, message: 'must contain at least one number' },
  { test: /[^A-Za-z0-9]/, message: 'must contain at least one special character' },
];

// Machine-readable code sent alongside the breach error, so the sign-up
// and reset forms can offer to continue anyway instead of just showing it.
const PASSWORD_BREACHED = 'PASSWORD_BREACHED';
const BREACHED_PASSWORD_ERROR = 'This password has appeared in a known data breach — please choose a different one';

// Returns a single user-facing error string, or null if the password is
// acceptable. Does the cheap composition checks before the network call.
// allowBreached skips the HIBP lookup — only for a user who has already
// been warned and chosen to keep the password.
const validatePassword = async (password, { allowBreached = false } = {}) => {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters`;
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    return `Password is too long (maximum ${MAX_BYTES} characters)`;
  }

  for (const rule of COMPOSITION_RULES) {
    if (!rule.test.test(password)) {
      return `Password ${rule.message}`;
    }
  }

  if (!allowBreached && (await hibpService.isPasswordBreached(password))) {
    return BREACHED_PASSWORD_ERROR;
  }

  return null;
};

module.exports = { validatePassword, PASSWORD_BREACHED, BREACHED_PASSWORD_ERROR, MIN_LENGTH, MAX_BYTES };
