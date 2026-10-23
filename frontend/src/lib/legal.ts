// Mirrors backend/services/legal.js — kept in sync manually since the two
// apps don't share a package. The version is what the sign-up checkbox and
// the acceptance prompt send, so it must match the text the pages under
// pages/legal/ actually show: change the documents materially, bump both.
export const CURRENT_TERMS_VERSION = '2026-10-21';
export const LEGAL_EFFECTIVE_DATE = 'October 21, 2026';

export const CONTACT_EMAIL = 'detrick3d@gmail.com';

export const TERMS_ACCEPTANCE_REQUIRED = 'TERMS_ACCEPTANCE_REQUIRED';
export const SIGNUP_DETAILS_REQUIRED = 'SIGNUP_DETAILS_REQUIRED';

export const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/health-data', label: 'Consumer Health Data Privacy Policy' },
] as const;
