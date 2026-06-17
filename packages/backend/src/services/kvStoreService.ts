import type {
  KvPagedResult,
  KvRegexArgs,
  KvSearchArgs,
  KvSearchTarget,
  KvStoreServices,
} from '@daviddh/llm-graph-runner';
import { ToolError } from '@daviddh/llm-graph-runner';
import { filterByMatcher, type FilterMatcher, type FilterOn } from '@openflow/shared-validation';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getByKeys,
  getEntriesForRegex,
  listKeys,
  searchEntriesIlike,
  updateValueQuery,
} from '../db/queries/kvEntriesQueries.js';

const PROTECTED_PREFIX = '_sys.';
const ONE_KILOBYTE = 1024;
const KEY_MAX_QUARTER_KB = 256;
const KEY_MAX_BYTES = KEY_MAX_QUARTER_KB;
const VALUE_MAX_BYTES = KEY_MAX_QUARTER_KB * ONE_KILOBYTE;
const KV_REGEX_MAX_ROWS = 10_000;
const KV_REGEX_MAX_PATTERN_LENGTH = ONE_KILOBYTE;

/* ─── Validation helpers ─── */

function assertNotProtectedKey(key: string): void {
  if (key.toLowerCase().startsWith(PROTECTED_PREFIX)) {
    throw new ToolError('protected_key', `Keys starting with "${PROTECTED_PREFIX}" are reserved`);
  }
}

function assertKeySize(key: string): void {
  if (Buffer.byteLength(key, 'utf8') > KEY_MAX_BYTES) {
    throw new ToolError('key_too_long', `Key exceeds ${String(KEY_MAX_BYTES)} bytes`);
  }
}

function assertValueSize(value: string): void {
  if (Buffer.byteLength(value, 'utf8') > VALUE_MAX_BYTES) {
    throw new ToolError('value_too_large', `Value exceeds ${String(VALUE_MAX_BYTES)} bytes`);
  }
}

function assertRegexPatternLength(pattern: string): void {
  if (pattern.length > KV_REGEX_MAX_PATTERN_LENGTH) {
    throw new ToolError(
      'invalid_pattern',
      `Pattern exceeds ${String(KV_REGEX_MAX_PATTERN_LENGTH)} chars`
    );
  }
}

function toFilterOn(on: KvSearchTarget): FilterOn {
  if (on === 'keys') return 'keys';
  if (on === 'values') return 'values';
  return 'both';
}

/* ─── Tool method helpers ─── */

interface ServiceContext {
  supabase: SupabaseClient;
  storeId: string;
}

async function doListKeys(
  ctx: ServiceContext,
  tenantId: string,
  offset: number,
  limit: number
): Promise<KvPagedResult<string>> {
  const { keys, total, error } = await listKeys(ctx.supabase, {
    kvStoreId: ctx.storeId,
    tenantId,
    offset,
    limit,
  });
  if (error !== null) throw new Error(error);
  return { items: keys, total, offset, limit };
}

async function doGetValues(
  ctx: ServiceContext,
  tenantId: string,
  keys: string[]
): Promise<Record<string, string | null>> {
  return await getByKeys(ctx.supabase, ctx.storeId, tenantId, keys);
}

async function doSearchSubstring(
  ctx: ServiceContext,
  args: KvSearchArgs
): Promise<KvPagedResult<{ key: string; value: string }>> {
  const { entries, total, error } = await searchEntriesIlike(ctx.supabase, {
    kvStoreId: ctx.storeId,
    tenantId: args.tenantId,
    on: args.on,
    query: args.query,
    offset: args.offset,
    limit: args.limit,
  });
  if (error !== null) throw new Error(error);
  return { items: entries, total, offset: args.offset, limit: args.limit };
}

interface RegexSliceResult {
  items: Array<{ key: string; value: string }>;
  total: number;
  truncated: boolean;
}

function applyRegexAndSlice(
  entries: Array<{ key: string; value: string }>,
  args: KvRegexArgs,
  truncated: boolean
): RegexSliceResult {
  const matcher: FilterMatcher = { kind: 'regex', pattern: args.pattern, flags: '' };
  const matched = filterByMatcher(entries, toFilterOn(args.on), matcher);
  const sliced = matched.slice(args.offset, args.offset + args.limit);
  return { items: sliced, total: matched.length, truncated };
}

async function doSearchRegex(
  ctx: ServiceContext,
  args: KvRegexArgs
): Promise<KvPagedResult<{ key: string; value: string }>> {
  assertRegexPatternLength(args.pattern);
  const fetched = await getEntriesForRegex(ctx.supabase, ctx.storeId, args.tenantId, KV_REGEX_MAX_ROWS);
  if (fetched.error !== null) throw new Error(fetched.error);
  const sliced = applyRegexAndSlice(fetched.entries, args, fetched.truncated);
  const base: KvPagedResult<{ key: string; value: string }> = {
    items: sliced.items,
    total: sliced.total,
    offset: args.offset,
    limit: args.limit,
  };
  if (sliced.truncated) return { ...base, truncated: true };
  return base;
}

async function doUpdateValue(
  ctx: ServiceContext,
  tenantId: string,
  key: string,
  value: string
): Promise<{ success: true }> {
  assertNotProtectedKey(key);
  assertKeySize(key);
  assertValueSize(value);
  const { error } = await updateValueQuery(ctx.supabase, {
    kvStoreId: ctx.storeId,
    tenantId,
    key,
    value,
  });
  if (error !== null) throw new Error(error);
  return { success: true };
}

/* ─── Factory ─── */

export function makeKvStoreService(supabase: SupabaseClient, storeId: string): KvStoreServices {
  const ctx: ServiceContext = { supabase, storeId };
  return {
    storeId,
    listKeys: async (tenantId, offset, limit) => await doListKeys(ctx, tenantId, offset, limit),
    getValues: async (tenantId, keys) => await doGetValues(ctx, tenantId, keys),
    searchSubstring: async (args) => await doSearchSubstring(ctx, args),
    searchRegex: async (args) => await doSearchRegex(ctx, args),
    updateValue: async (tenantId, key, value) => await doUpdateValue(ctx, tenantId, key, value),
  };
}
