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

// Hash the password before saving
UserSchema.pre('save', async function(next) {
  // Only hash the password if it's set and modified (Google-only accounts have no password)
  if (!this.password || !this.isModified('password')) return next();
  
  try {
    // Generate salt and hash
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);