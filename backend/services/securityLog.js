// Structured security-event logging (SECURITY_HARDENING_PROMPT.md §5.G).
// Writes one JSON line per event to stdout — deliberately not persisted to
// the database yet. Phase 3 names this as the substrate its AuditLog model
// builds on: that model is append-only and gets its own test coverage, so
// these call sites are written now and simply get rewired to also write
// to AuditLog later, rather than duplicating the event list.
//
// Named events (exactly what §5.G lists, not a general-purpose logger):
// login_success, login_failure, password_change, google_link_success,
// google_link_blocked_unverified, refresh_token_reuse, account_deleted.
const REDACTED_KEYS = new Set([
  'password', 'token', 'rawtoken', 'jwk', 'iv', 'credential',
  'refreshtoken', 'accesstoken', 'tokenhash', 'authorization', 'cookie',
]);

// Masks rather than drops an email — "which account" is exactly what a
// security log needs to be useful, but the full address doesn't belong in
// a log aggregator with its own, longer retention.
const maskEmail = (email) => {
  if (typeof email !== 'string' || !email.includes('@')) return undefined;
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
};

const redactMeta = (meta) => {
  if (!meta || typeof meta !== 'object') return {};

  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key.toLowerCase() === 'email') {
      out.email = maskEmail(value);
    } else if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = '[redacted]';
    } else {
      out[key] = value;
    }
  }
  return out;
};

const logSecurityEvent = (action, { userId, ip, meta } = {}) => {
  console.log(JSON.stringify({
    type: 'security_event',
    action,
    userId: userId ? String(userId) : null,
    ip: ip || null,
    meta: redactMeta(meta),
    timestamp: new Date().toISOString(),
  }));
};

module.exports = { logSecurityEvent, maskEmail };
