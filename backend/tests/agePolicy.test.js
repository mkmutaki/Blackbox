const { calculateAge, meetsMinimumAge, MIN_AGE_YEARS } = require('../services/agePolicy');

describe('agePolicy', () => {
  const FIXED_NOW = new Date('2026-06-15T00:00:00.000Z');

  it('MIN_AGE_YEARS is 13', () => {
    expect(MIN_AGE_YEARS).toBe(13);
  });

  it('counts a birthday that already passed this year at full years', () => {
    expect(calculateAge(new Date('2018-01-01'), FIXED_NOW)).toBe(8);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    // Born 2018-12-31: by 2026-06-15 they've only had 7 birthdays, not 8 —
    // a naive year subtraction would overcount this as 8.
    expect(calculateAge(new Date('2018-12-31'), FIXED_NOW)).toBe(7);
  });

  it('handles the exact-birthday boundary correctly', () => {
    expect(calculateAge(new Date('2018-06-15'), FIXED_NOW)).toBe(8);
    expect(calculateAge(new Date('2018-06-16'), FIXED_NOW)).toBe(7);
    expect(calculateAge(new Date('2018-06-14'), FIXED_NOW)).toBe(8);
  });

  it('meetsMinimumAge is true at exactly 13 and false one day short of it', () => {
    expect(meetsMinimumAge(new Date('2013-06-15'), FIXED_NOW)).toBe(true);
    expect(meetsMinimumAge(new Date('2013-06-16'), FIXED_NOW)).toBe(false);
  });

  it('meetsMinimumAge is false for a 12-year-old and true for an adult', () => {
    expect(meetsMinimumAge(new Date('2014-01-01'), FIXED_NOW)).toBe(false);
    expect(meetsMinimumAge(new Date('1990-01-01'), FIXED_NOW)).toBe(true);
  });
});
