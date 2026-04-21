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

// Collects existing slugs that could collide with baseSlug or its numeric suffixes.
// Uses exact match + a bounded suffix query filtered client-side to digit-only next chars.
// The `ilike('slug', '${baseSlug}_%')` form (underscore = any single char) is used as the
// suffix query because PostgREST treats `[0-9]` as literal characters, not a bracket class.
// Client-side filter then narrows to rows where the char immediately after baseSlug is a digit.
async function collectTakenSlugs(supabase: SupabaseClient, baseSlug: string): Promise<Set<string>> {
  const exactPromise = supabase.from('tenants').select('slug').eq('slug', baseSlug);
  const suffixedPromise = supabase
    .from('tenants')
    .select('slug')
    .ilike('slug', `${baseSlug}_%`)
    .limit(1024);

  const [exact, suffixed] = await Promise.all([exactPromise, suffixedPromise]);
  const allRows = [...(exact.data ?? []), ...(suffixed.data ?? [])];
  const validRows = allRows.filter(
    (r): r is { slug: string } => typeof r === 'object' && r !== null && 'slug' in r
  );
  // Keep only rows where the char right after baseSlug is a digit (rules out e.g. "acmebank").
  const bounded = validRows.filter((r) => {
    const next = r.slug[baseSlug.length];
    return next === undefined || /\d/u.test(next);
  });
  return new Set(bounded.map((r) => r.slug));
}

export async function findUniqueTenantSlug(
  supabase: SupabaseClient,
  baseSlug: string
): Promise<string> {
  if (baseSlug === '') throw new Error('baseSlug cannot be empty');
  const taken = await collectTakenSlugs(supabase, baseSlug);
  if (!taken.has(baseSlug)) return baseSlug;

  for (let i = 1; i < 1000; i++) {
    const candidate = `${baseSlug}${i}`;
    if (candidate.length > 40) throw new Error('baseSlug too long for suffix');
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Unable to find unique tenant slug');
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
