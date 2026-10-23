const User = require('../models/User');
const { hasAcceptedCurrentTerms, TERMS_ACCEPTANCE_REQUIRED } = require('../services/legal');

// Runs after authMiddleware on the routes that take in new content. An
// account that hasn't agreed to the current terms (created before
// acceptance was recorded, or the terms changed since) can still read and
// delete what it already has — only recording something new is blocked
// until it accepts. Enforced here, not just by the frontend's prompt, so a
// client that skips the prompt can't upload around it.
const requireCurrentTerms = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('termsAcceptance');
    if (!hasAcceptedCurrentTerms(user)) {
      return res.status(403).json({
        error: 'Accept the current Terms of Service and Privacy Policy to keep recording.',
        code: TERMS_ACCEPTANCE_REQUIRED,
      });
    }
    next();
  } catch (error) {
    console.error(`Terms check failed: ${error?.name || 'Error'}`);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { requireCurrentTerms };
