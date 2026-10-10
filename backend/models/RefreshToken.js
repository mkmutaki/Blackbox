const mongoose = require('mongoose');

// Backs rotating refresh tokens with reuse detection. Never stores the raw
// token — only its hash, same principle as password storage, so reading
// this collection doesn't hand out live sessions.
//
// familyId ties every token descended from one login event together: each
// successful /refresh issues a new token in the same family and marks the
// old one's replacedByHash. A token being presented a second time after
// it's already been replaced means someone is replaying a stolen token —
// the legitimate client would always hold the newest one — so the whole
// family gets revoked, not just that one token.
const RefreshTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  familyId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedByHash: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

RefreshTokenSchema.index({ userId: 1, familyId: 1 });
// Mongo TTL index: once a token is past its own expiry, let the database
// reclaim it rather than growing this collection forever.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);
