// Have I Been Pwned's Pwned Passwords k-anonymity range API — named
// explicitly in SECURITY_HARDENING_PROMPT.md §5.D as the intended check.
// Only the first 5 hex chars of the password's SHA-1 hash ever leave this
// server; the real password never does. Fails open (returns "not known to
// be breached") on any error — timeout, network failure, non-200 — per the
// prompt's explicit instruction, so a slow or unreachable HIBP never blocks
// registration or password reset.
const crypto = require('node:crypto');

const HIBP_TIMEOUT_MS = 3000;

const isPasswordBreached = async (password) => {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: controller.signal,
        headers: { 'Add-Padding': 'true' },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return false;

    const body = await response.text();
    return body
      .split('\n')
      .some((line) => {
        const [lineSuffix, count] = line.trim().split(':');
        return lineSuffix === suffix && Number(count) > 0;
      });
  } catch (err) {
    console.error('HIBP check failed, failing open:', err.message);
    return false;
  }
};

module.exports = { isPasswordBreached };
