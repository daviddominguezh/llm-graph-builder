import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Status constants (avoid magic-numbers lint)                        */
/* ------------------------------------------------------------------ */

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */

const mockGetExecutionKeyTenants =
  jest.fn<(supabase: SupabaseClient, keyId: string) => Promise<{ rows: string[]; error: string | null }>>();

jest.unstable_mockModule('../../db/queries/agentExecutionKeyTenantsQueries.js', () => ({
  getExecutionKeyTenants: mockGetExecutionKeyTenants,
}));

const { enforceTenantScope } = await import('./enforceTenantScope.js');
const mockCreateSupabase = jest.fn<() => SupabaseClient>();

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface TenantScopeLookupResult {
  org_id: string;
}

interface TenantScopeExecutionKey {
  id: string;
  org_id: string;
  all_tenants: boolean;
}

function constantTenantLookup(
  tenant: TenantScopeLookupResult | null
): (id: string) => Promise<TenantScopeLookupResult | null> {
  return async () => await Promise.resolve(tenant);
}

function buildKey(overrides: Partial<TenantScopeExecutionKey> = {}): TenantScopeExecutionKey {
  return { id: 'key-1', org_id: 'org-1', all_tenants: true, ...overrides };
}

/* ------------------------------------------------------------------ */
/*  all_tenants = true                                                 */
/* ------------------------------------------------------------------ */

describe('enforceTenantScope all_tenants=true', () => {
  it('passes when tenant org matches key org', async () => {
    const result = await enforceTenantScope({
      supabase: mockCreateSupabase(),
      executionKey: buildKey({ all_tenants: true }),
      bodyTenantId: 'tenant-1',
      lookupTenant: constantTenantLookup({ org_id: 'org-1' }),
    });
    expect(result.ok).toBe(true);
  });

  it('forbids when tenant org mismatches key org', async () => {
    const result = await enforceTenantScope({
      supabase: mockCreateSupabase(),
      executionKey: buildKey({ all_tenants: true }),
      bodyTenantId: 'tenant-1',
      lookupTenant: constantTenantLookup({ org_id: 'other-org' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(HTTP_FORBIDDEN);
      expect(result.error).toBe('tenant_org_mismatch');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  all_tenants = false                                                */
/* ------------------------------------------------------------------ */

describe('enforceTenantScope all_tenants=false', () => {
  it('passes when tenant is in allowlist', async () => {
    mockGetExecutionKeyTenants.mockResolvedValue({ rows: ['tenant-1', 'tenant-2'], error: null });
    const result = await enforceTenantScope({
      supabase: mockCreateSupabase(),
      executionKey: buildKey({ all_tenants: false }),
      bodyTenantId: 'tenant-1',
      lookupTenant: constantTenantLookup({ org_id: 'org-1' }),
    });
    expect(result.ok).toBe(true);
  });

  it('forbids tenant_not_allowed when tenant is not in allowlist', async () => {
    mockGetExecutionKeyTenants.mockResolvedValue({ rows: ['tenant-2'], error: null });
    const result = await enforceTenantScope({
      supabase: mockCreateSupabase(),
      executionKey: buildKey({ all_tenants: false }),
      bodyTenantId: 'tenant-1',
      lookupTenant: constantTenantLookup({ org_id: 'org-1' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(HTTP_FORBIDDEN);
      expect(result.error).toBe('tenant_not_allowed');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Input-level denials                                                */
/* ------------------------------------------------------------------ */

describe('enforceTenantScope input denials', () => {
  it('not-found when tenant not found', async () => {
    const result = await enforceTenantScope({
      supabase: mockCreateSupabase(),
      executionKey: buildKey(),
      bodyTenantId: 'tenant-missing',
      lookupTenant: constantTenantLookup(null),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(HTTP_NOT_FOUND);
      expect(result.error).toBe('tenant not found');
    }
  });

  it('bad-request when bodyTenantId is empty', async () => {
    const result = await enforceTenantScope({
      supabase: mockCreateSupabase(),
      executionKey: buildKey(),
      bodyTenantId: '',
      lookupTenant: constantTenantLookup({ org_id: 'org-1' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(HTTP_BAD_REQUEST);
      expect(result.error).toBe('tenantId is required');
    }
  });
});
