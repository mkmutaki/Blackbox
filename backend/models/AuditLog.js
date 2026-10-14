const mongoose = require('mongoose');

// Append-only record of security-relevant events (SECURITY_HARDENING_PROMPT.md
// §6.2) — the store a future admin panel's audit view reads from. Written
// only through services/securityLog.js, which redacts `meta` before it gets
// here.
//
// `actor` is who performed the action: the signed-in user, a future admin,
// or null when there is no authenticated actor (a failed login, a replayed
// refresh token, the bootstrap script). `targetType`/`targetId` name what
// the action was about. Entries deliberately outlive a deleted account —
// the record that an account was deleted is the whole point.
const AuditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  action: { type: String, required: true },
  targetType: { type: String, default: null },
  // A string rather than an ObjectId so non-document targets (e.g. a
  // refresh-token familyId) fit without a schema change.
  targetId: { type: String, default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false });

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

// Append-only, enforced rather than just promised: every Mongoose update
// or delete path on this model throws. (A raw driver call via
// AuditLog.collection bypasses these hooks — that's what the test suite's
// between-test cleanup relies on — so no application code may use it.)
const appendOnlyError = () => new Error('AuditLog is append-only');

AuditLogSchema.pre('save', function (next) {
  next(this.isNew ? undefined : appendOnlyError());
});

AuditLogSchema.pre(
  ['updateOne', 'deleteOne'],
  { document: true, query: true },
  function (next) { next(appendOnlyError()); }
);

AuditLogSchema.pre(
  ['updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'findOneAndDelete', 'deleteMany'],
  function (next) { next(appendOnlyError()); }
);

AuditLogSchema.pre('bulkWrite', function (next) { next(appendOnlyError()); });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
