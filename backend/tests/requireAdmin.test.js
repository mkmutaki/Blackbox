// SECURITY_HARDENING_PROMPT.md §6.3: requireAdmin reads `role` from the
// user authMiddleware resolved, never from the token. No real route is
// mounted with it yet, so the integration cases below build a throwaway
// app with one admin-only endpoint instead of touching app.js.
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/requireAdmin');
const { JWT_ISSUER, JWT_AUDIENCE } = require('../services/jwt');
const { createUserAndAgent, User } = require('./helpers');

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('requireAdmin (unit)', () => {
  it('returns 401 when no authenticated user is on the request', () => {
    const res = mockRes();
    const next = vi.fn();
    requireAdmin({}, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin user', () => {
    const res = mockRes();
    const next = vi.fn();
    requireAdmin({ user: { userId: 'u1', role: 'user' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when role is missing entirely', () => {
    const res = mockRes();
    const next = vi.fn();
    requireAdmin({ user: { userId: 'u1' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for an admin', () => {
    const res = mockRes();
    const next = vi.fn();
    requireAdmin({ user: { userId: 'u1', role: 'admin' } }, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireAdmin chained after authMiddleware', () => {
  const adminApp = express();
  adminApp.use(cookieParser());
  adminApp.get('/admin-only', authMiddleware, requireAdmin, (req, res) => res.json({ ok: true }));

  const accessCookieOf = async (agent) => {
    // The agent's jar holds the real httpOnly access cookie set at register.
    const res = await agent.post('/api/auth/refresh');
    const line = res.headers['set-cookie'].find((c) => c.startsWith('accessToken='));
    return line.split(';')[0];
  };

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(adminApp).get('/admin-only');
    expect(res.status).toBe(401);
  });

  it('rejects a regular user with 403', async () => {
    const { agent } = await createUserAndAgent();
    const res = await request(adminApp).get('/admin-only').set('Cookie', await accessCookieOf(agent));
    expect(res.status).toBe(403);
  });

  it('admits a user whose role is "admin" in the database', async () => {
    const { agent, email } = await createUserAndAgent();
    await User.updateOne({ email }, { role: 'admin' });

    const res = await request(adminApp).get('/admin-only').set('Cookie', await accessCookieOf(agent));
    expect(res.status).toBe(200);
  });

  it('ignores a `role: "admin"` claim inside an otherwise-valid token', async () => {
    const { email } = await createUserAndAgent();
    const user = await User.findOne({ email });

    const forged = jwt.sign(
      { userId: user._id.toString(), tokenVersion: user.tokenVersion, role: 'admin' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: '15m' }
    );

    const res = await request(adminApp).get('/admin-only').set('Cookie', `accessToken=${forged}`);
    expect(res.status).toBe(403);
  });

  it('demoting an admin takes effect on the very next request, same token', async () => {
    const { agent, email } = await createUserAndAgent();
    await User.updateOne({ email }, { role: 'admin' });
    const cookie = await accessCookieOf(agent);

    expect((await request(adminApp).get('/admin-only').set('Cookie', cookie)).status).toBe(200);

    await User.updateOne({ email }, { role: 'user' });
    expect((await request(adminApp).get('/admin-only').set('Cookie', cookie)).status).toBe(403);
  });
});
