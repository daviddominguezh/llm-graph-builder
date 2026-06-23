import { describe, expect, it } from '@jest/globals';

import { isTenantRow } from './tenantQueries.js';

const BASE = {
  id: 't1',
  org_id: 'o1',
  slug: 'acme',
  name: 'Acme',
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  web_channel_enabled: true,
  web_channel_allowed_origins: [],
};

describe('isTenantRow with is_default', () => {
  it('accepts a row carrying is_default', () => {
    expect(isTenantRow({ ...BASE, is_default: true })).toBe(true);
  });
  it('rejects a non-object', () => {
    expect(isTenantRow(null)).toBe(false);
  });
});
