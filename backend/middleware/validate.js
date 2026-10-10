// Generic request-shape validation. Every route that accepts a body/query
// goes through here instead of ad-hoc presence checks, so a field's *type*
// is pinned (not just its truthiness) — that's the actual SEC-06 fix: a
// NoSQL operator payload like {"$ne": null} fails z.string() before it can
// ever reach a Mongoose filter. Unknown keys are stripped by zod's default
// object behaviour, so a client can't smuggle extra fields (e.g. a future
// `role`) past the allowlist.
const mongoose = require('mongoose');

const validate = (schema, part = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[part]);

  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  req[part] = result.data;
  next();
};

// Mongoose throws a CastError on a syntactically invalid ObjectId, which
// without this would fall into the generic 500 handler (SEC-12). A
// well-formed but non-existent id is a separate case, left to the route's
// own ownership-scoped query to turn into a 404.
const objectIdParam = (paramName = 'id') => (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params[paramName])) {
    return res.status(400).json({ error: `Invalid ${paramName}` });
  }
  next();
};

module.exports = { validate, objectIdParam };
