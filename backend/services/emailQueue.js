// The email outbox worker. Requests only write an EmailJob (enqueueEmail);
// this sends them, so a slow or failing provider never slows down or fails
// a request, and nothing is lost to a restart or an outage:
//
// - Claiming is one atomic findOneAndUpdate, so any number of server
//   instances can run this side by side and each job is sent by one.
// - A claim is a lease. If the worker dies mid-send the lease runs out and
//   the job is claimed again; the provider's idempotency key (one per job)
//   stops that retry sending a second copy.
// - Retryable failures back off exponentially (honouring the provider's
//   retry-after) until the job's giveUpAt, then it's marked failed.
//   scripts/requeueEmails.js puts failed verification emails back.
// - Finished jobs carry a purgeAt; a TTL index deletes them after that.
//
// Message content and the link's raw token are built here at send time,
// never stored. The token is derived from the job id, so every retry of a
// job sends the identical message the idempotency key requires.
const mongoose = require('mongoose');
const EmailJob = require('../models/EmailJob');
const ActionToken = require('../models/ActionToken');
const User = require('../models/User');
// Not destructured, so tests can spy on sendEmail.
const emailProvider = require('./emailProvider');
const { buildEmail } = require('./emailTemplates');
const { deriveActionToken, hashToken } = require('./tokens');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// linkTtlMs: how long the emailed link works, counted from the latest send
// attempt. giveUpAfterMs: how long after the request to keep retrying —
// a reset link that turns up hours later is useless; a verification email
// still matters the next day.
const KINDS = {
  email_verify: { linkTtlMs: 24 * HOUR, giveUpAfterMs: 24 * HOUR },
  password_reset: { linkTtlMs: HOUR, giveUpAfterMs: 30 * MINUTE },
};

const LEASE_MS = MINUTE; // well past the provider call's 15s timeout
const RETRY_BASE_MS = 30 * 1000;
const RETRY_MAX_MS = 30 * MINUTE;
const POLL_INTERVAL_MS = 10 * 1000;
// Resend allows 10 requests/second per team; one instance stays well under
// it, leaving room for a second instance and for anything else on the key.
const MIN_SEND_INTERVAL_MS = 200;
const FINISHED_RETENTION_MS = 30 * 24 * HOUR;

const enqueueEmail = async ({ kind, userId = null, email = null }) => {
  const now = Date.now();
  const job = await EmailJob.create({
    kind,
    userId,
    email,
    runAt: new Date(now),
    giveUpAt: new Date(now + KINDS[kind].giveUpAfterMs),
  });
  kick();
  return job;
};

