import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TenantRow {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isTenantRow(value: unknown): value is TenantRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value && 'org_id' in value;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapRows(data: unknown[]): TenantRow[] {
  return data.reduce<TenantRow[]>((acc, row) => {
    if (isTenantRow(row)) acc.push(row);
    return acc;
  }, []);
}

const LIST_COLUMNS = 'id, org_id, name, created_at, updated_at';

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function getTenantsByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: TenantRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('tenants')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function createTenant(
  supabase: SupabaseClient,
  orgId: string,
  name: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tenants')
    .insert({ org_id: orgId, name })
    .select(LIST_COLUMNS)
    .single();

  if (error !== null) return { result: null, error: error.message };
  const row: unknown = data;
  if (!isTenantRow(row)) return { result: null, error: 'Invalid tenant data' };
  return { result: row, error: null };
}

export async function updateTenant(
  supabase: SupabaseClient,
  tenantId: string,
  name: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tenants')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', tenantId)
    .select(LIST_COLUMNS)
    .single();

  if (error !== null) return { result: null, error: error.message };
  const row: unknown = data;
  if (!isTenantRow(row)) return { result: null, error: 'Invalid tenant data' };
  return { result: row, error: null };
}

export async function deleteTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tenants').delete().eq('id', tenantId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
