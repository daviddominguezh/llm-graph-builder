import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TenantJoinRow {
  tenant_id: string;
}

function isTenantJoinRow(value: unknown): value is TenantJoinRow {
  return typeof value === 'object' && value !== null && 'tenant_id' in value;
}

function mapTenantJoinRows(data: unknown[]): string[] {
  return data.reduce<string[]>((acc, row) => {
    if (isTenantJoinRow(row)) acc.push(row.tenant_id);
    return acc;
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function getExecutionKeyTenants(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ rows: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_key_tenants')
    .select('tenant_id')
    .eq('key_id', keyId);

  if (error !== null) return { rows: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { rows: mapTenantJoinRows(rows), error: null };
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_LENGTH = 0;

async function insertKeyTenants(
  supabase: SupabaseClient,
  keyId: string,
  tenantIds: string[]
): Promise<{ error: string | null }> {
  if (tenantIds.length === EMPTY_LENGTH) return { error: null };

  const rows = tenantIds.map((tenantId) => ({ key_id: keyId, tenant_id: tenantId }));
  const { error } = await supabase.from('agent_execution_key_tenants').insert(rows);

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function replaceExecutionKeyTenants(
  supabase: SupabaseClient,
  keyId: string,
  tenantIds: string[]
): Promise<{ error: string | null }> {
  const { error: deleteError } = await supabase
    .from('agent_execution_key_tenants')
    .delete()
    .eq('key_id', keyId);

  if (deleteError !== null) return { error: deleteError.message };

  return await insertKeyTenants(supabase, keyId, tenantIds);
}
