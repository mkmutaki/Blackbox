const mongoose = require('mongoose');

// Email addresses left on the landing page to hear when the mobile app is
// ready. Deliberately separate from User: signing up needs no account, and
// an entry carries nothing but the address and when it was left.
const WaitlistEntrySchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WaitlistEntry', WaitlistEntrySchema);
