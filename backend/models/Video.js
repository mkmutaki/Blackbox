const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  title: { type: String },
  s3Key: { type: String, required: true },
  iv: { type: String, required: true },
  jwk: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  // Fields for additional requirements
  entryNumber: { type: Number },
  synodicDay: { type: Number },
  category: { type: String },
  // Lets a future E2EE migration tell old- and new-format records apart
  // instead of guessing. Bump this if the encryption scheme ever changes.
  encVersion: { type: Number, required: true, default: 1 }
});

module.exports = mongoose.model('Video', VideoSchema);