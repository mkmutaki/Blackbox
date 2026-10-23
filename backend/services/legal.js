// Which version of the legal documents (Terms of Service, Privacy Policy and
// the Washington Consumer Health Data notice) a user has agreed to. One
// version covers the set — they're accepted together, with one checkbox.
// Mirrors frontend/src/lib/legal.ts, kept in sync manually the same way
// agePolicy is: the frontend sends the version it actually showed, and a
// stale bundle gets TERMS_ACCEPTANCE_REQUIRED instead of silently agreeing
// to text the person never saw.
//
// Bump this only for a *material* change. Every account whose recorded
// version differs is asked to accept again before it can record anything
// new, so a typo fix must not bump it.
const CURRENT_TERMS_VERSION = '2026-10-21';

// The frontend keys its UI off these, not off the human-readable message.
const TERMS_ACCEPTANCE_REQUIRED = 'TERMS_ACCEPTANCE_REQUIRED';
const SIGNUP_DETAILS_REQUIRED = 'SIGNUP_DETAILS_REQUIRED';

const hasAcceptedCurrentTerms = (user) => user?.termsAcceptance?.version === CURRENT_TERMS_VERSION;

const recordTermsAcceptance = (user, now = new Date()) => {
  user.termsAcceptance = { version: CURRENT_TERMS_VERSION, acceptedAt: now };
};

module.exports = {
  CURRENT_TERMS_VERSION,
  TERMS_ACCEPTANCE_REQUIRED,
  SIGNUP_DETAILS_REQUIRED,
  hasAcceptedCurrentTerms,
  recordTermsAcceptance,
};
