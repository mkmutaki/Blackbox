const crypto = require('node:crypto');

// Raw token: high-entropy, sent to the client (cookie, or emailed link).
// Only its hash is ever persisted — same principle as password storage, so
// reading the database doesn't hand out usable sessions or reset links.
const generateRawToken = () => crypto.randomBytes(32).toString('hex');

const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

module.exports = { generateRawToken, hashToken };
