const crypto = require('node:crypto');

// Raw token: high-entropy, sent to the client (cookie, or emailed link).
// Only its hash is ever persisted — same principle as password storage, so
// reading the database doesn't hand out usable sessions or reset links.
const generateRawToken = () => crypto.randomBytes(32).toString('hex');

const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

// The raw token for an emailed link, derived from the email job's id
// rather than drawn at random. A retried send must be byte-identical to
// the first attempt — the provider rejects a reused idempotency key with a
// different body — and deriving it means the raw token never has to be
// stored to achieve that. Keyed with JWT_SECRET under its own label, so
// it can't collide with any other use of that secret; without the secret,
// a database reader still can't compute a link.
const deriveActionToken = (jobId) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(`email-action-token:v1:${jobId}`).digest('hex');

// The token in a waitlist email's unsubscribe link: a signature over the
// entry's id, so it needs no storage and every email to that entry carries
// the same working link. Rotating JWT_SECRET invalidates links already
// sent; the person can still email us to be removed.
const deriveUnsubscribeToken = (entryId) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(`waitlist-unsubscribe:v1:${entryId}`).digest('hex');

const isValidUnsubscribeToken = (entryId, token) => {
  const expected = Buffer.from(deriveUnsubscribeToken(entryId), 'hex');
  const given = Buffer.from(token, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

module.exports = { generateRawToken, hashToken, deriveActionToken, deriveUnsubscribeToken, isValidUnsubscribeToken };
