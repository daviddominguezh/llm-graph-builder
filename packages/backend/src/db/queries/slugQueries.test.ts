import { describe, expect, it } from '@jest/globals';

import { generateTenantSlug } from './slugQueries.js';

// The DB CHECK allows up to 40; the generator caps at 37 to leave
// headroom for findUniqueTenantSlug's numeric suffix (up to 3 digits).
const TENANT_SLUG_BASE_MAX_LENGTH = 37;
const LONG_INPUT_LENGTH = 60;

describe('generateTenantSlug', () => {
  it('strips non-alphanumerics and lowercases', () => {
    expect(generateTenantSlug('Acme Corp!')).toBe('acmecorp');
    expect(generateTenantSlug('Hello, World 2026')).toBe('helloworld2026');
  });
  it('caps at 37 chars to reserve headroom for numeric suffixes', () => {
    expect(generateTenantSlug('a'.repeat(LONG_INPUT_LENGTH))).toBe('a'.repeat(TENANT_SLUG_BASE_MAX_LENGTH));
  });
  it('returns empty string when nothing valid remains', () => {
    expect(generateTenantSlug('!!!')).toBe('');
    expect(generateTenantSlug('')).toBe('');
  });
  it('handles unicode by stripping non-ASCII', () => {
    // 'Café Olé' → lower 'café olé' → strip non-alphanumeric: c,a,f pass; é stripped;
    // space stripped; o,l pass; é stripped → 'cafol'
    expect(generateTenantSlug('Café Olé')).toBe('cafol');
    expect(generateTenantSlug('東京支店')).toBe(''); // fully non-ASCII → empty
  });
});
