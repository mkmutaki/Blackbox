// Backfills existing records for the onboarding release.
//
//   1. profile.fullName  <- profile.username  (the old field held the full name)
//   2. videos.solDay     -> videos.synodicDay
//   3. videos.category   "SOL-<n>" -> "SYN-<n>"
//
// Safe to run more than once: every step only touches documents that still
// need it. Accounts created before this release keep onboardingComplete at its
// schema default of true, so none of them are shown the flow.
//
// Usage: node scripts/migrateOnboarding.js

require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log('✅ MongoDB connected');

  const users = mongoose.connection.collection('users');
  const videos = mongoose.connection.collection('videos');

  const names = await users.updateMany(
    { 'profile.username': { $ne: null }, 'profile.fullName': { $in: [null, undefined] } },
    [{ $set: { 'profile.fullName': '$profile.username' } }]
  );
  console.log(`   fullName backfilled: ${names.modifiedCount}`);

  const renamed = await videos.updateMany(
    { solDay: { $exists: true } },
    { $rename: { solDay: 'synodicDay' } }
  );
  console.log(`   solDay -> synodicDay: ${renamed.modifiedCount}`);

  const categories = await videos.updateMany(
    { category: { $regex: '^SOL-' } },
    [{ $set: { category: { $replaceOne: { input: '$category', find: 'SOL-', replacement: 'SYN-' } } } }]
  );
  console.log(`   category SOL- -> SYN-: ${categories.modifiedCount}`);

  await mongoose.disconnect();
  console.log('✅ Migration complete');
};

run().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
