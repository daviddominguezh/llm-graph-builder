// Deno-side KvStoreServices factory: talks to Postgres directly via the
// supabase-js service client rather than round-tripping through a backend
// HTTP shim. Mirrors `packages/backend/src/services/kvStoreService.ts` for
// the parts that map cleanly to a Deno runtime — protected-key checks, key
// and value byte sizing, RE2 pre-validation. RE2 is unavailable in Deno so
// regex pre-validation hops to `/internal/regex/validate` once.
import type {
  KvPagedResult,
  KvRegexArgs,
  KvSearchArgs,
  KvStoreServices,
} from '@daviddh/llm-graph-runner';
import { ToolError } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import { validateRegexPattern } from './internalApiClient.ts';
import {
  getByKeys,
  listKeys,
  searchEntriesIlike,
  searchEntriesRegex,
  updateValue,
} from './kvQueries.ts';

const PROTECTED_PREFIX = '_sys.';
const ONE_KILOBYTE = 1024;
const KEY_MAX_BYTES = 256;
const VALUE_MAX_BYTES = KEY_MAX_BYTES * ONE_KILOBYTE;
const REGEX_MAX_PATTERN_LENGTH = ONE_KILOBYTE;

function byteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

function assertNotProtectedKey(key: string): void {
  if (key.toLowerCase().startsWith(PROTECTED_PREFIX)) {
    throw new ToolError('protected_key', `Keys starting with "${PROTECTED_PREFIX}" are reserved`);
  }
}

function assertKeySize(key: string): void {
  if (byteLength(key) > KEY_MAX_BYTES) {
    throw new ToolError('key_too_long', `Key exceeds ${String(KEY_MAX_BYTES)} bytes`);
  }
}

function assertValueSize(value: string): void {
  if (byteLength(value) > VALUE_MAX_BYTES) {
    throw new ToolError('value_too_large', `Value exceeds ${String(VALUE_MAX_BYTES)} bytes`);
  }
}

function assertRegexPatternLength(pattern: string): void {
  if (pattern.length > REGEX_MAX_PATTERN_LENGTH) {
    throw new ToolError('invalid_pattern', `Pattern exceeds ${String(REGEX_MAX_PATTERN_LENGTH)} chars`);
  }
}

interface Ctx {
  supabase: SupabaseClient;
  storeId: string;
}

async function doListKeys(
  ctx: Ctx,
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
  ctx: Ctx,
  tenantId: string,
  keys: string[]
): Promise<Record<string, string | null>> {
  return await getByKeys(ctx.supabase, ctx.storeId, tenantId, keys);
}

async function doSearchSubstring(
  ctx: Ctx,
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

async function doSearchRegex(
  ctx: Ctx,
  args: KvRegexArgs
): Promise<KvPagedResult<{ key: string; value: string }>> {
  assertRegexPatternLength(args.pattern);
  await validateRegexPattern(args.pattern);
  const { entries, total, error } = await searchEntriesRegex(ctx.supabase, {
    kvStoreId: ctx.storeId,
    tenantId: args.tenantId,
    on: args.on,
    pattern: args.pattern,
    offset: args.offset,
    limit: args.limit,
  });
  if (error !== null) throw new Error(error);
  return { items: entries, total, offset: args.offset, limit: args.limit };
}

async function doUpdateValue(
  ctx: Ctx,
  tenantId: string,
  key: string,
  value: string
): Promise<{ success: true }> {
  assertNotProtectedKey(key);
  assertKeySize(key);
  assertValueSize(value);
  const { error } = await updateValue(ctx.supabase, {
    kvStoreId: ctx.storeId,
    tenantId,
    key,
    value,
  });
  if (error !== null) throw new Error(error);
  return { success: true };
}

export function makeKvStoreService(supabase: SupabaseClient, storeId: string): KvStoreServices {
  const ctx: Ctx = { supabase, storeId };
  return {
    storeId,
    listKeys: async (tenantId, offset, limit) => await doListKeys(ctx, tenantId, offset, limit),
    getValues: async (tenantId, keys) => await doGetValues(ctx, tenantId, keys),
    searchSubstring: async (args) => await doSearchSubstring(ctx, args),
    searchRegex: async (args) => await doSearchRegex(ctx, args),
    updateValue: async (tenantId, key, value) => await doUpdateValue(ctx, tenantId, key, value),
  };
}
