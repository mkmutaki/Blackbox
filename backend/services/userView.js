// Single place every route shapes a User document into a response. Never
// hand a raw Mongoose document back to the client (SEC-13) — `password`,
// `googleId`, `tokenVersion` and anything added later (e.g. a future
// `role`) stay server-side unless explicitly added here.
const { hasAcceptedCurrentTerms } = require('./legal');

const toSafeUser = (user) => ({
  id: user._id,
  email: user.email,
  authProvider: user.authProvider,
  emailVerified: user.emailVerified,
  profile: user.profile,
  termsAcceptanceRequired: !hasAcceptedCurrentTerms(user),
  createdAt: user.createdAt,
});

module.exports = { toSafeUser };
