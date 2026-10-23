// Mirrors backend/services/agePolicy.js — kept in sync manually since the
// two apps don't share a package. This is the client-side pre-check only;
// the server is the one that actually enforces it.
export const MIN_AGE_YEARS = 13;

// Month/day-aware, not a bare year subtraction — someone born late in the
// calendar year would otherwise be overcounted by nearly a full year until
// their actual birthday passes, letting a too-young date of birth slip
// past a naive check right at the boundary.
export const calculateAge = (birthDate: Date, now: Date = new Date()): number => {
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
};

export const meetsMinimumAge = (birthDate: Date, now: Date = new Date()): boolean =>
  calculateAge(birthDate, now) >= MIN_AGE_YEARS;
