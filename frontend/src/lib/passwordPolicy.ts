// Client-side mirror of backend/services/passwordPolicy.js's composition
// rules, for fast feedback before a submit round-trip. Not authoritative —
// the backend re-checks this plus the HIBP breach lookup regardless, since
// client-side validation can always be bypassed.
export const PASSWORD_MIN_LENGTH = 8;

export const validatePasswordComposition = (password: string): string | null => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
};
