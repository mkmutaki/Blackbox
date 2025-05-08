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
    const { iv, jwk, title, missionDay, entryNumber } = req.body;
    const file = req.file;

    if (!file || !iv || !jwk) {
      return res.status(400).json({ error: 'File, iv, and jwk are required' });
    }

    const s3Key = `videos/${req.user.userId}/${Date.now()}-${file.originalname}`;
    await s3
      .putObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
      })
      .promise();

    const video = new Video({
      title,
      s3Key,
      iv,
      jwk: JSON.parse(jwk),
      ownerId: req.user.userId,
      missionDay: missionDay || null,
      entryNumber: entryNumber || null
    });
    await video.save();

    res.status(201).json({ id: video._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/videos
// @desc    Get all encrypted videos with signed URLs for the current user
router.get('/', async (req, res) => {
  try {
    // Only return videos owned by the current user
    const videos = await Video.find({ ownerId: req.user.userId }).sort({ createdAt: -1 });

    const results = videos.map((v) => {
      const url = s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: v.s3Key,
        Expires: 3600, // 1 hour
      });
      return { 
        id: v._id, 
        title: v.title, 
        url, 
        iv: v.iv, 
        jwk: v.jwk, 
        missionDay: v.missionDay,
        entryNumber: v.entryNumber,
        createdAt: v.createdAt 
      };
    });

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/videos/:id
// @desc    Delete a video
router.delete('/:id', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Ensure the user owns this video
    if (video.ownerId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this video' });
    }
    
    // Delete from S3
    await s3.deleteObject({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: video.s3Key
    }).promise();
    
    // Delete from database
    await Video.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Video deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;