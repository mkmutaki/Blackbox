// Admin gate (SECURITY_HARDENING_PROMPT.md §6.3). Must be chained after
// authMiddleware: it reads `req.user.role`, which authMiddleware sets from
// the user document it resolves on every request — not from the access
// token. A token can't carry its way into admin access, and demoting a user
// takes effect on their very next request.
//
// No routes are mounted with this yet; the admin panel will be the first.
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authorization denied - No token provided' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
};

module.exports = { requireAdmin };
