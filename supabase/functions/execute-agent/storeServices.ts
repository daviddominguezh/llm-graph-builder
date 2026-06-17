// Deno-compatible KV / RAG store service factories for the edge function.
//
// We can't reuse the backend's `makeKvStoreService` / `makeRagStoreService`
// directly: they depend on Node Buffer, RE2 native bindings, and the
// `@ai-sdk/google-vertex` embedding stack — none of which load cleanly in the
// Deno edge runtime. This file replicates the minimal surface area required by
// the agent tool path, using only Deno-safe primitives (TextEncoder for byte
// counts, native RegExp for regex filters, direct Supabase RPCs).
//
// Semantic / hybrid RAG modes require a query embedding (Vertex AI). Until an
// edge-safe embedding path exists, those modes throw a `ToolError` so the LLM
// gets a clear actionable response rather than a silent failure.
import type {
  KvPagedResult,
  KvRegexArgs,
  KvSearchArgs,
  KvSearchTarget,
  KvStoreServices,
  RagRegexArgs,
  RagSearchArgs,
  RagStoreServices,
} from '@daviddh/llm-graph-runner';
import { ToolError } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

const PROTECTED_PREFIX = '_sys.';
const ONE_KILOBYTE = 1024;
const KEY_MAX_BYTES = 256;
const VALUE_MAX_BYTES = KEY_MAX_BYTES * ONE_KILOBYTE;
const KV_REGEX_MAX_ROWS = 10_000;
const KV_REGEX_MAX_PATTERN_LENGTH = ONE_KILOBYTE;
const NO_TOTAL = 0;
const RANGE_END_OFFSET = 1;
const PG_STATEMENT_TIMEOUT = '57014';

const NO_STORE_SENTINEL_ID = '__no_store__';

const encoder = new TextEncoder();
function byteLengthUtf8(s: string): number {
  return encoder.encode(s).byteLength;
}

/* ─── KV validation helpers ─── */

function assertNotProtectedKey(key: string): void {
  if (key.toLowerCase().startsWith(PROTECTED_PREFIX)) {
    throw new ToolError('protected_key', `Keys starting with "${PROTECTED_PREFIX}" are reserved`);
  }
}

function assertKeySize(key: string): void {
  if (byteLengthUtf8(key) > KEY_MAX_BYTES) {
    throw new ToolError('key_too_long', `Key exceeds ${String(KEY_MAX_BYTES)} bytes`);
  }
}

function assertValueSize(value: string): void {
  if (byteLengthUtf8(value) > VALUE_MAX_BYTES) {
    throw new ToolError('value_too_large', `Value exceeds ${String(VALUE_MAX_BYTES)} bytes`);
  }
}

function compileKvRegex(pattern: string): RegExp {
  if (pattern.length > KV_REGEX_MAX_PATTERN_LENGTH) {
    throw new ToolError('invalid_pattern', `Pattern exceeds ${String(KV_REGEX_MAX_PATTERN_LENGTH)} chars`);
  }
  try {
    return new RegExp(pattern);
  } catch (err) {
    throw new ToolError('invalid_pattern', err instanceof Error ? err.message : 'invalid regex');
  }
}

/* ─── KV query helpers ─── */

interface KvEntry {
  key: string;
  value: string;
}

function isKvRow(value: unknown): value is KvEntry {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { key?: unknown; value?: unknown };
  return typeof r.key === 'string' && typeof r.value === 'string';
}

function mapKvRows(rows: unknown[]): KvEntry[] {
  const out: KvEntry[] = [];
  for (const row of rows) if (isKvRow(row)) out.push({ key: row.key, value: row.value });
  return out;
}

function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function buildIlikePattern(query: string): string {
  return `%${escapeLikePattern(query)}%`;
}

function targetMatches(entry: KvEntry, on: KvSearchTarget, matchesFn: (s: string) => boolean): boolean {
  if (on === 'keys') return matchesFn(entry.key);
  if (on === 'values') return matchesFn(entry.value);
  return matchesFn(entry.key) || matchesFn(entry.value);
}

/* ─── KV service operations ─── */

interface KvCtx {
  supabase: SupabaseClient;
  storeId: string;
}

async function doListKeys(
  ctx: KvCtx,
  tenantId: string,
  offset: number,
  limit: number
): Promise<KvPagedResult<string>> {
  const { data, count, error } = await ctx.supabase
    .from('kv_entries')
    .select('key', { count: 'exact' })
    .eq('kv_store_id', ctx.storeId)
    .eq('tenant_id', tenantId)
    .order('key', { ascending: true })
    .range(offset, offset + limit - RANGE_END_OFFSET);
  if (error !== null) throw new Error(error.message);
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  const keys = rows.filter(isKvRow).map((r) => r.key);
  return { items: keys, total: count ?? NO_TOTAL, offset, limit };
}

