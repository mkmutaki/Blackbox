const mongoose = require('mongoose');

// Email addresses left on the waitlist page, for a welcome email and then
// updates about the mobile app. Deliberately separate from User: signing
// up needs no account, and an entry carries nothing but the address and
// when it was left.
const WaitlistEntrySchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WaitlistEntry', WaitlistEntrySchema);
