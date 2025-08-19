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
    required: true 
  },
  profile: {
    username: {
      type: String,
      trim: true,
      default: null
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
  // Only hash the password if it's modified (or new)
  if (!this.isModified('password')) return next();
  
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
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);