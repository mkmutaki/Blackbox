// The one place that talks to the email provider (Resend). Called only by
// the outbox worker (services/emailQueue.js) — never from a request.
//
// With RESEND_API_KEY unset (local dev, tests, e2e) it's a stub that logs
// instead of sending. The message body carries a live single-use token (a
// password-reset link is enough to take over the account), so the stub
// prints it only when EMAIL_STUB_PRINT_LINKS=true is set explicitly. Fails
// closed: an unset NODE_ENV on a real deploy must not be enough to put
// reset links and full addresses into the host's logs (SEC-32).
//
// Plain fetch rather than Resend's SDK: the worker's retry decisions hang
// on the HTTP status and error name, which the raw response gives directly.
const { maskEmail } = require('./securityLog');

const RESEND_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 15000;

// Error names Resend documents as safe to retry as-is. Everything at 5xx
// is retried too. 401/403 mean a bad key or an unverified sending domain:
// every send fails until the owner fixes the configuration, so those are
// retried (and logged loudly) rather than failing every queued email.
const RETRYABLE_NAMES = new Set([
  'rate_limit_exceeded',
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
  'concurrent_idempotent_requests',
  'resource_locked',
]);

class EmailSendError extends Error {
  constructor(code, { retryable, retryAfterMs = null, status = null } = {}) {
    super(`Email send failed: ${code}`);
    this.name = 'EmailSendError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.status = status;
  }
}

const isConfigured = () => Boolean(process.env.RESEND_API_KEY);

const parseRetryAfterMs = (response) => {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
};

// Only the error name is kept: Resend's messages can quote the request,
// including the recipient's address.
const readErrorName = async (response) => {
  try {
    const body = await response.json();
    return typeof body?.name === 'string' ? body.name : `http_${response.status}`;
  } catch {
    return `http_${response.status}`;
  }
};

const sendViaResend = async ({ to, subject, text, html, idempotencyKey }) => {
  let response;
  try {
    response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'blackbox-backend',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject,
        text,
        html,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (err) {
    // Timed out or never reached Resend. It may still have sent; the
    // retry reuses the idempotency key, so it won't send twice.
    throw new EmailSendError(err?.name === 'TimeoutError' ? 'timeout' : 'network_error', { retryable: true });
  }

  if (response.ok) {
    const body = await response.json().catch(() => ({}));
    return { id: typeof body?.id === 'string' ? body.id : null };
  }

  const { status } = response;
  const code = await readErrorName(response);
  const retryable = status >= 500 || status === 401 || status === 403 || RETRYABLE_NAMES.has(code);
  if (status === 401 || status === 403) {
    console.error(`[email] Resend refused the request (${status} ${code}): check RESEND_API_KEY and that the EMAIL_FROM domain is verified`);
  }
  throw new EmailSendError(code, { retryable, retryAfterMs: parseRetryAfterMs(response), status });
};

const sendViaStub = async ({ to, subject, text }) => {
  if (process.env.EMAIL_STUB_PRINT_LINKS === 'true') {
    console.log(`[email:stub] to=${to} subject="${subject}"\n${text}`);
  } else {
    console.log(`[email:stub] not sent (no email provider configured): to=${maskEmail(to)} subject="${subject}"`);
  }
  return { id: null };
};

// Resolves to { id } (the provider's message id, null from the stub), or
// throws an EmailSendError whose `retryable` says whether to try again.
const sendEmail = (message) => (isConfigured() ? sendViaResend(message) : sendViaStub(message));

module.exports = { sendEmail, isConfigured, EmailSendError };
