// Real age-gating (SECURITY_HARDENING_PROMPT.md §5.G data-minimisation
// follow-up): dateOfBirth was previously collected but never actually
// enforced as a minimum age, only checked against the future. Minimum age
// is a product decision, not a security one — raised and confirmed at 8
// years old.
const MIN_AGE_YEARS = 8;

// Month/day-aware, not a bare year subtraction — someone born late in the
// calendar year would otherwise be overcounted by nearly a full year until
// their actual birthday passes, letting a too-young date of birth slip
// through right at the boundary.
const calculateAge = (birthDate, now = new Date()) => {
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
};

const meetsMinimumAge = (birthDate, now = new Date()) => calculateAge(birthDate, now) >= MIN_AGE_YEARS;

module.exports = { MIN_AGE_YEARS, calculateAge, meetsMinimumAge };
