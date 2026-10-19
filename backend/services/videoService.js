// Video storage and database logic, kept out of the HTTP layer
// (SECURITY_HARDENING_PROMPT.md §6.4) so the owner-facing controller, the
// account-deletion cascade, and a future admin panel all share one
// implementation of "where does this live in S3 and how is it removed".
//
// Key material: only toOwnerVideoView() returns `jwk`/`iv`, and only the
// owner's own GET endpoints call it. Anything that shows a video to anyone
// else must build its own view without them — tests/keyMaterial.test.js
// enforces that across every route.
const crypto = require('node:crypto');
const Video = require('../models/Video');
const Counter = require('../models/Counter');
const s3 = require('./s3Client');

const BUCKET = process.env.S3_BUCKET_NAME;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 200 * 1024 * 1024; // 200MB default
// S3 checks this against the time it finishes receiving the request, not
// just when it starts — too short a window fails legitimate uploads on a
// slow connection mid-transfer, not just stale/leaked ones. 5 minutes is
// short relative to the old signed-URL lifetime (1hr) while leaving room
// for a real recording (app markets "sixty seconds is plenty") to finish
// uploading even on a slow link.
const PRESIGN_EXPIRY_SECONDS = 300;
const GET_URL_EXPIRY_SECONDS = 300; // 5 minutes — was 1 hour (SEC-11)
const UPLOAD_CONTENT_TYPE = 'application/octet-stream';

// Days since January 1st of the current year, starting from 1.
const calculateSynodicDay = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const diffInMs = now - startOfYear;
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  return diffInDays + 1;
};

// Atomic per-user counter — a concurrent "read current max, add one" query
// can hand two uploads the same entryNumber; findOneAndUpdate's $inc cannot.
const getNextEntryNumber = async (ownerId) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: `video-entry:${ownerId}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return counter.seq;
};

const uploadKeyPrefix = (ownerId) => `videos/${ownerId}/`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Exactly the shape createUploadTarget produces — videos/<own id>/<uuid> —
// not merely the right prefix. A prefix check alone would accept
// `videos/<own id>/../<other id>/...`, which is only harmless for as long
// as every layer between here and S3 keeps treating keys literally (SEC-40).
const isOwnUploadKey = (ownerId, key) => {
  const prefix = uploadKeyPrefix(ownerId);
  return key.startsWith(prefix) && UUID_PATTERN.test(key.slice(prefix.length));
};

// Server-generated key only — a client-supplied filename never reaches
// storage (SEC-09).
const createUploadTarget = async (ownerId) => {
  const key = `${uploadKeyPrefix(ownerId)}${crypto.randomUUID()}`;

  const { url, fields } = await s3.createPresignedPost({
    bucket: BUCKET,
    key,
    contentType: UPLOAD_CONTENT_TYPE,
    maxBytes: MAX_UPLOAD_BYTES,
    expiresSeconds: PRESIGN_EXPIRY_SECONDS,
  });

  return { url, fields, key };
};

const isKeyFinalized = (key) => Video.exists({ s3Key: key });

const uploadExists = async (key) => (await s3.headObject({ bucket: BUCKET, key })).exists;

const createVideoRecord = async ({ ownerId, key, iv, jwk, title }) => {
  const entryNumber = await getNextEntryNumber(ownerId);
  const synodicDay = calculateSynodicDay();

  return Video.create({
    title,
    s3Key: key,
    iv,
    jwk,
    ownerId,
    entryNumber,
    synodicDay,
    category: `SYN-${synodicDay}`,
    encVersion: 1,
  });
};

const findVideosByOwner = (ownerId) => Video.find({ ownerId }).sort({ createdAt: -1 });

// Ownership is part of the query itself, so another user's id is
// indistinguishable from a non-existent one (both null -> 404).
const findOwnedVideo = (ownerId, videoId) => Video.findOne({ _id: videoId, ownerId });

const renameVideo = async (video, title) => {
  video.title = title;
  await video.save();
  return video;
};

const deleteVideoObject = (video) => s3.deleteObject({ bucket: BUCKET, key: video.s3Key });

// S3 first: if that throws, the record survives and the delete can simply
// be retried, rather than leaving an object nothing points to.
const deleteVideo = async (video) => {
  await deleteVideoObject(video);
  await video.deleteOne();
};

// OWNER ONLY — includes the decryption key. See the note at the top.
const toOwnerVideoView = async (video) => ({
  id: video._id,
  title: video.title,
  url: await s3.getSignedGetUrl({
    bucket: BUCKET,
    key: video.s3Key,
    expiresSeconds: GET_URL_EXPIRY_SECONDS,
  }),
  iv: video.iv,
  jwk: video.jwk,
  createdAt: video.createdAt,
  entryNumber: video.entryNumber,
  synodicDay: video.synodicDay,
  category: video.category,
});

module.exports = {
  isOwnUploadKey,
  createUploadTarget,
  uploadExists,
  isKeyFinalized,
  createVideoRecord,
  findVideosByOwner,
  findOwnedVideo,
  renameVideo,
  deleteVideoObject,
  deleteVideo,
  toOwnerVideoView,
};
