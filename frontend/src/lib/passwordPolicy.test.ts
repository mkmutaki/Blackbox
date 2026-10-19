import { describe, expect, it } from 'vitest';
import { validatePasswordComposition, PASSWORD_MAX_BYTES } from './passwordPolicy';

describe('validatePasswordComposition', () => {
  it('accepts a password that meets every rule', () => {
    expect(validatePasswordComposition('C0rrect!Horse')).toBeNull();
  });

  it('accepts exactly the byte limit and refuses one byte more, like the backend', () => {
    const base = 'Aa1!';
    expect(validatePasswordComposition(base + 'x'.repeat(PASSWORD_MAX_BYTES - base.length))).toBeNull();
    expect(validatePasswordComposition(base + 'x'.repeat(PASSWORD_MAX_BYTES - base.length + 1))).toMatch(/too long/);
  });

  it('counts UTF-8 bytes, not characters', () => {
    // 4 + 35 × 2 = 74 bytes in 39 characters.
    expect(validatePasswordComposition('Aa1!' + 'é'.repeat(35))).toMatch(/too long/);
  });
});
