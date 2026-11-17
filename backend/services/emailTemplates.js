// Subject, plain text and HTML for each kind of email. The plain-text part
// carries everything; the HTML part is the same words with a button, kept
// to inline styles because email clients ignore stylesheets.
const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:8080';

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const renderHtml = ({ heading, intro, buttonLabel, link, footer }) => `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;">
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${escapeHtml(intro)}</p>
        <p style="margin:0 0 24px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;">${escapeHtml(buttonLabel)}</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#52525b;">Or paste this link into your browser:<br><span style="word-break:break-all;">${escapeHtml(link)}</span></p>
        <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#52525b;">${escapeHtml(footer)}</p>
      </td></tr>
    </table>
  </body>
</html>`;

const TEMPLATES = {
  email_verify: (rawToken) => {
    const link = `${frontendUrl()}/verify-email?token=${rawToken}`;
    const intro = 'Confirm this is your email address.';
    const footer = "This link expires in 24 hours. If you didn't create a Blackbox account, you can ignore this email.";
    return {
      subject: 'Verify your Blackbox email',
      text: `${intro}\n\n${link}\n\n${footer}`,
      html: renderHtml({ heading: 'Verify your email', intro, buttonLabel: 'Verify email', link, footer }),
    };
  },
  password_reset: (rawToken) => {
    const link = `${frontendUrl()}/reset-password?token=${rawToken}`;
    const intro = 'Someone asked to reset the password for your Blackbox account.';
    const footer = "This link expires in 1 hour. If you didn't ask for this, ignore this email: your password won't change.";
    return {
      subject: 'Reset your Blackbox password',
      text: `${intro}\n\nReset your password: ${link}\n\n${footer}`,
      html: renderHtml({ heading: 'Reset your password', intro, buttonLabel: 'Reset password', link, footer }),
    };
  },
};

const buildEmail = (kind, rawToken) => TEMPLATES[kind](rawToken);

module.exports = { buildEmail };
