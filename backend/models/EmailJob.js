const mongoose = require('mongoose');

// The email outbox (services/emailQueue.js). A request never talks to the
// email provider: it writes one of these and returns, and the worker sends
// it, retrying with backoff until `giveUpAt`. Surviving a restart, a
// provider outage or a slow API is the whole point of storing it here.
//
// Holds no message content and no raw token — the worker builds both at
// send time (see deriveActionToken in services/tokens.js), so reading this
// collection never hands out a usable link.
const EmailJobSchema = new mongoose.Schema({
  kind: { type: String, enum: ['email_verify', 'password_reset', 'waitlist_welcome'], required: true },
  // Set for verification jobs, and for reset jobs once the worker has
  // matched the address to an account.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Reset jobs only: the address exactly as requested. Resolved to an
  // account by the worker, not the request, so the request does the same
  // work whether or not the account exists (SEC-10). Cleared once the job
  // finishes.
  email: { type: String, default: null },
  // Waitlist welcome jobs only: the entry to write to. The address is read
  // from it at send time rather than copied here.
  waitlistEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'WaitlistEntry', default: null },
  status: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'pending',
  },
  attempts: { type: Number, default: 0 },
  runAt: { type: Date, default: Date.now },
  // A claimed job whose lease runs out (the worker crashed or was
  // redeployed mid-send) is claimed again. The idempotency key makes that
  // retry safe even if the first send actually went out.
  lockedUntil: { type: Date, default: null },
  giveUpAt: { type: Date, required: true },
  // Provider error name or an internal reason — never a provider message,
  // which can echo the recipient's address.
  lastError: { type: String, default: null },
  providerMessageId: { type: String, default: null },
  sentAt: { type: Date, default: null },
  // Set when the job finishes; MongoDB deletes it then. Null while active.
  purgeAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

EmailJobSchema.index({ status: 1, runAt: 1 });
EmailJobSchema.index({ status: 1, lockedUntil: 1 });
EmailJobSchema.index({ userId: 1, kind: 1, status: 1 });
// The waitlist daily cap counts recent sends of one kind.
EmailJobSchema.index({ kind: 1, sentAt: -1 });
EmailJobSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmailJob', EmailJobSchema);
