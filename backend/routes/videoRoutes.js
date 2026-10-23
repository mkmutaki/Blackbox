const express = require('express');
const router = express.Router();
const { z } = require('zod');
const {
  presign,
  finalize,
  listVideos,
  getVideo,
  updateVideoTitle,
  deleteVideo,
} = require('../controllers/videoController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireCurrentTerms } = require('../middleware/requireCurrentTerms');
const {
  presignIpLimiter,
  presignAccountLimiter,
  finalizeIpLimiter,
  finalizeAccountLimiter,
} = require('../middleware/rateLimit');
const { validate, objectIdParam } = require('../middleware/validate');

// Consistent length cap everywhere a title can be set (SEC-20 — previously
// uncapped in both places it's written).
const titleSchema = z.string().trim().min(1).max(200);

const finalizeSchema = z.object({
  key: z.string().min(1).max(500),
  iv: z.string().min(1).max(200),
  // Still JSON.parse'd and validated in the controller — this just pins
  // type/length so an absurdly large or non-string value can't reach that
  // parse at all.
  jwk: z.string().min(1).max(10000),
  title: titleSchema,
});

const patchTitleSchema = z.object({
  title: titleSchema,
});

// Apply auth middleware to all video routes
router.use(authMiddleware);

// Only the two routes that take in a new recording need current terms —
// reading, renaming and deleting existing entries never do.
router.post('/presign', presignIpLimiter, presignAccountLimiter, requireCurrentTerms, presign);
router.post('/finalize', finalizeIpLimiter, finalizeAccountLimiter, requireCurrentTerms, validate(finalizeSchema), finalize);
router.get('/', listVideos);
router.get('/:id', objectIdParam('id'), getVideo);
router.patch('/:id', objectIdParam('id'), validate(patchTitleSchema), updateVideoTitle);
router.delete('/:id', objectIdParam('id'), deleteVideo);

module.exports = router;
