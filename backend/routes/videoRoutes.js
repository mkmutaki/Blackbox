
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Video = require('../models/Video');

const router = express.Router();

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Get all videos
router.get('/', async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    
    const videosWithUrls = videos.map(video => {
      return {
        id: video._id,
        title: video.title,
        url: `/api/videos/${video._id}/stream`,
        iv: video.iv,
        jwk: video.jwk,
        createdAt: video.createdAt
      };
    });
    
    res.json(videosWithUrls);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// Upload video
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { title, iv, jwk } = req.body;
    
    if (!title || !iv || !jwk) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Parse IV from JSON string
    const parsedIv = JSON.parse(iv);
    
    // Create new video entry
    const video = new Video({
      title,
      filename: req.file.filename,
      iv: parsedIv,
      jwk
    });
    
    await video.save();
    
    res.status(201).json({
      id: video._id,
      title: video.title,
      createdAt: video.createdAt
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

// Stream video
router.get('/:id/stream', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const filePath = path.join(__dirname, '../uploads', video.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error streaming video:', error);
    res.status(500).json({ error: 'Failed to stream video' });
  }
});

module.exports = router;
