const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const hibpService = require('../services/hibp');

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

const registerUser = async (overrides = {}) => {
  const agent = createAgent();
  const body = {
    email: uniqueEmail(),
    password: VALID_PASSWORD,
    fullName: 'Test User',
    dateOfBirth: '1990-01-01',
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

module.exports = {
  uniqueEmail,
  registerUser,
  createUserAndAgent,
  createAgent,
  TEST_ORIGIN,
  VALID_PASSWORD,
  app,
  User,
  hibpService,
};
