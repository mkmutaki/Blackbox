// Print the mobile-app waitlist as CSV (email,joined_at), oldest first.
// Read-only: it never changes or removes entries.
//
//   npm run waitlist:export > waitlist.csv
//
// Connects to whatever MONGO_URI points at (backend/.env). The CSV holds
// personal data — keep it out of the repo and delete it once used.
const path = require('node:path');
const mongoose = require('mongoose');
const WaitlistEntry = require('../models/WaitlistEntry');

const toCsv = (entries) => [
  'email,joined_at',
  ...entries.map(({ email, createdAt }) => `${email},${createdAt.toISOString()}`),
].join('\n');

const exportWaitlist = async () => {
  const entries = await WaitlistEntry.find({}, { email: 1, createdAt: 1 }).sort({ createdAt: 1 }).lean();
  return { count: entries.length, csv: toCsv(entries) };
};

const main = async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  // Same connection call as server.js — no dbName override (database
  // naming is deliberately untouched until the planned migration).
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const { count, csv } = await exportWaitlist();
    // Status on stderr so redirecting stdout gives a clean CSV file.
    console.error(`Connected to ${mongoose.connection.host}: ${count} waitlist entries`);
    console.log(csv);
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`Export failed: ${err.name}: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { exportWaitlist };
