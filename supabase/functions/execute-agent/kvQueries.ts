// Deno-side mirror of `packages/backend/src/db/queries/kvEntriesQueries.ts`.
// Same column names, same paging semantics, same `KvPagedResult` shape as the
// backend implementation — this is the byte-for-byte port the refactor brief
// asks for.
import type { SupabaseClient } from '@supabase/supabase-js';

const RANGE_END_OFFSET = 1;
const NO_TOTAL = 0;

export type KvSearchOn = 'keys' | 'values' | 'both';

export interface KvRow {
  key: string;
  value: string;
}

interface KeyRow {
  key: string;
}

function isKeyRow(value: unknown): value is KeyRow {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { key?: unknown }).key === 'string';
}

function isKvRow(value: unknown): value is KvRow {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { key?: unknown; value?: unknown };
  return typeof r.key === 'string' && typeof r.value === 'string';
}

function mapKvRows(data: unknown[]): KvRow[] {
  const out: KvRow[] = [];
  for (const row of data) if (isKvRow(row)) out.push({ key: row.key, value: row.value });
  return out;
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
    if (typeof r.key === 'string' && typeof r.value === 'string') {
      out[r.key] = r.value;
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
  if (keys.length === 0) return result;
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
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function buildIlikePattern(query: string): string {
  return `%${escapeLikePattern(query)}%`;
}

export interface KvSubstringResult {
  entries: KvRow[];
  total: number;
  error: string | null;
}

interface IlikeArgs {
  kvStoreId: string;
  tenantId: string;
  on: KvSearchOn;
  pattern: string;
  offset: number;
  limit: number;
}

interface RangeResult {
  data: unknown;
  count: number | null;
  error: { message: string } | null;
}

async function runIlikeQuery(supabase: SupabaseClient, args: IlikeArgs): Promise<RangeResult> {
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

export interface SearchSubstringArgs {
  kvStoreId: string;
  tenantId: string;
  on: KvSearchOn;
  query: string;
  offset: number;
  limit: number;
}

export async function searchEntriesIlike(
  supabase: SupabaseClient,
  args: SearchSubstringArgs
): Promise<KvSubstringResult> {
  const pattern = buildIlikePattern(args.query);
  const { data, count, error } = await runIlikeQuery(supabase, {
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

export interface SearchRegexArgs {
  kvStoreId: string;
  tenantId: string;
  on: KvSearchOn;
  pattern: string;
  offset: number;
  limit: number;
}

interface RegexQueryResult {
  data: unknown;
  count: number | null;
  error: { message: string } | null;
}

async function runRegexQuery(supabase: SupabaseClient, args: SearchRegexArgs): Promise<RegexQueryResult> {
  const { kvStoreId, tenantId, on, pattern, offset, limit } = args;
  const base = supabase
    .from('kv_entries')
    .select('key, value', { count: 'exact' })
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId);
  const endIndex = offset + limit - RANGE_END_OFFSET;
  if (on === 'keys') {
    return await base.filter('key', '~', pattern).order('key', { ascending: true }).range(offset, endIndex);
  }
  if (on === 'values') {
    return await base.filter('value', '~', pattern).order('key', { ascending: true }).range(offset, endIndex);
  }
  return await base
    .or(`key.~.${pattern},value.~.${pattern}`)
    .order('key', { ascending: true })
    .range(offset, endIndex);
}

export async function searchEntriesRegex(
  supabase: SupabaseClient,
  args: SearchRegexArgs
): Promise<KvSubstringResult> {
  const { data, count, error } = await runRegexQuery(supabase, args);
  if (error !== null) return { entries: [], total: NO_TOTAL, error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { entries: mapKvRows(rows), total: count ?? NO_TOTAL, error: null };
}

export interface UpdateValueArgs {
  kvStoreId: string;
  tenantId: string;
  key: string;
  value: string;
}

export async function updateValue(
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
