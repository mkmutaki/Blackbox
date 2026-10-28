const express = require('express');
const router = express.Router();
const { z } = require('zod');
const WaitlistEntry = require('../models/WaitlistEntry');
const { validate } = require('../middleware/validate');
const { waitlistIpLimiter } = require('../middleware/rateLimit');

const joinSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

// Join the mobile-app waitlist. Same response whether the address is new
// or already on the list, so the endpoint can't be used to check whether
// someone signed up. The upsert keeps the original sign-up time.
router.post('/', waitlistIpLimiter, validate(joinSchema), async (req, res, next) => {
  try {
    await WaitlistEntry.updateOne(
      { email: req.body.email },
      { $setOnInsert: { email: req.body.email, createdAt: new Date() } },
      { upsert: true }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    // Two concurrent upserts for one address can race on the unique index;
    // the address is on the list either way.
    if (err.code === 11000) return res.status(201).json({ ok: true });
    next(err);
  }
});

module.exports = router;
