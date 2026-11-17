const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const hibpService = require('../services/hibp');
const emailProvider = require('../services/emailProvider');
const { drainEmailQueue } = require('../services/emailQueue');
const { CURRENT_TERMS_VERSION } = require('../services/legal');

// Default for every test in every file that requires this helper (i.e. all
// of them) — registration and password reset must not depend on a real
// network call to Have I Been Pwned actually succeeding, or on whichever
// fixture password a test happens to pick not colliding with a real breach.
// Tests that specifically exercise the breached-password path override
// this with hibpService.isPasswordBreached.mockResolvedValueOnce(true).
vi.spyOn(hibpService, 'isPasswordBreached').mockResolvedValue(false);

// Must be in csrf.js's ALLOWED_ORIGINS — every state-changing request needs
// this now that the CSRF middleware enforces it.
const TEST_ORIGIN = 'http://localhost:3000';

// Satisfies the password policy (8+ chars, upper, digit, special) so tests
// don't have to restate it everywhere a password is needed.
const VALID_PASSWORD = 'C0rrect!Horse';

const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

// supertest's agent persists cookies across requests, same as a real
// browser — required now that the session lives in httpOnly cookies
// rather than a bearer token a test could copy into an Authorization
// header. Wrapping each state-changing verb to always carry the Origin
// header means individual tests don't have to remember the CSRF check
// exists.
const createAgent = () => {
  const agent = request.agent(app);
  ['post', 'put', 'patch', 'delete'].forEach((method) => {
    const original = agent[method].bind(agent);
    agent[method] = (url) => original(url).set('Origin', TEST_ORIGIN);
  });
  return agent;
};

// What a brand-new Google identity has to send alongside its credential
// before an account is created for it (SIGNUP_DETAILS_REQUIRED otherwise).
const GOOGLE_SIGNUP = { dateOfBirth: '1990-01-01', acceptedTermsVersion: CURRENT_TERMS_VERSION };

const registerUser = async (overrides = {}) => {
  const agent = createAgent();
  const body = {
    email: uniqueEmail(),
    password: VALID_PASSWORD,
    fullName: 'Test User',
    dateOfBirth: '1990-01-01',
    acceptedTermsVersion: CURRENT_TERMS_VERSION,
    ...overrides,
  };
  const res = await agent.post('/api/auth/register').send(body);
  return { agent, res, body };
};

// Returns a logged-in agent (cookies already set) plus the fields a test
// commonly needs — not a token, since there isn't one to hand out anymore.
const createUserAndAgent = async (overrides = {}) => {
  const { agent, res, body } = await registerUser(overrides);
  return { agent, user: res.body.user, password: body.password, email: body.email };
};

// Runs the email worker over everything queued so far (it never runs on
// its own in tests) and returns the messages it sent, in order. The
// provider is mocked: nothing leaves the process.
const deliverEmails = async () => {
  const send = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue({ id: 'test-message-id' });
  try {
    await drainEmailQueue();
    return send.mock.calls.map(([message]) => message);
  } finally {
    send.mockRestore();
  }
};

// The token from the link in an email, read the way a person would follow it.
const linkTokenFrom = (message) => new URL(message.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

// Delivers the queue and returns the token from the one email that
// links to `path` ('/verify-email' or '/reset-password').
const deliverLinkToken = async (path) => {
  const message = (await deliverEmails()).find((sent) => sent.text.includes(`${path}?token=`));
  return message ? linkTokenFrom(message) : null;
};

module.exports = {
  uniqueEmail,
  deliverEmails,
  linkTokenFrom,
  deliverLinkToken,
  registerUser,
  createUserAndAgent,
  createAgent,
  TEST_ORIGIN,
  VALID_PASSWORD,
  CURRENT_TERMS_VERSION,
  GOOGLE_SIGNUP,
  app,
  User,
  hibpService,
};
