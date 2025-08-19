const express = require('express');
const router = express.Router();
const { updateProfile, getProfile } = require('../controllers/profileController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Get user profile
router.get('/', authMiddleware, getProfile);

// Update user profile
router.put('/update', authMiddleware, updateProfile);

module.exports = router;
