import { describe, expect, it } from 'vitest';
import { suggestEmailCorrection, validateEmailFormat, EMAIL_MAX_LENGTH } from './emailPolicy';

describe('validateEmailFormat', () => {
  it('accepts well-formed addresses', () => {
    for (const email of ['user@gmail.com', 'first.last+tag@sub.example.co.uk', ' padded@x.co ']) {
      expect(validateEmailFormat(email)).toBeNull();
    }
  });

  it('refuses an empty address', () => {
    expect(validateEmailFormat('   ')).toMatch(/enter your email/);
  });

  it('refuses addresses the backend would refuse, including ones the browser allows', () => {
    for (const email of ['a@b', 'foo@gmail', 'plainaddress', 'foo@@x.com', '.a@x.com', 'a..b@x.com', 'a b@x.com', 'a@-x.com', 'a@x.c']) {
      expect(validateEmailFormat(email)).toMatch(/valid email/);
    }
  });

  it('refuses addresses over the length limit', () => {
    const email = 'a'.repeat(EMAIL_MAX_LENGTH - 'x.com'.length) + '@x.com';
    expect(validateEmailFormat(email)).toMatch(/too long/);
  });
});

describe('suggestEmailCorrection', () => {
  it('suggests the common provider for a misspelt domain', () => {
    expect(suggestEmailCorrection('foo@gmial.com')).toBe('foo@gmail.com');
    expect(suggestEmailCorrection('foo@gmail.co')).toBe('foo@gmail.com');
    expect(suggestEmailCorrection('foo@hotmial.com')).toBe('foo@hotmail.com');
    expect(suggestEmailCorrection('foo@yahooo.com')).toBe('foo@yahoo.com');
    expect(suggestEmailCorrection('foo@outlok.com')).toBe('foo@outlook.com');
  });

  it('fixes a ".com" typo on any domain', () => {
    expect(suggestEmailCorrection('foo@acme.con')).toBe('foo@acme.com');
    expect(suggestEmailCorrection('foo@gmail.con')).toBe('foo@gmail.com');
  });

  it('keeps the local part as typed', () => {
    expect(suggestEmailCorrection('First.Last@GMIAL.com')).toBe('First.Last@gmail.com');
  });

  it('leaves correct and unrelated domains alone', () => {
    for (const email of ['foo@gmail.com', 'foo@mail.com', 'foo@me.com', 'foo@x.co', 'foo@acme.io', 'foo@company.org']) {
      expect(suggestEmailCorrection(email)).toBeNull();
    }
  });
});
