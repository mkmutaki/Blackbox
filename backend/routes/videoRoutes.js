const express = require('express');
const router = express.Router();
const multer = require('multer');
const AWS = require('aws-sdk');
const Video = require('../models/Video');

// Configure multer to store files in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Configure AWS S3
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// @route   POST /api/videos
// @desc    Upload encrypted video
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { iv, jwk, title } = req.body;
    const file = req.file;

    if (!file || !iv || !jwk) {
      return res.status(400).json({ message: 'File, iv, and jwk are required' });
    }

    const s3Key = `videos/${Date.now()}-${file.originalname}`;
    await s3
      .putObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
      })
      .promise();

    const video = new Video({ title, s3Key, iv, jwk: JSON.parse(jwk) });
    await video.save();

    res.status(201).json({ id: video._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/videos
// @desc    Get all encrypted videos with signed URLs
router.get('/', async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });

    const results = videos.map((v) => {
      const url = s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: v.s3Key,
        Expires: 3600, // 1 hour
      });
      return { id: v._id, title: v.title, url, iv: v.iv, jwk: v.jwk, createdAt: v.createdAt };
    });

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;