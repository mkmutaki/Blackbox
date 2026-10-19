// STUB — no email provider is wired in yet (deliberate: see
// SECURITY_HARDENING_PROMPT.md §5.D, "ask which email provider to use
// before implementing" — not yet answered, so this logs instead of
// sending). Email verification and password reset are fully functional in
// code, but a user cannot self-serve either one in production right now —
// nothing reaches an inbox. Swap the body of `sendEmail` for a real
// provider call (Resend/SES/SendGrid/etc.) and nothing else in the app
// needs to change — every caller already goes through this one function.
//
// The message body carries a live single-use token (a password-reset link
// is enough to take over the account), so it is only ever printed when
// EMAIL_STUB_PRINT_LINKS=true is set explicitly — for local development.
// Fails closed: an unset NODE_ENV on a real deploy must not be enough to
// put reset links and full addresses into the host's logs (SEC-32).
const { maskEmail } = require('./securityLog');

const sendEmail = async ({ to, subject, text }) => {
  if (process.env.EMAIL_STUB_PRINT_LINKS === 'true') {
    console.log(`[email:stub] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  console.log(`[email:stub] not sent (no email provider configured): to=${maskEmail(to)} subject="${subject}"`);
};

const sendVerificationEmail = async (user, rawToken) => {
  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/verify-email?token=${rawToken}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your Blackbox email',
    text: `Confirm this is your email address: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  });
};

const sendPasswordResetEmail = async (user, rawToken) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/reset-password?token=${rawToken}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your Blackbox password',
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore it.`,
  });
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
