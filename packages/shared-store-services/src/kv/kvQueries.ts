// Portable supabase-js KV query layer. All paging is keyset (forward-only by
// `key`), so it is O(log n) per page and needs no offset clamp. Substring search
// uses ILIKE (trigram-indexed via idx_kv_entries_{key,value}_trgm); the
// LLM-supplied regex is never sent here.
import type { SupabaseClient } from '@supabase/supabase-js';

const EMPTY = 0;

// A keyset-seekable query builder: any supabase-js filter builder exposing the
// `gt`/`ilike`/`or`/`order`/`limit` chain we need. Generic over its own type so
// each call site keeps its precise select-row shape (no widening on reassign).
interface SeekableQuery<Q> {
  gt: (column: string, value: string) => Q;
}

function applySeek<Q extends SeekableQuery<Q>>(query: Q, afterKey: string | null): Q {
  if (afterKey === null) return query;
  return query.gt('key', afterKey);
}

export interface KvRow {
  key: string;
  value: string;
}

export type KvSearchOn = 'keys' | 'values' | 'both';

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

function mapKvRows(data: unknown): KvRow[] {
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const out: KvRow[] = [];
  for (const row of rows) if (isKvRow(row)) out.push({ key: row.key, value: row.value });
  return out;
}

function escapeLikePattern(input: string): string {
  return input.replace(/\\/gv, '\\\\').replace(/%/gv, '\\%').replace(/_/gv, '\\_');
}

interface ListKeysArgs {
  kvStoreId: string;
  tenantId: string;
  limit: number;
  afterKey: string | null;
}

export async function listKeysPage(
  supabase: SupabaseClient,
  args: ListKeysArgs
): Promise<{ keys: string[]; error: string | null }> {
  const base = supabase
    .from('kv_entries')
    .select('key')
    .eq('kv_store_id', args.kvStoreId)
    .eq('tenant_id', args.tenantId);
  const seeked = applySeek(base, args.afterKey);
  const { data, error } = await seeked.order('key', { ascending: true }).limit(args.limit);
  if (error !== null) return { keys: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { keys: rows.filter(isKeyRow).map((r) => r.key), error: null };
}

function seedNulls(keys: string[]): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const key of keys) result[key] = null;
  return result;
}

export async function getByKeys(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string,
  keys: string[]
): Promise<Record<string, string | null>> {
  const result = seedNulls(keys);
  if (keys.length === EMPTY) return result;
  const { data, error } = await supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId)
    .in('key', keys);
  if (error !== null) return result;
  for (const { key, value } of mapKvRows(data)) result[key] = value;
  return result;
}

interface IlikeArgs {
  kvStoreId: string;
  tenantId: string;
  on: KvSearchOn;
  literal: string;
  afterKey: string | null;
  pageSize: number;
}

interface IlikeableQuery<Q> {
  ilike: (column: string, pattern: string) => Q;
  or: (filters: string) => Q;
}

function applyIlikeTarget<Q extends IlikeableQuery<Q>>(base: Q, on: KvSearchOn, pattern: string): Q {
  if (on === 'keys') return base.ilike('key', pattern);
  if (on === 'values') return base.ilike('value', pattern);
  return base.or(`key.ilike.${pattern},value.ilike.${pattern}`);
}

export async function ilikePrefilterPage(
  supabase: SupabaseClient,
  args: IlikeArgs
): Promise<{ entries: KvRow[]; error: string | null }> {
  const pattern = `%${escapeLikePattern(args.literal)}%`;
  const base = supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', args.kvStoreId)
    .eq('tenant_id', args.tenantId);
  const seeked = applySeek(base, args.afterKey);
  const filtered = applyIlikeTarget(seeked, args.on, pattern);
  const { data, error } = await filtered.order('key', { ascending: true }).limit(args.pageSize);
  if (error !== null) return { entries: [], error: error.message };
  return { entries: mapKvRows(data), error: null };
}

interface ScanArgs {
  kvStoreId: string;
  tenantId: string;
  afterKey: string | null;
  pageSize: number;
}

export async function scanKeysetPage(
  supabase: SupabaseClient,
  args: ScanArgs
): Promise<{ entries: KvRow[]; error: string | null }> {
  const base = supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', args.kvStoreId)
    .eq('tenant_id', args.tenantId);
  const seeked = applySeek(base, args.afterKey);
  const { data, error } = await seeked.order('key', { ascending: true }).limit(args.pageSize);
  if (error !== null) return { entries: [], error: error.message };
  return { entries: mapKvRows(data), error: null };
}

interface UpsertArgs {
  kvStoreId: string;
  tenantId: string;
  key: string;
  value: string;
}

export async function upsertValue(
  supabase: SupabaseClient,
  args: UpsertArgs
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('kv_entries')
    .upsert(
      { kv_store_id: args.kvStoreId, tenant_id: args.tenantId, key: args.key, value: args.value },
      { onConflict: 'kv_store_id,tenant_id,key' }
    );
  if (error !== null) return { error: error.message };
  return { error: null };
}
