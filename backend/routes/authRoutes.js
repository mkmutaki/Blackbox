const express = require('express');
const router = express.Router();
const { register, login, getCurrentUser } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', register);

// @route   POST /api/auth/login
// @desc    Login user
router.post('/login', login);

// @route   GET /api/auth/me
// @desc    Get current user
router.get('/me', authMiddleware, getCurrentUser);

module.exports = router;