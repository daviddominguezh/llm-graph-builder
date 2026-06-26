import {
  AGENT_SLUG_REGEX,
  RESERVED_TENANT_SLUGS,
  TENANT_SLUG_REGEX,
  isValidAgentSlug,
  isValidTenantSlug,
} from './index.js';

describe('tenant slug', () => {
  it('accepts lowercase alphanumerics within length', () => {
    expect(isValidTenantSlug('acme')).toBe(true);
    expect(isValidTenantSlug('a1b2c3')).toBe(true);
    expect(isValidTenantSlug('a'.repeat(40))).toBe(true);
  });
  it('rejects hyphens, uppercase, unicode, out-of-range length, empty', () => {
    expect(isValidTenantSlug('acme-corp')).toBe(false);
    expect(isValidTenantSlug('Acme')).toBe(false);
    expect(isValidTenantSlug('cafés')).toBe(false);
    expect(isValidTenantSlug('a'.repeat(41))).toBe(false);
    expect(isValidTenantSlug('')).toBe(false);
  });
  it('rejects reserved', () => {
    for (const r of RESERVED_TENANT_SLUGS) expect(isValidTenantSlug(r)).toBe(false);
  });
});

describe('agent slug', () => {
  it('accepts single-char and hyphenated', () => {
    expect(isValidAgentSlug('a')).toBe(true);
    expect(isValidAgentSlug('customer-care')).toBe(true);
    expect(isValidAgentSlug('sales-bot-v2')).toBe(true);
  });
  it('rejects leading/trailing/double dashes, uppercase, too long', () => {
    expect(isValidAgentSlug('-bad')).toBe(false);
    expect(isValidAgentSlug('bad-')).toBe(false);
    expect(isValidAgentSlug('bad--case')).toBe(false);
    expect(isValidAgentSlug('Bad')).toBe(false);
    expect(isValidAgentSlug('a'.repeat(41))).toBe(false);
    expect(isValidAgentSlug('')).toBe(false);
  });
});

describe('regex exports are used by consumers', () => {
  it('exposes both regex constants for external composition', () => {
    expect(TENANT_SLUG_REGEX.source).toBeTruthy();
    expect(AGENT_SLUG_REGEX.source).toBeTruthy();
  });
});
