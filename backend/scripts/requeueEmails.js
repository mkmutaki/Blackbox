// Recovery after an email outage. Prints how many queued emails failed,
// and why; with --requeue, puts failed verification and waitlist emails
// back in the queue. It never sends anything itself: the running server's email worker
// picks requeued jobs up within seconds, at its normal pace.
//
//   npm run email:requeue              # report only
//   npm run email:requeue -- --requeue # requeue failed verification and waitlist emails
//
// Connects to whatever MONGO_URI points at (backend/.env).
const path = require('node:path');
const mongoose = require('mongoose');
const EmailJob = require('../models/EmailJob');
const { requeueFailedEmails } = require('../services/emailQueue');

const summarizeFailedEmails = () =>
  EmailJob.aggregate([
    { $match: { status: 'failed' } },
    { $group: { _id: { kind: '$kind', lastError: '$lastError' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

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
    console.log(`Connected to ${mongoose.connection.host}`);
    const failed = await summarizeFailedEmails();
    if (failed.length === 0) {
      console.log('No failed emails.');
      return;
    }
    for (const { _id, count } of failed) {
      console.log(`  ${count} x ${_id.kind} (${_id.lastError || 'unknown'})`);
    }

    if (process.argv.includes('--requeue')) {
      const requeued = await requeueFailedEmails();
      console.log(`Requeued ${requeued} verification and waitlist email(s). Password reset emails are not requeued: an old reset link isn't wanted.`);
    } else {
      console.log('Report only. Run with --requeue to retry failed verification and waitlist emails.');
    }
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`Requeue failed: ${err.name}: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { summarizeFailedEmails };
