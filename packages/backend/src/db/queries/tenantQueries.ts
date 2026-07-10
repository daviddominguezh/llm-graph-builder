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
  web_channel_enabled: boolean;
  web_channel_allowed_origins: string[];
  is_default: boolean;
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

const LIST_COLUMNS =
  'id, org_id, slug, name, avatar_url, created_at, updated_at, web_channel_enabled, web_channel_allowed_origins, is_default';

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
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

function readIdField(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('id' in data)) return undefined;
  const value: unknown = Object.getOwnPropertyDescriptor(data, 'id')?.value;
  return typeof value === 'string' ? value : undefined;
}

/**
 * The org's default tenant id (`tenants.is_default = true`). Used to pick the
 * tenant scope for tool-test resolution. Returns undefined when the org has none.
 */
export async function getDefaultTenantId(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_default', true)
    .maybeSingle();
  if (error !== null || data === null) return undefined;
  return readIdField(data);
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

export async function getTenantById(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tenants')
    .select(LIST_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle();

  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isTenantRow(data)) return { result: null, error: 'Invalid tenant data' };
  return { result: data, error: null };
}

export interface DefaultTenantIdentity {
  name: string;
  slug: string;
  avatarUrl: string | null;
}

// Mirrors the org's identity onto its default tenant via the SECURITY DEFINER RPC
// (which sets the transaction-local mirror GUC so the identity-lock trigger allows it).
export async function mirrorDefaultTenantIdentity(
  supabase: SupabaseClient,
  orgId: string,
  identity: DefaultTenantIdentity
): Promise<{ error: string | null }> {
  const { error } = (await supabase.rpc('set_default_tenant_identity', {
    p_org_id: orgId,
    p_name: identity.name,
    p_slug: identity.slug,
    p_avatar_url: identity.avatarUrl,
  })) as { error: { message: string } | null };
  return { error: error === null ? null : error.message };
}

// Mirrors only the org's avatar onto its default tenant (rename leaves avatar intact).
export async function mirrorDefaultTenantAvatar(
  supabase: SupabaseClient,
  orgId: string,
  avatarUrl: string | null
): Promise<{ error: string | null }> {
  const { error } = (await supabase.rpc('set_default_tenant_avatar', {
    p_org_id: orgId,
    p_avatar_url: avatarUrl,
  })) as { error: { message: string } | null };
  return { error: error === null ? null : error.message };
}

// Upper bound on rows fetched per suffix query. Well beyond the MAX_SUFFIX range; a
// single tenant name that has already generated >1000 numeric-suffixed variants would
// hit `Unable to find unique tenant slug` anyway, so this cap is comfort margin only.
const SUFFIX_QUERY_LIMIT = 1024;
const MAX_SUFFIX = 1000;
const MAX_SLUG_LENGTH = 40;
const FIRST_SUFFIX = 1;
const SUFFIX_STEP = 1;
const DIGIT_REGEX = /\d/v;

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
    .limit(SUFFIX_QUERY_LIMIT);

  const [exact, suffixed] = await Promise.all([exactPromise, suffixedPromise]);
  const allRows = [...(exact.data ?? []), ...(suffixed.data ?? [])];
  const validRows = allRows.filter((r): r is { slug: string } => typeof r === 'object' && 'slug' in r);
  // Keep only rows where the char right after baseSlug is a digit (rules out e.g. "acmebank").
  const { length: baseLen } = baseSlug;
  const bounded = validRows.filter((r) => {
    const next: string | undefined = r.slug[baseLen];
    return next === undefined || DIGIT_REGEX.test(next);
  });
  return new Set(bounded.map((r) => r.slug));
}

export async function findUniqueTenantSlug(supabase: SupabaseClient, baseSlug: string): Promise<string> {
  if (baseSlug === '') throw new Error('baseSlug cannot be empty');
  const taken = await collectTakenSlugs(supabase, baseSlug);
  if (!taken.has(baseSlug)) return baseSlug;

  for (let i = FIRST_SUFFIX; i < MAX_SUFFIX; i += SUFFIX_STEP) {
    const candidate = `${baseSlug}${i}`;
    if (candidate.length > MAX_SLUG_LENGTH) throw new Error('baseSlug too long for suffix');
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

export interface WebChannelUpdate {
  enabled: boolean;
  allowedOrigins: string[];
}

export async function updateTenantWebChannel(
  supabase: SupabaseClient,
  tenantId: string,
  fields: WebChannelUpdate
): Promise<{ result: TenantRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tenants')
    .update({
      web_channel_enabled: fields.enabled,
      web_channel_allowed_origins: fields.allowedOrigins,
      updated_at: new Date().toISOString(),
    })
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
