import type { SupabaseClient } from '@supabase/supabase-js';

const EMPTY_LENGTH = 0;
const NO_TOTAL = 0;
const RANGE_END_OFFSET = 1;

export interface KvEntryRow {
  key: string;
  value: string;
}

export interface KvEntryDbRow extends KvEntryRow {
  id: string;
  kv_store_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

function isKvEntryDbRow(value: unknown): value is KvEntryDbRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'key' in value && 'value' in value && 'kv_store_id' in value && 'tenant_id' in value;
}

export async function getKvEntries(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string
): Promise<{ result: KvEntryRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('kv_entries')
    .select('key, value, kv_store_id, tenant_id, id, created_at, updated_at')
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  const mapped: KvEntryRow[] = rows.reduce<KvEntryRow[]>((acc, row) => {
    if (isKvEntryDbRow(row)) acc.push({ key: row.key, value: row.value });
    return acc;
  }, []);
  return { result: mapped, error: null };
}

function dedupe(items: KvEntryRow[]): KvEntryRow[] {
  const seen = new Set<string>();
  const out: KvEntryRow[] = [];
  for (const item of items) {
    if (item.key === '') continue;
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push({ key: item.key, value: item.value });
  }
  return out;
}

/* ─── Agent-tool query helpers ─── */

interface KeyRow {
  key: string;
}

function isKeyRow(value: unknown): value is KeyRow {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { key?: unknown }).key === 'string';
}

export interface ListKeysArgs {
  kvStoreId: string;
  tenantId: string;
  offset: number;
  limit: number;
}

export async function listKeys(
  supabase: SupabaseClient,
  args: ListKeysArgs
): Promise<{ keys: string[]; total: number; error: string | null }> {
  const { kvStoreId, tenantId, offset, limit } = args;
  const { data, count, error } = await supabase
    .from('kv_entries')
    .select('key', { count: 'exact' })
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId)
    .order('key', { ascending: true })
    .range(offset, offset + limit - RANGE_END_OFFSET);
  if (error !== null) return { keys: [], total: NO_TOTAL, error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  const keys = rows.filter(isKeyRow).map((r) => r.key);
  return { keys, total: count ?? NO_TOTAL, error: null };
}

function mergeFetchedValues(
  base: Record<string, string | null>,
  rows: unknown[]
): Record<string, string | null> {
  const out: Record<string, string | null> = { ...base };
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as { key?: unknown; value?: unknown };
    const { key, value } = r;
    if (typeof key === 'string' && typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

export async function getByKeys(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string,
  keys: string[]
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const key of keys) result[key] = null;
  if (keys.length === EMPTY_LENGTH) return result;
  const { data, error } = await supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId)
    .in('key', keys);
  if (error !== null) return result;
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return mergeFetchedValues(result, rows);
}

function escapeLikePattern(input: string): string {
  return input.replace(/\\/gv, '\\\\').replace(/%/gv, '\\%').replace(/_/gv, '\\_');
}

function buildIlikePattern(query: string): string {
  return `%${escapeLikePattern(query)}%`;
}

export type KvSearchOn = 'keys' | 'values' | 'both';

export interface KvSubstringSearchResult {
  entries: Array<{ key: string; value: string }>;
  total: number;
  error: string | null;
}

function mapKvRows(data: unknown[]): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as { key?: unknown; value?: unknown };
    if (typeof r.key === 'string' && typeof r.value === 'string') {
      out.push({ key: r.key, value: r.value });
    }
  }
  return out;
}

interface RangeResult {
  data: unknown;
  count: number | null;
  error: { message: string } | null;
}

interface IlikeSearchArgs {
  kvStoreId: string;
  tenantId: string;
  on: KvSearchOn;
  pattern: string;
  offset: number;
  limit: number;
}

async function runIlikeSearch(supabase: SupabaseClient, args: IlikeSearchArgs): Promise<RangeResult> {
  const { kvStoreId, tenantId, on, pattern, offset, limit } = args;
  const base = supabase
    .from('kv_entries')
    .select('key, value', { count: 'exact' })
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId);
  const endIndex = offset + limit - RANGE_END_OFFSET;
  if (on === 'keys') {
    return await base.ilike('key', pattern).order('key', { ascending: true }).range(offset, endIndex);
  }
  if (on === 'values') {
    return await base.ilike('value', pattern).order('key', { ascending: true }).range(offset, endIndex);
  }
  return await base
    .or(`key.ilike.${pattern},value.ilike.${pattern}`)
    .order('key', { ascending: true })
    .range(offset, endIndex);
}

export interface SearchEntriesIlikeArgs {
  kvStoreId: string;
  tenantId: string;
  on: KvSearchOn;
  query: string;
  offset: number;
  limit: number;
}

export async function searchEntriesIlike(
  supabase: SupabaseClient,
  args: SearchEntriesIlikeArgs
): Promise<KvSubstringSearchResult> {
  const pattern = buildIlikePattern(args.query);
  const { data, count, error } = await runIlikeSearch(supabase, {
    kvStoreId: args.kvStoreId,
    tenantId: args.tenantId,
    on: args.on,
    pattern,
    offset: args.offset,
    limit: args.limit,
  });
  if (error !== null) return { entries: [], total: NO_TOTAL, error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { entries: mapKvRows(rows), total: count ?? NO_TOTAL, error: null };
}

export interface KvBoundedFetchResult {
  entries: Array<{ key: string; value: string }>;
  truncated: boolean;
  error: string | null;
}

export async function getEntriesForRegex(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string,
  maxRows: number
): Promise<KvBoundedFetchResult> {
  const { data, error } = await supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId)
    .order('key', { ascending: true })
    .limit(maxRows);
  if (error !== null) return { entries: [], truncated: false, error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  const entries = mapKvRows(rows);
  return { entries, truncated: entries.length >= maxRows, error: null };
}

export interface UpdateValueArgs {
  kvStoreId: string;
  tenantId: string;
  key: string;
  value: string;
}

export async function updateValueQuery(
  supabase: SupabaseClient,
  args: UpdateValueArgs
): Promise<{ error: string | null }> {
  const { kvStoreId, tenantId, key, value } = args;
  const { error } = await supabase
    .from('kv_entries')
    .upsert(
      { kv_store_id: kvStoreId, tenant_id: tenantId, key, value },
      { onConflict: 'kv_store_id,tenant_id,key' }
    );
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function replaceKvEntries(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string,
  items: KvEntryRow[]
): Promise<{ error: string | null }> {
  const cleaned = dedupe(items);
  const { error: deleteError } = await supabase
    .from('kv_entries')
    .delete()
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId);
  if (deleteError !== null) return { error: deleteError.message };
  if (cleaned.length === EMPTY_LENGTH) return { error: null };
  const rows = cleaned.map((item) => ({
    kv_store_id: kvStoreId,
    tenant_id: tenantId,
    key: item.key,
    value: item.value,
  }));
  const { error: insertError } = await supabase.from('kv_entries').insert(rows);
  if (insertError !== null) return { error: insertError.message };
  return { error: null };
}
