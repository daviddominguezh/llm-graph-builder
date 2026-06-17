import { getExecutionKeyTenants } from '../../db/queries/agentExecutionKeyTenantsQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Channel-agnostic tenant-scope guard for execute requests          */
/*                                                                     */
/*  Runs BEFORE per-channel branching. Verifies that the requested    */
/*  tenant belongs to the same org as the execution key, and that     */
/*  the key allows access to that tenant (either all_tenants=true     */
/*  or the tenant id appears in agent_execution_key_tenants).         */
/* ------------------------------------------------------------------ */

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;

export interface TenantScopeExecutionKey {
  id: string;
  org_id: string;
  all_tenants: boolean;
}

export interface TenantScopeLookupResult {
  org_id: string;
}

export interface TenantScopeArgs {
  supabase: SupabaseClient;
  executionKey: TenantScopeExecutionKey;
  bodyTenantId: string;
  lookupTenant: (id: string) => Promise<TenantScopeLookupResult | null>;
}

export interface TenantScopeOk {
  ok: true;
  tenant: { id: string; org_id: string };
}

export interface TenantScopeFail {
  ok: false;
  status: number;
  error: string;
}

export type TenantScopeOutcome = TenantScopeOk | TenantScopeFail;

/* ------------------------------------------------------------------ */
/*  Supabase tenant lookup                                            */
/* ------------------------------------------------------------------ */

interface TenantOrgRow {
  org_id: string;
}

function isTenantOrgRow(value: unknown): value is TenantOrgRow {
  return typeof value === 'object' && value !== null && 'org_id' in value;
}

export function createSupabaseTenantOrgLookup(
  supabase: SupabaseClient
): (id: string) => Promise<TenantScopeLookupResult | null> {
  return async (tenantId: string) => {
    const { data, error } = await supabase.from('tenants').select('org_id').eq('id', tenantId).maybeSingle();
    if (error !== null) return null;
    return isTenantOrgRow(data) ? { org_id: data.org_id } : null;
  };
}

/* ------------------------------------------------------------------ */
/*  Guard                                                             */
/* ------------------------------------------------------------------ */

export async function enforceTenantScope(args: TenantScopeArgs): Promise<TenantScopeOutcome> {
  if (args.bodyTenantId === '') {
    return { ok: false, status: HTTP_BAD_REQUEST, error: 'tenantId is required' };
  }
  const tenant = await args.lookupTenant(args.bodyTenantId);
  if (tenant === null) {
    return { ok: false, status: HTTP_NOT_FOUND, error: 'tenant not found' };
  }
  if (tenant.org_id !== args.executionKey.org_id) {
    return { ok: false, status: HTTP_FORBIDDEN, error: 'tenant_org_mismatch' };
  }
  if (!args.executionKey.all_tenants) {
    const result = await getExecutionKeyTenants(args.supabase, args.executionKey.id);
    if (result.error !== null) {
      return { ok: false, status: HTTP_INTERNAL_ERROR, error: result.error };
    }
    if (!result.rows.includes(args.bodyTenantId)) {
      return { ok: false, status: HTTP_FORBIDDEN, error: 'tenant_not_allowed' };
    }
  }
  return { ok: true, tenant: { id: args.bodyTenantId, org_id: tenant.org_id } };
}
