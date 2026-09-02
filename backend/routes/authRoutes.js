const express = require('express');
const router = express.Router();
const { register, login, googleAuth, getCurrentUser } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Register a new user
router.post('/register', register);

// Login a user
router.post('/login', login);

// Authenticate (or register) a user via Google
router.post('/google', googleAuth);

// Get current user (protected route)
router.get('/me', authMiddleware, getCurrentUser);

module.exports = router;