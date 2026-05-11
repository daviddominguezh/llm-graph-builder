import type { SupabaseClient } from '@supabase/supabase-js';

export interface RagStoreRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export function isRagStoreRow(value: unknown): value is RagStoreRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'org_id' in value && 'name' in value && 'slug' in value;
}

const LIST_COLUMNS = 'id, org_id, name, slug, created_at, updated_at';

function mapRows(data: unknown[]): RagStoreRow[] {
  return data.reduce<RagStoreRow[]>((acc, row) => {
    if (isRagStoreRow(row)) acc.push(row);
    return acc;
  }, []);
}

export async function getRagStoresByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: RagStoreRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_stores')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function createRagStore(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  slug: string
): Promise<{ result: RagStoreRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_stores')
    .insert({ org_id: orgId, name, slug })
    .select(LIST_COLUMNS)
    .single();
  if (error !== null) return { result: null, error: error.message };
  const row: unknown = data;
  if (!isRagStoreRow(row)) return { result: null, error: 'Invalid rag_store data' };
  return { result: row, error: null };
}

export async function deleteRagStore(
  supabase: SupabaseClient,
  storeId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('rag_stores').delete().eq('id', storeId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

const SUFFIX_QUERY_LIMIT = 1024;
const MAX_SUFFIX = 1000;
const MAX_SLUG_LENGTH = 40;
const FIRST_SUFFIX = 1;
const DIGIT_REGEX = /\d/v;

async function collectTakenStoreSlugs(
  supabase: SupabaseClient,
  table: 'rag_stores' | 'kv_stores',
  orgId: string,
  baseSlug: string
): Promise<Set<string>> {
  const exactPromise = supabase.from(table).select('slug').eq('org_id', orgId).eq('slug', baseSlug);
  const suffixedPromise = supabase
    .from(table)
    .select('slug')
    .eq('org_id', orgId)
    .ilike('slug', `${baseSlug}_%`)
    .limit(SUFFIX_QUERY_LIMIT);
  const [exact, suffixed] = await Promise.all([exactPromise, suffixedPromise]);
  const allRows = [...(exact.data ?? []), ...(suffixed.data ?? [])];
  const valid = allRows.filter((r): r is { slug: string } => typeof r === 'object' && 'slug' in r);
  const { length: baseLen } = baseSlug;
  const bounded = valid.filter((r) => {
    const next: string | undefined = r.slug[baseLen];
    return next === undefined || DIGIT_REGEX.test(next);
  });
  return new Set(bounded.map((r) => r.slug));
}

export async function findUniqueRagStoreSlug(
  supabase: SupabaseClient,
  orgId: string,
  baseSlug: string
): Promise<string> {
  if (baseSlug === '') throw new Error('baseSlug cannot be empty');
  const taken = await collectTakenStoreSlugs(supabase, 'rag_stores', orgId, baseSlug);
  if (!taken.has(baseSlug)) return baseSlug;
  for (let i = FIRST_SUFFIX; i < MAX_SUFFIX; i += 1) {
    const candidate = `${baseSlug}${String(i)}`;
    if (candidate.length > MAX_SLUG_LENGTH) throw new Error('baseSlug too long for suffix');
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Unable to find unique rag_store slug');
}

export async function getRagStoreBySlug(
  supabase: SupabaseClient,
  orgId: string,
  slug: string
): Promise<{ result: RagStoreRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_stores')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .eq('slug', slug)
    .maybeSingle();
  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isRagStoreRow(data)) return { result: null, error: 'Invalid rag_store data' };
  return { result: data, error: null };
}

// Exported so kvStoresQueries can reuse the same helper without duplication.
export { collectTakenStoreSlugs };