async function doGetValues(
  ctx: KvCtx,
  tenantId: string,
  keys: string[]
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const key of keys) result[key] = null;
  if (keys.length === 0) return result;
  const { data, error } = await ctx.supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', ctx.storeId)
    .eq('tenant_id', tenantId)
    .in('key', keys);
  if (error !== null) return result;
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  for (const r of mapKvRows(rows)) result[r.key] = r.value;
  return result;
}

interface IlikeRangeResult {
  data: unknown;
  count: number | null;
  error: { message: string } | null;
}

async function runIlikeSearch(ctx: KvCtx, args: KvSearchArgs, pattern: string): Promise<IlikeRangeResult> {
  const base = ctx.supabase
    .from('kv_entries')
    .select('key, value', { count: 'exact' })
    .eq('kv_store_id', ctx.storeId)
    .eq('tenant_id', args.tenantId);
  const endIndex = args.offset + args.limit - RANGE_END_OFFSET;
  if (args.on === 'keys') {
    return await base.ilike('key', pattern).order('key', { ascending: true }).range(args.offset, endIndex);
  }
  if (args.on === 'values') {
    return await base.ilike('value', pattern).order('key', { ascending: true }).range(args.offset, endIndex);
  }
  return await base
    .or(`key.ilike.${pattern},value.ilike.${pattern}`)
    .order('key', { ascending: true })
    .range(args.offset, endIndex);
}

async function doSearchSubstring(
  ctx: KvCtx,
  args: KvSearchArgs
): Promise<KvPagedResult<KvEntry>> {
  const pattern = buildIlikePattern(args.query);
  const res = await runIlikeSearch(ctx, args, pattern);
  if (res.error !== null) throw new Error(res.error.message);
  const rows: unknown[] = Array.isArray(res.data) ? res.data : [];
  return {
    items: mapKvRows(rows),
    total: res.count ?? NO_TOTAL,
    offset: args.offset,
    limit: args.limit,
  };
}

async function fetchEntriesForRegex(ctx: KvCtx, tenantId: string): Promise<{ entries: KvEntry[]; truncated: boolean }> {
  const { data, error } = await ctx.supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', ctx.storeId)
    .eq('tenant_id', tenantId)
    .order('key', { ascending: true })
    .limit(KV_REGEX_MAX_ROWS);
  if (error !== null) throw new Error(error.message);
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  const entries = mapKvRows(rows);
  return { entries, truncated: entries.length >= KV_REGEX_MAX_ROWS };
}

function applyRegexAndSlice(
  entries: KvEntry[],
  args: KvRegexArgs,
  re: RegExp,
  truncated: boolean
): KvPagedResult<KvEntry> {
  const matched = entries.filter((e) => targetMatches(e, args.on, (s) => re.test(s)));
  const sliced = matched.slice(args.offset, args.offset + args.limit);
  const base: KvPagedResult<KvEntry> = {
    items: sliced,
    total: matched.length,
    offset: args.offset,
    limit: args.limit,
  };
  if (truncated) return { ...base, truncated: true };
  return base;
}

async function doSearchRegex(ctx: KvCtx, args: KvRegexArgs): Promise<KvPagedResult<KvEntry>> {
  const re = compileKvRegex(args.pattern);
  const fetched = await fetchEntriesForRegex(ctx, args.tenantId);
  return applyRegexAndSlice(fetched.entries, args, re, fetched.truncated);
}

async function doUpdateValue(
  ctx: KvCtx,
  tenantId: string,
  key: string,
  value: string
): Promise<{ success: true }> {
  assertNotProtectedKey(key);
  assertKeySize(key);
  assertValueSize(value);
  const { error } = await ctx.supabase
    .from('kv_entries')
    .upsert(
      { kv_store_id: ctx.storeId, tenant_id: tenantId, key, value },
      { onConflict: 'kv_store_id,tenant_id,key' }
    );
  if (error !== null) throw new Error(error.message);
  return { success: true };
}

/* ─── KV factory ─── */

export function makeKvStoreService(supabase: SupabaseClient, storeId: string): KvStoreServices {
  const ctx: KvCtx = { supabase, storeId };
  return {
    storeId,
    listKeys: async (tenantId: string, offset: number, limit: number) =>
      await doListKeys(ctx, tenantId, offset, limit),
    getValues: async (tenantId: string, keys: string[]) => await doGetValues(ctx, tenantId, keys),
    searchSubstring: async (args: KvSearchArgs) => await doSearchSubstring(ctx, args),
    searchRegex: async (args: KvRegexArgs) => await doSearchRegex(ctx, args),
    updateValue: async (tenantId: string, key: string, value: string) =>
      await doUpdateValue(ctx, tenantId, key, value),
  };
}

/* ─── RAG service operations (bm25 + regex via RPC; semantic/hybrid unavailable) ─── */

