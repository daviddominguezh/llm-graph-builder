import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TenantRow {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isTenantRow(value: unknown): value is TenantRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'name' in value && 'org_id' in value && 'slug' in value;
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

const LIST_COLUMNS = 'id, org_id, slug, name, avatar_url, created_at, updated_at';

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
  name: string,
  slug: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tenants')
    .insert({ org_id: orgId, name, slug })
    .select(LIST_COLUMNS)
    .single();

  if (error !== null) return { result: null, error: error.message };
  const row: unknown = data;
  if (!isTenantRow(row)) return { result: null, error: 'Invalid tenant data' };
  return { result: row, error: null };
}

export async function getTenantBySlug(
  supabase: SupabaseClient,
  orgId: string,
  slug: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tenants')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .eq('slug', slug)
    .maybeSingle();

  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isTenantRow(data)) return { result: null, error: 'Invalid tenant data' };
  return { result: data, error: null };
}

export async function findUniqueTenantSlug(
  supabase: SupabaseClient,
  orgId: string,
  baseSlug: string
): Promise<string> {
  const { data } = await supabase
    .from('tenants')
    .select('slug')
    .eq('org_id', orgId)
    .or(`slug.eq.${baseSlug},slug.like.${baseSlug}-%`);

  const rows = (data ?? []) as Array<{ slug: string }>;
  if (!rows.some((r) => r.slug === baseSlug)) return baseSlug;

  const SEPARATOR_LENGTH = 1;
  const NEXT_SUFFIX = 1;
  let maxSuffix = 0;
  for (const row of rows) {
    if (row.slug === baseSlug) continue;
    const tail = row.slug.slice(baseSlug.length + SEPARATOR_LENGTH);
    const num = Number(tail);
    if (Number.isFinite(num) && num > maxSuffix) maxSuffix = num;
  }
  return `${baseSlug}-${String(maxSuffix + NEXT_SUFFIX)}`;
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

export async function updateTenantFields(
  supabase: SupabaseClient,
  tenantId: string,
  payload: Record<string, string | null>
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tenants').update(payload).eq('id', tenantId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function deleteTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tenants').delete().eq('id', tenantId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
