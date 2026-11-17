// What the rest of the app calls to send an email. Each function only
// queues the email (services/emailQueue.js sends it) and never throws: a
// failure to queue is logged, and the request that triggered it carries on
// — a registration must not fail, after the account already exists,
// because an email couldn't be queued.
const mongoose = require('mongoose');
const EmailJob = require('../models/EmailJob');
const { enqueueEmail } = require('./emailQueue');

const queue = async (label, job) => {
  try {
    await enqueueEmail(job);
    return true;
  } catch (err) {
    console.error(`[email] could not queue ${label} email: ${err?.name || 'Error'}`);
    return false;
  }
};

const queueVerificationEmail = (userId) => queue('verification', { kind: 'email_verify', userId });

// Takes the address, not an account: the worker looks the account up, so
// the request does the same work whether or not one exists (SEC-10).
const queuePasswordResetEmail = (email) => queue('password reset', { kind: 'password_reset', email });

// Takes the new entry's id: the worker reads the address from it, so an
// entry removed before the send gets nothing.
const queueWaitlistWelcome = (waitlistEntryId) => queue('waitlist welcome', { kind: 'waitlist_welcome', waitlistEntryId });

// For "send me a new link": skipped while an earlier verification email for
// this account is still waiting to go out, so repeated clicks during an
// outage don't stack up copies.
const resendVerificationEmail = async (userId) => {
  try {
    const waiting = await EmailJob.exists({
      userId,
      kind: 'email_verify',
      status: mongoose.trusted({ $in: ['pending', 'sending'] }),
    });
    if (waiting) return true;
  } catch (err) {
    console.error(`[email] could not check for a queued verification email: ${err?.name || 'Error'}`);
    return false;
  }
  return queueVerificationEmail(userId);
};

module.exports = { queueVerificationEmail, queuePasswordResetEmail, queueWaitlistWelcome, resendVerificationEmail };
