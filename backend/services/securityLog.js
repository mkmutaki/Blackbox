// Structured security-event logging (SECURITY_HARDENING_PROMPT.md §5.G,
// persisted per §6.2). Each event is written twice: one JSON line to
// stdout for the log aggregator, and one append-only AuditLog document —
// the record a future admin panel's audit view reads. Both get the same
// redacted payload.
//
// Named events: login_success, login_failure, password_change,
// google_link_success, google_link_blocked_unverified, refresh_token_reuse,
// account_deleted, admin_bootstrap.
//
// `actor` is who performed the action (null when nobody authenticated did
// — a failed login, a replayed token, the bootstrap script);
// `targetType`/`targetId` name what it was done to.
const AuditLog = require('../models/AuditLog');

const REDACTED_KEYS = new Set([
  'password', 'token', 'rawtoken', 'jwk', 'iv', 'credential',
  'refreshtoken', 'accesstoken', 'tokenhash', 'authorization', 'cookie',
]);

// Masks rather than drops an email — "which account" is exactly what a
// security log needs to be useful, but the full address doesn't belong in
// a log aggregator or an audit table with its own, longer retention.
const maskEmail = (email) => {
  if (typeof email !== 'string' || !email.includes('@')) return undefined;
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
};

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

// Recursive — this now lands in a persistent collection, so a sensitive key
// nested one level down must not slip through either.
const redactMeta = (meta) => {
  if (!isPlainObject(meta)) return {};

  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key.toLowerCase() === 'email') {
      out.email = maskEmail(value);
    } else if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = '[redacted]';
    } else if (isPlainObject(value)) {
      out[key] = redactMeta(value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

const idOrNull = (id) => (id ? String(id) : null);

// Never throws. A failed audit write is reported but doesn't fail the
// request that triggered it — otherwise a degraded database would turn
// every login into a 500 on top of whatever else it's already breaking.
const logSecurityEvent = async (action, { actor, targetType, targetId, ip, meta } = {}) => {
  const entry = {
    action,
    actor: idOrNull(actor),
    targetType: targetType || null,
    targetId: idOrNull(targetId),
    meta: redactMeta(meta),
    ip: ip || null,
  };

  console.log(JSON.stringify({ type: 'security_event', ...entry, timestamp: new Date().toISOString() }));

  try {
    await AuditLog.create(entry);
  } catch (err) {
    // err.name only — a validation error message can echo field values.
    console.error(`Audit log write failed for "${action}": ${err.name}`);
  }
};

module.exports = { logSecurityEvent, maskEmail };
