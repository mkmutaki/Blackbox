const jwt = require('jsonwebtoken');

const JWT_ISSUER = 'blackbox-api';
const JWT_AUDIENCE = 'blackbox-app';
const ACCESS_TOKEN_TTL = '15m';

// tokenVersion travels inside the token so authMiddleware can compare it
// against the current value on the user document without a second query
// field — one findById already fetches both.
const signAccessToken = (user) =>
  jwt.sign(
    { userId: user._id.toString(), tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: ACCESS_TOKEN_TTL }
  );

// Algorithm/issuer/audience pinned explicitly — jwt.verify() without this
// option set accepts whatever alg the token's own header claims, which is
// exactly the class of bug that lets a forged token slip through.
const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

module.exports = { signAccessToken, verifyAccessToken, JWT_ISSUER, JWT_AUDIENCE };
