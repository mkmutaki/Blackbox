const User = require('../models/User');
const { ACCESS_TOKEN_COOKIE } = require('../services/cookies');
const { verifyAccessToken } = require('../services/jwt');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

    if (!token) {
      return res.status(401).json({ error: 'Authorization denied - No token provided' });
    }

    const decoded = verifyAccessToken(token);

    // Resolved from the database on every request — not just decoded from
    // the token — so a password change or detected token-reuse (both bump
    // tokenVersion) invalidates this access token immediately instead of
    // waiting up to its own 15-minute lifetime. Also means a deleted user's
    // old token stops working the moment the account is gone, not later.
    const user = await User.findById(decoded.userId).select('tokenVersion role');

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Token is not valid' });
    }

    // role comes from the database row just loaded, never from a token
    // claim — requireAdmin relies on that, so a role change (or a forged
    // `role` claim) can't outlive or outrank what the database says.
    req.user = { userId: decoded.userId, tokenVersion: decoded.tokenVersion, role: user.role };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = { authMiddleware };
