const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  title: { type: String },
  s3Key: { type: String, required: true },
  iv: { type: String, required: true },
  jwk: { type: mongoose.Schema.Types.Mixed, required: true },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  entryNumber: { type: Number },
  missionDay: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Video', VideoSchema);