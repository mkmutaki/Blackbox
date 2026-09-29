const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const Video = require('../models/Video');
const Counter = require('../models/Counter');
const { authMiddleware } = require('../middleware/authMiddleware');
const s3 = require('../services/s3Client');

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

// Apply auth middleware to all video routes
router.use(authMiddleware);

// Helper function to calculate the synodic day (days since January 1st of current year)
const calculateSynodicDay = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const diffInMs = now - startOfYear;
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  return diffInDays + 1; // +1 because synodic days start from 1
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

// @route   POST /api/videos/presign
// @desc    Get a presigned POST so the browser can upload the encrypted
//          video straight to S3 — Express never buffers the file.
router.post('/presign', async (req, res) => {
  try {
    const userId = req.user.userId;
    // Server-generated key only — a client-supplied filename never reaches
    // storage (SEC-09).
    const key = `videos/${userId}/${crypto.randomUUID()}`;

    const { url, fields } = await s3.createPresignedPost({
      bucket: BUCKET,
      key,
      contentType: UPLOAD_CONTENT_TYPE,
      maxBytes: MAX_UPLOAD_BYTES,
      expiresSeconds: PRESIGN_EXPIRY_SECONDS,
    });

    res.json({ url, fields, key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/videos/finalize
// @desc    Confirm the upload actually landed in S3, then write the DB
//          record. Called after the browser's direct-to-S3 upload succeeds.
router.post('/finalize', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { key, iv, jwk, title } = req.body;

    if (!key || !iv || !jwk) {
      return res.status(400).json({ error: 'key, iv, and jwk are required' });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Defence in depth: the key was server-generated under this user's own
    // prefix at /presign time — reject anything else even though a
    // mismatched key could never have a valid upload behind it.
    if (!key.startsWith(`videos/${userId}/`)) {
      return res.status(403).json({ error: 'Invalid upload key' });
    }

    const head = await s3.headObject({ bucket: BUCKET, key });
    if (!head.exists) {
      return res.status(400).json({ error: 'Upload not found — please record and save again' });
    }

    let parsedJwk;
    try {
      parsedJwk = JSON.parse(jwk);
    } catch (parseError) {
      return res.status(400).json({ error: 'Invalid jwk' });
    }

    const entryNumber = await getNextEntryNumber(userId);
    const synodicDay = calculateSynodicDay();

    const video = new Video({
      title,
      s3Key: key,
      iv,
      jwk: parsedJwk,
      ownerId: userId,
      entryNumber,
      synodicDay,
      category: `SYN-${synodicDay}`,
      encVersion: 1,
    });

    await video.save();

    res.status(201).json({ id: video._id, entryNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/videos
// @desc    Get all encrypted videos with signed URLs for the current user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const videos = await Video.find({ ownerId: userId }).sort({ createdAt: -1 });

    const results = await Promise.all(videos.map(async (v) => {
      const url = await s3.getSignedGetUrl({
        bucket: BUCKET,
        key: v.s3Key,
        expiresSeconds: GET_URL_EXPIRY_SECONDS,
      });
      return {
        id: v._id,
        title: v.title,
        url,
        iv: v.iv,
        jwk: v.jwk,
        createdAt: v.createdAt,
        entryNumber: v.entryNumber,
        synodicDay: v.synodicDay,
        category: v.category
      };
    }));

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/videos/:id
// @desc    Get a specific video by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const video = await Video.findOne({ _id: req.params.id, ownerId: userId });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const url = await s3.getSignedGetUrl({
      bucket: BUCKET,
      key: video.s3Key,
      expiresSeconds: GET_URL_EXPIRY_SECONDS,
    });

    res.json({
      id: video._id,
      title: video.title,
      url,
      iv: video.iv,
      jwk: video.jwk,
      createdAt: video.createdAt,
      entryNumber: video.entryNumber,
      synodicDay: video.synodicDay,
      category: video.category
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PATCH /api/videos/:id
// @desc    Update video title
router.patch('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title } = req.body;

    // Validate input
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Find the video and ensure it belongs to the current user
    const video = await Video.findOne({ _id: req.params.id, ownerId: userId });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Update the title
    video.title = title;
    await video.save();

    res.json({ message: 'Video updated successfully', video: { id: video._id, title: video.title } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/videos/:id
// @desc    Delete a video
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const video = await Video.findOne({ _id: req.params.id, ownerId: userId });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Delete from S3
    await s3.deleteObject({ bucket: BUCKET, key: video.s3Key });

    // Delete from database
    await video.deleteOne();

    res.json({ message: 'Video deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
