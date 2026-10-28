// Client-side mirror of the backend's zod email check (authRoutes.js
// emailSchema), so a malformed address is caught on the email step instead
// of surfacing as a generic "Invalid request" after the password step. Not
// authoritative — the backend re-validates regardless.
export const EMAIL_MAX_LENGTH = 254;

// Same pattern as zod v4's z.string().email(). Stricter than the browser's
// input[type=email] check, which accepts things like "a@b".
const EMAIL_PATTERN =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export const validateEmailFormat = (email: string): string | null => {
  const trimmed = email.trim();
  if (!trimmed) {
    return 'Please enter your email address';
  }
  if (trimmed.length > EMAIL_MAX_LENGTH) {
    return 'Email address is too long';
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return 'Please enter a valid email address';
  }
  return null;
};

// Typo suggestions are advisory only: a well-formed address is never
// blocked, the user is just asked whether they meant something else.
const COMMON_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'mail.com',
  'gmx.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'yandex.com',
];

// Not real TLDs, but common slips when typing ".com".
const COM_TYPOS = ['con', 'cmo', 'ocm', 'vom', 'xom', 'cpm', 'comm', 'coom', 'cm'];

// Optimal string alignment distance: insertions, deletions, substitutions
// and adjacent transpositions ("gmial" -> "gmail") each cost 1.
const editDistance = (a: string, b: string): number => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
};

// Returns a corrected address when the domain looks like a typo of a common
// provider or of ".com", otherwise null. Expects an already well-formed email.
export const suggestEmailCorrection = (email: string): string | null => {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return null;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (COMMON_DOMAINS.includes(domain)) return null;

  // Short domains get less slack, so a legitimate small domain isn't
  // "corrected" into a big provider.
  const maxDistance = domain.length >= 9 ? 2 : 1;
  let best: { domain: string; distance: number } | null = null;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }
  if (best) return `${local}@${best.domain}`;

  const dot = domain.lastIndexOf('.');
  if (COM_TYPOS.includes(domain.slice(dot + 1))) {
    return `${local}@${domain.slice(0, dot)}.com`;
  }

  return null;
};
