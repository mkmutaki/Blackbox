const express = require('express');
const router = express.Router();
const { z } = require('zod');
const {
  register,
  login,
  googleAuth,
  logout,
  refresh,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  getCurrentUser,
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { authIpLimiter, authAccountLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');

// Pinning email to z.string().email() is the actual SEC-06 fix — an
// operator payload like {"$ne": null} fails type validation here, long
// before it could ever reach a Mongoose filter. Unknown keys (a client
// trying to smuggle something like `role`) are stripped by zod's default
// object behaviour.
const emailSchema = z.string().trim().toLowerCase().email().max(254);
// Composition (uppercase/digit/special) and breach-checking are handled by
// services/passwordPolicy.js — this only pins the type and a sane max
// length so an absurdly long password can't be used to pressure bcrypt.
const passwordInputSchema = z.string().min(1).max(256);

const registerSchema = z.object({
  email: emailSchema,
  password: passwordInputSchema,
  fullName: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().min(1),
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordInputSchema,
});

const googleSchema = z.object({
  credential: z.string().min(1),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordInputSchema,
});

// validate() runs before the per-account limiter (not just before the
// controller) so the limiter's key is read from the already-normalized
// (trimmed/lowercased) email — otherwise varying case or whitespace on the
// same address would key as different "accounts" and the per-account limit
// would never actually trigger.

// Register a new user
router.post('/register', authIpLimiter, validate(registerSchema), authAccountLimiter, register);

// Login a user
router.post('/login', authIpLimiter, validate(loginSchema), authAccountLimiter, login);

// Authenticate (or register) a user via Google
router.post('/google', authIpLimiter, validate(googleSchema), authAccountLimiter, googleAuth);

// Server-side logout — revokes the refresh-token family, clears cookies
router.post('/logout', logout);

// Rotate the refresh token for a new access token
router.post('/refresh', refresh);

// Consume an emailed verification link
router.post('/verify-email', validate(verifyEmailSchema), verifyEmail);

// Request / consume a password-reset link. request-password-reset
// deliberately isn't run through validate() here — it has its own
// type/format check inline that falls through to the same no-enumeration
// generic response on malformed input instead of a 400, so malformed input
// can't be distinguished from "no such account" either (SEC-10).
router.post('/request-password-reset', authIpLimiter, authAccountLimiter, requestPasswordReset);
router.post('/reset-password', authIpLimiter, validate(resetPasswordSchema), resetPassword);

// Get current user (protected route)
router.get('/me', authMiddleware, getCurrentUser);

module.exports = router;
