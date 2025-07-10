const express = require('express');
const router = express.Router();
const multer = require('multer');
const AWS = require('aws-sdk');
const Video = require('../models/Video');
const { authMiddleware } = require('../middleware/authMiddleware');

// Configure multer to store files in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Configure AWS S3
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// Apply auth middleware to all video routes
router.use(authMiddleware);

// Helper function to calculate SOL day (days since January 1st of current year)
const calculateSolDay = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const diffInMs = now - startOfYear;
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  return diffInDays + 1; // +1 because SOL days start from 1
};

// @route   POST /api/videos
// @desc    Upload encrypted video
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { iv, jwk, title } = req.body;
    const file = req.file;
    const userId = req.user.userId;

  console.log('Received POST /api/videos');
  console.log('req.file:', req.file);
  console.log('req.body.iv:', req.body.iv);
  console.log('req.body.jwk:', req.body.jwk);
  console.log('req.body.title:', req.body.title);

    if (!file || !iv || !jwk) {
      return res.status(400).json({ error: 'File, iv, and jwk are required' });
    }

    const s3Key = `videos/${userId}/${Date.now()}-${file.originalname}`;
    await s3
      .putObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
      })
      .promise();

    // Get the next entry number for this user
    const lastEntry = await Video.findOne({ ownerId: userId })
      .sort({ entryNumber: -1 })
      .limit(1);
    
    const entryNumber = lastEntry ? lastEntry.entryNumber + 1 : 1;
    const solDay = calculateSolDay();
    
    const video = new Video({
      title,
      s3Key,
      iv,
      jwk: JSON.parse(jwk),
      ownerId: userId,
      entryNumber,
      solDay,
      category: `SOL-${solDay}`
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
        createdAt: v.createdAt,
        entryNumber: v.entryNumber,
        solDay: v.solDay,
        category: v.category
      };
    });

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
    
    const url = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: video.s3Key,
      Expires: 3600, // 1 hour
    });
    
    res.json({
      id: video._id,
      title: video.title,
      url,
      iv: video.iv,
      jwk: video.jwk,
      createdAt: video.createdAt,
      entryNumber: video.entryNumber,
      solDay: video.solDay,
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
    await s3.deleteObject({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: video.s3Key,
    }).promise();
    
    // Delete from database
    await video.deleteOne();
    
    res.json({ message: 'Video deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;