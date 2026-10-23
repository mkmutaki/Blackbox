const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() { return !this.googleId; }
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  // True for Google accounts (Google already verified the email). Local
  // accounts start false; set true by clicking the emailed verification
  // link, or implicitly by completing a password reset (equally strong
  // proof the requester controls the inbox). Gates Google-account linking
  // — see googleAuth in authController.js — so pre-registering someone
  // else's email can't be used to hijack their later Google sign-in.
  emailVerified: {
    type: Boolean,
    default: false
  },
  // Bumped whenever every existing session should be invalidated at once
  // (password change, detected refresh-token reuse). authMiddleware checks
  // this on every request, so it takes effect within one access-token
  // lifetime instead of waiting up to 7 days for an old token to expire.
  tokenVersion: {
    type: Number,
    default: 0
  },
  // Settable only by a direct database operation or
  // scripts/bootstrapAdmin.js — never through any HTTP route. Every route
  // that writes a User builds its update from an explicit field allowlist,
  // and toSafeUser (services/userView.js) never returns it.
  // tests/role.test.js locks both in.
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // Which version of the Terms + Privacy Policy this account agreed to, and
  // when (services/legal.js). Null for accounts created before acceptance
  // was recorded — they're asked on their next visit. Each acceptance is
  // also written to the append-only AuditLog; that's the durable record,
  // this is the fast per-request check.
  termsAcceptance: {
    version: { type: String, default: null },
    acceptedAt: { type: Date, default: null }
  },
  profile: {
    // Immutable: captured once at sign-up and never editable afterwards.
    fullName: {
      type: String,
      trim: true,
      default: null
    },
    // The display name used on mission logs. Chosen during onboarding, editable later.
    username: {
      type: String,
      trim: true,
      default: null
    },
    // Idle timeout in minutes before the session auto-locks. 0 means never.
    autoLockMinutes: {
      type: Number,
      enum: [0, 5, 15, 30],
      default: 5
    },
    // Defaults to true so accounts created before onboarding existed are never
    // shown the flow. Registration explicitly sets it to false for new users.
    onboardingComplete: {
      type: Boolean,
      default: true
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    location: {
      type: String,
      trim: true,
      default: null
    },
    isProfileComplete: {
      type: Boolean,
      default: false
    }
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const BCRYPT_ROUNDS = 10;

// A hash of a random value nobody knows, at the same cost as real ones.
// Comparing against it costs the same time as checking a real password, so
// "no such account" and "account has no password" (Google-only) can't be
// told apart from "wrong password" by response time (SEC-35).
const DUMMY_HASH = bcrypt.hashSync(require('node:crypto').randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

// Hash the password before saving
UserSchema.pre('save', async function(next) {
  // Only hash the password if it's set and modified (Google-only accounts have no password)
  if (!this.password || !this.isModified('password')) return next();

  try {
    // Generate salt and hash
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Always false; exists only to spend the same time a real check would.
UserSchema.statics.compareAgainstDummyHash = async function(candidatePassword) {
  await bcrypt.compare(String(candidatePassword), DUMMY_HASH);
  return false;
};

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return this.constructor.compareAgainstDummyHash(candidatePassword);
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);