// Due pending jobs, plus jobs whose lease ran out mid-send. Operators are
// wrapped in mongoose.trusted() because app.js turns on sanitizeFilter,
// which would otherwise neutralise them.
const claimNextJob = (now = new Date()) =>
  EmailJob.findOneAndUpdate(
    {
      $or: [
        { status: 'pending', runAt: mongoose.trusted({ $lte: now }) },
        { status: 'sending', lockedUntil: mongoose.trusted({ $lte: now }) },
      ],
    },
    { $set: { status: 'sending', lockedUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { sort: { runAt: 1 }, new: true },
  );

// Only the worker holding this exact claim may settle it: a worker whose
// lease ran out (and whose job was claimed again) must not overwrite the
// newer attempt's result.
const settle = (job, update) =>
  EmailJob.updateOne({ _id: job._id, status: 'sending', attempts: job.attempts }, { $set: { lockedUntil: null, ...update } });

const finish = (job, status, fields = {}) =>
  settle(job, { status, email: null, purgeAt: new Date(Date.now() + FINISHED_RETENTION_MS), ...fields });

const log = (job, outcome) => console.log(`[email] job=${job._id} kind=${job.kind} attempt=${job.attempts} ${outcome}`);

const backoffMs = (attempts) => {
  const base = Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
  return Math.round(base * (0.8 + Math.random() * 0.4)); // jitter spreads a burst of retries
};

const retryOrFail = async (job, code, retryAfterMs) => {
  const runAt = new Date(Date.now() + (retryAfterMs ?? backoffMs(job.attempts)));
  if (runAt >= job.giveUpAt) {
    log(job, `failed: ${code}, giving up`);
    return finish(job, 'failed', { lastError: code });
  }
  log(job, `failed: ${code}, retrying at ${runAt.toISOString()}`);
  return settle(job, { status: 'pending', runAt, lastError: code });
};

const resolveUser = (job) => (job.userId ? User.findById(job.userId) : User.findOne({ email: job.email }));

const attemptSend = async (job) => {
  const now = Date.now();
  if (job.giveUpAt.getTime() <= now) {
    log(job, 'expired before it could be sent');
    return finish(job, 'failed', { lastError: job.lastError || 'expired' });
  }

  const user = await resolveUser(job);
  if (!user) {
    // A reset requested for an address with no account: drop it, address
    // and all. A verification email whose account was deleted since.
    log(job, 'no matching account, dropped');
    return job.userId ? finish(job, 'cancelled', { lastError: 'no_account' }) : EmailJob.deleteOne({ _id: job._id });
  }
  if (job.kind === 'email_verify' && user.emailVerified) {
    log(job, 'already verified, cancelled');
    return finish(job, 'cancelled', { userId: user._id, lastError: 'already_verified' });
  }

  const rawToken = deriveActionToken(job._id);
  // Upsert: every attempt of this job maps to the same token. Each attempt
  // moves the expiry to a full TTL from now (never earlier), so a link is
  // never already near expiry when it lands.
  await ActionToken.updateOne(
    { tokenHash: hashToken(rawToken) },
    {
      $setOnInsert: { userId: user._id, purpose: job.kind },
      $max: { expiresAt: new Date(now + KINDS[job.kind].linkTtlMs) },
    },
    { upsert: true },
  );

  const { id } = await emailProvider.sendEmail({
    to: user.email,
    ...buildEmail(job.kind, rawToken),
    idempotencyKey: `email-job-${job._id}`,
  });

  log(job, 'sent');
  return finish(job, 'sent', { userId: user._id, sentAt: new Date(), providerMessageId: id, lastError: null });
};

const processJob = async (job) => {
  try {
    await attemptSend(job);
  } catch (err) {
    // Anything that isn't a provider verdict (a database blip, a bug) is
    // retried too: an email that might be lost is worse than a late one.
    const isProviderError = err instanceof emailProvider.EmailSendError;
    const code = isProviderError ? err.code : err?.name || 'Error';
    if (isProviderError && !err.retryable) {
      log(job, `failed: ${code}, not retryable`);
      return finish(job, 'failed', { lastError: code });
    }
    return retryOrFail(job, code, isProviderError ? err.retryAfterMs : null);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let draining = false;
let drainRequested = false;
let pollTimer = null;

// Sends every due job, one at a time. A call while a drain is already
// running asks that drain to look once more before it stops, so a job
// enqueued during its last empty claim isn't left for the next poll.
// Resolves to how many jobs this call processed (0 if it only asked).
const drainEmailQueue = async ({ paced = false } = {}) => {
  if (draining) {
    drainRequested = true;
    return 0;
  }
  draining = true;
  let processed = 0;
  try {
    do {
      drainRequested = false;
      let job;
      while ((job = await claimNextJob())) {
        await processJob(job);
        processed += 1;
        if (paced) await sleep(MIN_SEND_INTERVAL_MS);
      }
    } while (drainRequested);
  } catch (err) {
    // Claiming itself failed (database unreachable). The next poll tries again.
    console.error(`[email] queue drain stopped: ${err?.name || 'Error'}`);
  } finally {
    draining = false;
  }
  return processed;
};

// Runs in the web process (server.js) — no separate worker service to pay
// for or deploy. Polling picks up retries and jobs enqueued by other
// instances; kick() sends a fresh job straight away instead of waiting.
const startEmailWorker = () => {
  if (pollTimer) return;
  pollTimer = setInterval(() => drainEmailQueue({ paced: true }), POLL_INTERVAL_MS);
  pollTimer.unref();
  drainEmailQueue({ paced: true });
};

const stopEmailWorker = () => {
  clearInterval(pollTimer);
  pollTimer = null;
};

// Only once the worker is running: tests drain explicitly instead.
function kick() {
  if (pollTimer) setImmediate(() => drainEmailQueue({ paced: true }));
}

// Puts failed verification emails back in the queue with a fresh retry
// window. Reset emails are left alone: a stale reset link isn't wanted —
// the person just asks for a new one. The worker re-checks each account
// before sending, so a since-verified or deleted one is skipped then.
const requeueFailedVerificationEmails = async () => {
  const now = Date.now();
  const result = await EmailJob.updateMany(
    { kind: 'email_verify', status: 'failed' },
    {
      $set: {
        status: 'pending',
        attempts: 0,
        runAt: new Date(now),
        giveUpAt: new Date(now + KINDS.email_verify.giveUpAfterMs),
        lockedUntil: null,
        purgeAt: null,
      },
    },
  );
  return result.modifiedCount;
};

module.exports = {
  enqueueEmail,
  claimNextJob,
  drainEmailQueue,
  startEmailWorker,
  stopEmailWorker,
  requeueFailedVerificationEmails,
  KINDS,
  LEASE_MS,
};
