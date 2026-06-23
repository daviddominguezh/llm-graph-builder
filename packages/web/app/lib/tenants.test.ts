import { describe, expect, it } from '@jest/globals';

import { isTenantRow } from './tenants';

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

describe('web isTenantRow', () => {
  it('rejects a row missing is_default', () => {
    expect(isTenantRow(BASE)).toBe(false);
  });
  it('accepts a row with is_default', () => {
    expect(isTenantRow({ ...BASE, is_default: false })).toBe(true);
  });
});
