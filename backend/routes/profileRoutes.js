const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { updateProfile, getProfile, completeOnboarding } = require('../controllers/profileController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');

// Idle-lock intervals the client is allowed to choose from. 0 means never.
// Mirrors User.profile.autoLockMinutes's schema enum.
const AUTO_LOCK_CHOICES = [0, 5, 15, 30];

// 32-char cap applied consistently to every route that can set username —
// completeOnboarding already had this; updateProfile previously had none
// at all (SEC-20).
const usernameSchema = z.string().trim().min(1).max(32).optional();

const updateProfileSchema = z.object({
  username: usernameSchema,
  dateOfBirth: z.string().min(1),
});

const onboardingSchema = z.object({
  username: usernameSchema,
  autoLockMinutes: z.coerce.number()
    .refine((v) => AUTO_LOCK_CHOICES.includes(v), 'Invalid auto-lock interval')
    .optional(),
});

// Get user profile
router.get('/', authMiddleware, getProfile);

// Update user profile
router.put('/update', authMiddleware, validate(updateProfileSchema), updateProfile);

// Save onboarding answers (new accounts only)
router.post('/onboarding', authMiddleware, validate(onboardingSchema), completeOnboarding);

module.exports = router;