const EMBEDDINGS_UNAVAILABLE_MSG =
  'Semantic / hybrid RAG search is not yet supported on the edge runtime. Use mode="bm25" or mode="regex".';

interface RagRpcRow {
  content: string;
}

function isRagContentRow(value: unknown): value is RagRpcRow {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { content?: unknown }).content === 'string';
}

function mapRagRows(rows: unknown[]): string[] {
  const out: string[] = [];
  for (const row of rows) if (isRagContentRow(row)) out.push(row.content);
  return out;
}

interface RagCtx {
  supabase: SupabaseClient;
  storeId: string;
}

async function callBm25(
  ctx: RagCtx,
  tenantId: string,
  query: string,
  k: number
): Promise<{ rows: unknown[]; error: string | null }> {
  const { data, error } = (await ctx.supabase.rpc('rag_text_search', {
    p_store_id: ctx.storeId,
    p_tenant_id: tenantId,
    p_query: query,
    p_k: k,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { rows: [], error: error.message };
  return { rows: Array.isArray(data) ? data : [], error: null };
}

async function doBm25(
  ctx: RagCtx,
  tenantId: string,
  query: string,
  offset: number,
  limit: number
): Promise<KvPagedResult<string>> {
  const k = offset + limit;
  const { rows, error } = await callBm25(ctx, tenantId, query, k);
  if (error !== null) throw new Error(error);
  const items = mapRagRows(rows).slice(offset, offset + limit);
  return { items, total: rows.length, offset, limit };
}

function rejectEmbeddingMode(): Promise<KvPagedResult<string>> {
  throw new ToolError('embedding_unavailable', EMBEDDINGS_UNAVAILABLE_MSG);
}

interface RegexRpcResult {
  rows: unknown[];
  error: string | null;
  timedOut: boolean;
}

async function callRegex(ctx: RagCtx, args: RagRegexArgs): Promise<RegexRpcResult> {
  const { data, error } = (await ctx.supabase.rpc('rag_regex_search', {
    p_store_id: ctx.storeId,
    p_tenant_id: args.tenantId,
    p_pattern: args.pattern,
    p_offset: args.offset,
    p_limit: args.limit,
  })) as { data: unknown; error: { message: string; code?: string } | null };
  if (error !== null) {
    if (error.code === PG_STATEMENT_TIMEOUT) return { rows: [], error: null, timedOut: true };
    return { rows: [], error: error.message, timedOut: false };
  }
  return { rows: Array.isArray(data) ? data : [], error: null, timedOut: false };
}

async function doRegex(ctx: RagCtx, args: RagRegexArgs): Promise<KvPagedResult<string>> {
  if (args.pattern.length > KV_REGEX_MAX_PATTERN_LENGTH) {
    throw new ToolError('invalid_pattern', `Pattern exceeds ${String(KV_REGEX_MAX_PATTERN_LENGTH)} chars`);
  }
  const res = await callRegex(ctx, args);
  if (res.timedOut) throw new ToolError('pattern_timeout', 'Regex pattern timed out (500ms)');
  if (res.error !== null) throw new ToolError('invalid_pattern', res.error);
  const items = mapRagRows(res.rows);
  return { items, total: items.length, offset: args.offset, limit: args.limit };
}

/* ─── RAG factory ─── */

export function makeRagStoreService(supabase: SupabaseClient, storeId: string): RagStoreServices {
  const ctx: RagCtx = { supabase, storeId };
  return {
    storeId,
    searchBm25: async (tenantId: string, query: string, offset: number, limit: number) =>
      await doBm25(ctx, tenantId, query, offset, limit),
    searchSemantic: async (_args: RagSearchArgs) => await rejectEmbeddingMode(),
    searchHybrid: async (_args: RagSearchArgs) => await rejectEmbeddingMode(),
    searchRegex: async (args: RagRegexArgs) => await doRegex(ctx, args),
  };
}

/* ─── No-store-bound sentinels ─── */

const NO_STORE_MESSAGE = 'No store is bound to this agent.';

function failNoStore(): never {
  throw new ToolError('no_store_bound', NO_STORE_MESSAGE);
}

export function makeNoStoreBoundKvServices(): KvStoreServices {
  return {
    storeId: NO_STORE_SENTINEL_ID,
    listKeys: () => failNoStore(),
    getValues: () => failNoStore(),
    searchSubstring: () => failNoStore(),
    searchRegex: () => failNoStore(),
    updateValue: () => failNoStore(),
  };
}

export function makeNoStoreBoundRagServices(): RagStoreServices {
  return {
    storeId: NO_STORE_SENTINEL_ID,
    searchBm25: () => failNoStore(),
    searchSemantic: () => failNoStore(),
    searchHybrid: () => failNoStore(),
    searchRegex: () => failNoStore(),
  };
}
