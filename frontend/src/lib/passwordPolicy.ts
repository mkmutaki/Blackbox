// Client-side mirror of backend/services/passwordPolicy.js's composition
// rules, for fast feedback before a submit round-trip. Not authoritative —
// the backend re-checks this plus the HIBP breach lookup regardless, since
// client-side validation can always be bypassed.
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything past 72 bytes (UTF-8), so the backend refuses
// longer passwords outright.
export const PASSWORD_MAX_BYTES = 72;

export const validatePasswordComposition = (password: string): string | null => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `Password is too long (maximum ${PASSWORD_MAX_BYTES} characters)`;
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
