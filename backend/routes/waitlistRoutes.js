const express = require('express');
const router = express.Router();
const { z } = require('zod');
const WaitlistEntry = require('../models/WaitlistEntry');
const emailService = require('../services/email');
const { validate } = require('../middleware/validate');
const { waitlistIpLimiter, waitlistUnsubscribeIpLimiter } = require('../middleware/rateLimit');
const { isValidUnsubscribeToken } = require('../services/tokens');

const joinSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

// Join the mobile-app waitlist. Same response whether the address is new
// or already on the list, so the endpoint can't be used to check whether
// someone signed up. The upsert keeps the original sign-up time.
//
// Only a new entry gets the welcome email, so submitting an address again
// can't be used to send it repeated mail. Queueing never fails the request
// (services/email.js): the address is on the list either way.
router.post('/', waitlistIpLimiter, validate(joinSchema), async (req, res, next) => {
  try {
    const result = await WaitlistEntry.updateOne(
      { email: req.body.email },
      { $setOnInsert: { email: req.body.email, createdAt: new Date() } },
      { upsert: true }
    );
    if (result.upsertedId) await emailService.queueWaitlistWelcome(result.upsertedId);
    res.status(201).json({ ok: true });
  } catch (err) {
    // Two concurrent upserts for one address can race on the unique index;
    // the address is on the list either way, and the request that inserted
    // it queued the welcome.
    if (err.code === 11000) return res.status(201).json({ ok: true });
    next(err);
  }
});

const unsubscribeSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});

// The unsubscribe link in every waitlist email. Removes the address
// outright (Privacy Policy section 6: kept until you ask us to remove it),
// and a welcome still queued for it is cancelled when the worker finds the
// entry gone. A link that was already used succeeds again, so a second
// click doesn't look like a failure.
router.post('/unsubscribe', waitlistUnsubscribeIpLimiter, validate(unsubscribeSchema), async (req, res, next) => {
  try {
    if (!isValidUnsubscribeToken(req.body.id, req.body.token)) {
      return res.status(400).json({ error: 'This unsubscribe link is invalid.' });
    }
    await WaitlistEntry.deleteOne({ _id: req.body.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
