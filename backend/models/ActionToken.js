const mongoose = require('mongoose');

// Single-use, expiring, hashed tokens for email verification and password
// reset — identical shape and lifecycle for both, so one model backs them,
// distinguished by `purpose`. Never stores the raw token.
const ActionTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  purpose: { type: String, enum: ['email_verify', 'password_reset'], required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

ActionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ActionToken', ActionTokenSchema);
