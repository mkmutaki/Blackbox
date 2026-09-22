const express = require('express');
const router = express.Router();
const { updateProfile, getProfile, completeOnboarding } = require('../controllers/profileController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Get user profile
router.get('/', authMiddleware, getProfile);

// Update user profile
router.put('/update', authMiddleware, updateProfile);

// Save onboarding answers (new accounts only)
router.post('/onboarding', authMiddleware, completeOnboarding);

module.exports = router;
