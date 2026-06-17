import { describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { TenantScopeExecutionKey, TenantScopeLookupResult } from './enforceTenantScope.js';
import { enforceTenantScope } from './enforceTenantScope.js';

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

function constantTenantLookup(
  tenant: TenantScopeLookupResult | null
): (id: string) => Promise<TenantScopeLookupResult | null> {
  return async () => await Promise.resolve(tenant);
}

interface FakeSupabaseChainResult {
  data: unknown;
  error: { message: string } | null;
}

function buildFakeSupabaseForTenants(result: FakeSupabaseChainResult): SupabaseClient {
  const eq = jest.fn(async () => await Promise.resolve(result));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  return { from } as unknown as SupabaseClient;
}

function buildKey(overrides: Partial<TenantScopeExecutionKey> = {}): TenantScopeExecutionKey {
  return { id: 'key-1', org_id: 'org-1', all_tenants: true, ...overrides };
}

/* ------------------------------------------------------------------ */
/*  all_tenants = true                                                 */
/* ------------------------------------------------------------------ */

describe('enforceTenantScope all_tenants=true', () => {
  it('passes when tenant org matches key org', async () => {
    const supabase = buildFakeSupabaseForTenants({ data: [], error: null });
    const result = await enforceTenantScope({
      supabase,
      executionKey: buildKey({ all_tenants: true }),
      bodyTenantId: 'tenant-1',
      lookupTenant: constantTenantLookup({ org_id: 'org-1' }),
    });
    expect(result.ok).toBe(true);
  });

  it('403 when tenant org mismatches key org', async () => {
    const supabase = buildFakeSupabaseForTenants({ data: [], error: null });
    const result = await enforceTenantScope({
      supabase,
      executionKey: buildKey({ all_tenants: true }),
      bodyTenantId: 'tenant-1',
      lookupTenant: constantTenantLookup({ org_id: 'other-org' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toBe('tenant_org_mismatch');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  all_tenants = false                                                */
/* ------------------------------------------------------------------ */

describe('enforceTenantScope all_tenants=false', () => {
  it('passes when tenant is in allowlist', async () => {
    const supabase = buildFakeSupabaseForTenants({
      data: [{ tenant_id: 'tenant-1' }, { tenant_id: 'tenant-2' }],
      error: null,
    });
    const result = await enforceTenantScope({
      supabase,
      executionKey: buildKey({ all_tenants: false }),
      bodyTenantId: 'tenant-1',
      lookupTenant: constantTenantLookup({ org_id: 'org-1' }),
    });
    expect(result.ok).toBe(true);
  });

  it('403 tenant_not_allowed when tenant is not in allowlist', async () => {
    const supabase = buildFakeSupabaseForTenants({
      data: [{ tenant_id: 'tenant-2' }],
      error: null,
    });
    const result = await enforceTenantScope({
      supabase,
      executionKey: buildKey({ all_tenants: false }),
      bodyTenantId: 'tenant-1',
      lookupTenant: constantTenantLookup({ org_id: 'org-1' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toBe('tenant_not_allowed');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Input-level denials                                                */
/* ------------------------------------------------------------------ */

describe('enforceTenantScope input denials', () => {
  it('404 when tenant not found', async () => {
    const supabase = buildFakeSupabaseForTenants({ data: [], error: null });
    const result = await enforceTenantScope({
      supabase,
      executionKey: buildKey(),
      bodyTenantId: 'tenant-missing',
      lookupTenant: constantTenantLookup(null),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toBe('tenant not found');
    }
  });

  it('400 when bodyTenantId is empty', async () => {
    const supabase = buildFakeSupabaseForTenants({ data: [], error: null });
    const result = await enforceTenantScope({
      supabase,
      executionKey: buildKey(),
      bodyTenantId: '',
      lookupTenant: constantTenantLookup({ org_id: 'org-1' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe('tenantId is required');
    }
  });
});
