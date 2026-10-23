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
  deleteAccount,
  acceptTerms,
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { authIpLimiter, authAccountLimiter, refreshIpLimiter, deleteAccountLimiter } = require('../middleware/rateLimit');
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

const dateOfBirthSchema = z.string().min(1).max(40);
// Just a type/length pin — the controller compares it to the current
// version and answers a mismatch with TERMS_ACCEPTANCE_REQUIRED.
const termsVersionSchema = z.string().min(1).max(40);

const registerSchema = z.object({
  email: emailSchema,
  password: passwordInputSchema,
  fullName: z.string().trim().min(1).max(100),
  dateOfBirth: dateOfBirthSchema,
  acceptedTermsVersion: termsVersionSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordInputSchema,
});

// A Google ID token is ~1-2KB. The cap stops a 100KB "credential" from
// being parsed (and previously, logged) on every attempt.
const googleCredentialSchema = z.string().min(1).max(4096);

// dateOfBirth/acceptedTermsVersion are only needed when this credential
// would create a new account; signing in to an existing one ignores them.
const googleSchema = z.object({
  credential: googleCredentialSchema,
  dateOfBirth: dateOfBirthSchema.optional(),
  acceptedTermsVersion: termsVersionSchema.optional(),
});

const acceptTermsSchema = z.object({
  acceptedTermsVersion: termsVersionSchema,
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordInputSchema,
});

// Exactly one of these is actually required, depending on the account's
// authProvider — the controller enforces that; this just pins whichever
// is present to a sane type/length.
const deleteAccountSchema = z.object({
  password: z.string().min(1).max(256).optional(),
  credential: googleCredentialSchema.optional(),
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

// Authenticate (or register) a user via Google. IP limit only: the body has
// no email to key a per-account limit on (it would fall back to IP at the
// account limit's 5 per 15 minutes, shared by everyone behind that IP), and
// a Google-signed credential can't be guessed anyway.
router.post('/google', authIpLimiter, validate(googleSchema), googleAuth);

// Server-side logout — revokes the refresh-token family, clears cookies
router.post('/logout', logout);

// Rotate the refresh token for a new access token
router.post('/refresh', refreshIpLimiter, refresh);

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

// Record that the signed-in user agreed to the current Terms + Privacy
// Policy — for accounts that predate acceptance, or after a material change.
router.post('/accept-terms', authMiddleware, validate(acceptTermsSchema), acceptTerms);

// Permanently delete the caller's own account — requires re-authentication
// (password, or a fresh Google credential for Google accounts), enforced
// in the controller since which field is required depends on the
// account's authProvider.
router.delete('/account', authMiddleware, deleteAccountLimiter, validate(deleteAccountSchema), deleteAccount);

module.exports = router;
