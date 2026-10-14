// Idempotent cascade-delete for a user's account (SECURITY_HARDENING_PROMPT.md
// §5.G, built as the reusable service §6.5 describes so a later admin
// deletion path calls this exact function instead of duplicating S3/DB
// cleanup logic). Removes every trace of a user: their videos (DB records
// and S3 objects), refresh/action tokens, the per-user entry counter, and
// the user document itself. AuditLog entries are deliberately kept — the
// record that the account existed and was deleted is what they're for.
//
// Safe to call twice — anything already gone is simply skipped rather than
// erroring, so a retry after a partial failure (e.g. one S3 delete
// throwing, or the database dropping mid-way) can't make things worse.
const User = require('../models/User');
const Video = require('../models/Video');
const RefreshToken = require('../models/RefreshToken');
const ActionToken = require('../models/ActionToken');
const Counter = require('../models/Counter');
const { deleteVideoObject } = require('./videoService');

const deleteUserAccount = async (userId) => {
  // First, before anything is removed: invalidate every live session. If a
  // later step fails, the account is left half-deleted — this makes sure
  // it's also locked (authMiddleware rejects the old tokenVersion), so
  // nobody keeps using it until a retry finishes the job.
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });

  const videos = await Video.find({ ownerId: userId });

  // One bad S3 object must not block the rest of the cleanup — an orphaned
  // ciphertext object (undecryptable without its now-deleted DB record) is
  // a far smaller problem than failing to delete an account someone asked
  // to close. Failed keys are returned so the caller can record them in
  // the audit log for later cleanup.
  const failedS3Keys = [];
  for (const video of videos) {
    try {
      await deleteVideoObject(video);
    } catch (err) {
      console.error(`Account deletion: failed to delete S3 object ${video.s3Key}`, err);
      failedS3Keys.push(video.s3Key);
    }
  }

  await Video.deleteMany({ ownerId: userId });
  await RefreshToken.deleteMany({ userId });
  await ActionToken.deleteMany({ userId });
  await Counter.deleteOne({ _id: `video-entry:${userId}` });
  await User.findByIdAndDelete(userId);

  return { deletedVideoCount: videos.length, failedS3Keys };
};

module.exports = { deleteUserAccount };
