const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');

const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

const registerUser = async (overrides = {}) => {
  const body = {
    email: uniqueEmail(),
    password: 'correct horse battery staple',
    fullName: 'Test User',
    dateOfBirth: '1990-01-01',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  return { res, body };
};

const createUserAndToken = async (overrides = {}) => {
  const { res, body } = await registerUser(overrides);
  return { token: res.body.token, user: res.body.user, password: body.password, email: body.email };
};

const tokenFor = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

module.exports = { uniqueEmail, registerUser, createUserAndToken, tokenFor, app, User };
