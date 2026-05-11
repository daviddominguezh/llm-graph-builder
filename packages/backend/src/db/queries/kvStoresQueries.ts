import type { SupabaseClient } from '@supabase/supabase-js';

import { collectTakenStoreSlugs } from './ragStoresQueries.js';

export interface KvStoreRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export function isKvStoreRow(value: unknown): value is KvStoreRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'org_id' in value && 'name' in value && 'slug' in value;
}

const LIST_COLUMNS = 'id, org_id, name, slug, created_at, updated_at';

function mapRows(data: unknown[]): KvStoreRow[] {
  return data.reduce<KvStoreRow[]>((acc, row) => {
    if (isKvStoreRow(row)) acc.push(row);
    return acc;
  }, []);
}

export async function getKvStoresByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: KvStoreRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('kv_stores')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function getKvStoreBySlug(
  supabase: SupabaseClient,
  orgId: string,
  slug: string
): Promise<{ result: KvStoreRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('kv_stores')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .eq('slug', slug)
    .maybeSingle();
  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isKvStoreRow(data)) return { result: null, error: 'Invalid kv_store data' };
  return { result: data, error: null };
}

export async function createKvStore(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  slug: string
): Promise<{ result: KvStoreRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('kv_stores')
    .insert({ org_id: orgId, name, slug })
    .select(LIST_COLUMNS)
    .single();
  if (error !== null) return { result: null, error: error.message };
  const row: unknown = data;
  if (!isKvStoreRow(row)) return { result: null, error: 'Invalid kv_store data' };
  return { result: row, error: null };
}

export async function deleteKvStore(
  supabase: SupabaseClient,
  storeId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('kv_stores').delete().eq('id', storeId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

const FIRST_SUFFIX = 1;
const MAX_SUFFIX = 1000;
const MAX_SLUG_LENGTH = 40;

export async function findUniqueKvStoreSlug(
  supabase: SupabaseClient,
  orgId: string,
  baseSlug: string
): Promise<string> {
  if (baseSlug === '') throw new Error('baseSlug cannot be empty');
  const taken = await collectTakenStoreSlugs(supabase, 'kv_stores', orgId, baseSlug);
  if (!taken.has(baseSlug)) return baseSlug;
  for (let i = FIRST_SUFFIX; i < MAX_SUFFIX; i += 1) {
    const candidate = `${baseSlug}${String(i)}`;
    if (candidate.length > MAX_SLUG_LENGTH) throw new Error('baseSlug too long for suffix');
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Unable to find unique kv_store slug');
}
