// Wires the keyset query layer (kvQueries), the ReDoS-safe regex matcher
// (regexSearch), and the opaque-cursor pagination primitives into the
// `KvStoreServices` contract. Search never sends the LLM regex to Postgres: a
// required literal (when extractable) drives a trigram ILIKE prefilter, else a
// bounded keyset scan with row + byte budgets keeps the LLM paging with forward
// progress. The LLM-controlled literal is neutralized for PostgREST injection
// inside kvQueries (quoted `.or()` value).
import type { KvRegexArgs, KvSearchArgs, KvStoreServices, SearchPage } from '@daviddh/llm-graph-runner';
import { ToolError } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type KvKeysetCursor,
  type KvRegexScanCursor,
  KV_SCAN_BYTE_BUDGET,
  KV_SCAN_PAGE_SIZE,
  KV_SCAN_ROW_BUDGET,
  decodeCursor,
  encodeCursor,
} from '../pagination.js';
import {
  type KvRow,
  type KvSearchOn,
  getByKeys,
  ilikePrefilterPage,
  listKeysPage,
  scanKeysetPage,
  upsertValue,
} from './kvQueries.js';
import { type CompiledRegex, compileRegex, extractRequiredLiteral, matchEntry } from './regexSearch.js';

const PROTECTED_PREFIX = '_sys.';
const ONE_KILOBYTE = 1024;
const KEY_MAX_BYTES = 256;
const VALUE_MAX_BYTES = KEY_MAX_BYTES * ONE_KILOBYTE;
const ZERO = 0;
const ONE = 1;
const LAST = -1;

interface Ctx {
  supabase: SupabaseClient;
  storeId: string;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

function isKeysetCursor(value: object): value is KvKeysetCursor {
  return typeof (value as { lastKey?: unknown }).lastKey === 'string';
}

function afterKeyFromCursor(cursor: string | undefined): string | null {
  if (cursor === undefined) return null;
  return decodeCursor(cursor, isKeysetCursor).lastKey;
}

function keysetCursor(lastKey: string): string {
  const payload: KvKeysetCursor = { lastKey };
  return encodeCursor(payload);
}

function regexScanCursor(lastKey: string): string {
  const payload: KvRegexScanCursor = { lastKey };
  return encodeCursor(payload);
}

function pageCursor(items: Array<{ key: string }>, limit: number): string | null {
  if (items.length < limit) return null;
  const last = items.at(LAST);
  if (last === undefined) return null;
  return keysetCursor(last.key);
}

async function doListKeys(
  ctx: Ctx,
  tenantId: string,
  limit: number,
  cursor?: string
): Promise<SearchPage<string>> {
  const afterKey = afterKeyFromCursor(cursor);
  const { keys, error } = await listKeysPage(ctx.supabase, {
    kvStoreId: ctx.storeId,
    tenantId,
    limit,
    afterKey,
  });
  if (error !== null) throw new Error(error);
  const last = keys.at(LAST);
  const nextCursor = keys.length < limit || last === undefined ? null : keysetCursor(last);
  return { items: keys, limit, nextCursor };
}

async function doSearchSubstring(ctx: Ctx, args: KvSearchArgs): Promise<SearchPage<KvRow>> {
  const afterKey = afterKeyFromCursor(args.cursor);
  const { entries, error } = await ilikePrefilterPage(ctx.supabase, {
    kvStoreId: ctx.storeId,
    tenantId: args.tenantId,
    on: args.on,
    literal: args.query,
    afterKey,
    pageSize: args.limit,
  });
  if (error !== null) throw new Error(error);
  return { items: entries, limit: args.limit, nextCursor: pageCursor(entries, args.limit) };
}

interface RegexAccumulator {
  matches: KvRow[];
  rowsScanned: number;
  bytesScanned: number;
  lastKey: string | null;
}

const EMPTY_ACC: RegexAccumulator = { matches: [], rowsScanned: ZERO, bytesScanned: ZERO, lastKey: null };

interface ScanParams {
  re: CompiledRegex;
  on: KvSearchOn;
  limit: number;
}

// Fold a fetched page into the running accumulator. The accumulator is treated
// as immutable input (we copy `matches` and use locals), so no parameter is
// reassigned and the shared `EMPTY_ACC` seed is never mutated. Stops early once
// the match limit is reached so `lastKey` marks the correct resume point.
function ingestBatch(start: RegexAccumulator, batch: KvRow[], params: ScanParams): RegexAccumulator {
  const matches = [...start.matches];
  let { rowsScanned, bytesScanned, lastKey } = start;
  for (const row of batch) {
    if (matches.length >= params.limit) break;
    const { key, value } = row;
    rowsScanned += ONE;
    bytesScanned += byteLength(key) + byteLength(value);
    lastKey = key;
    if (matchEntry(params.re, row, params.on)) matches.push(row);
  }
  return { matches, rowsScanned, bytesScanned, lastKey };
}

function budgetHit(acc: RegexAccumulator): boolean {
  return acc.rowsScanned >= KV_SCAN_ROW_BUDGET || acc.bytesScanned >= KV_SCAN_BYTE_BUDGET;
}

function regexNextCursor(acc: RegexAccumulator, exhausted: boolean): string | null {
  if (exhausted || acc.lastKey === null) return null;
  return regexScanCursor(acc.lastKey);
}

function scanDone(acc: RegexAccumulator, params: ScanParams, pageExhausted: boolean): boolean {
  return acc.matches.length >= params.limit || pageExhausted || budgetHit(acc);
}

type FetchPage = (afterKey: string | null) => Promise<{ entries: KvRow[]; error: string | null }>;

// Recursion (not a `for` loop) drives the multi-page scan so each sequential
// page fetch is awaited without tripping `no-await-in-loop`. Depth is bounded by
// the row budget (KV_SCAN_ROW_BUDGET / KV_SCAN_PAGE_SIZE pages).
async function scanLoop(
  acc: RegexAccumulator,
  afterKey: string | null,
  params: ScanParams,
  fetch: FetchPage
): Promise<SearchPage<KvRow>> {
  const { entries, error } = await fetch(afterKey);
  if (error !== null) throw new Error(error);
  const next = ingestBatch(acc, entries, params);
  const pageExhausted = entries.length < KV_SCAN_PAGE_SIZE;
  if (scanDone(next, params, pageExhausted)) {
    return { items: next.matches, limit: params.limit, nextCursor: regexNextCursor(next, pageExhausted) };
  }
  return await scanLoop(next, next.lastKey, params, fetch);
}

function fetchViaIlike(ctx: Ctx, args: KvRegexArgs, literal: string): FetchPage {
  return async (afterKey) =>
    await ilikePrefilterPage(ctx.supabase, {
      kvStoreId: ctx.storeId,
      tenantId: args.tenantId,
      on: args.on,
      literal,
      afterKey,
      pageSize: KV_SCAN_PAGE_SIZE,
    });
}

function fetchViaScan(ctx: Ctx, args: KvRegexArgs): FetchPage {
  return async (afterKey) =>
    await scanKeysetPage(ctx.supabase, {
      kvStoreId: ctx.storeId,
      tenantId: args.tenantId,
      afterKey,
      pageSize: KV_SCAN_PAGE_SIZE,
    });
}

async function doSearchRegex(ctx: Ctx, args: KvRegexArgs): Promise<SearchPage<KvRow>> {
  const re = compileRegex(args.pattern);
  const literal = extractRequiredLiteral(args.pattern);
  const start = afterKeyFromCursor(args.cursor);
  const params: ScanParams = { re, on: args.on, limit: args.limit };
  const fetch = literal === null ? fetchViaScan(ctx, args) : fetchViaIlike(ctx, args, literal);
  return await scanLoop(EMPTY_ACC, start, params, fetch);
}

function assertWritable(key: string, value: string): void {
  if (key.toLowerCase().startsWith(PROTECTED_PREFIX)) {
    throw new ToolError('protected_key', `Keys starting with "${PROTECTED_PREFIX}" are reserved`);
  }
  if (byteLength(key) > KEY_MAX_BYTES) {
    throw new ToolError('key_too_long', `Key exceeds ${String(KEY_MAX_BYTES)} bytes`);
  }
  if (byteLength(value) > VALUE_MAX_BYTES) {
    throw new ToolError('value_too_large', `Value exceeds ${String(VALUE_MAX_BYTES)} bytes`);
  }
}

async function doUpdateValue(
  ctx: Ctx,
  tenantId: string,
  key: string,
  value: string
): Promise<{ success: true }> {
  assertWritable(key, value);
  const { error } = await upsertValue(ctx.supabase, { kvStoreId: ctx.storeId, tenantId, key, value });
  if (error !== null) throw new Error(error);
  return { success: true };
}

export function makeKvStoreService(supabase: SupabaseClient, storeId: string): KvStoreServices {
  const ctx: Ctx = { supabase, storeId };
  return {
    storeId,
    listKeys: async (tenantId, limit, cursor) => await doListKeys(ctx, tenantId, limit, cursor),
    getValues: async (tenantId, keys) => await getByKeys(ctx.supabase, ctx.storeId, tenantId, keys),
    searchSubstring: async (args) => await doSearchSubstring(ctx, args),
    searchRegex: async (args) => await doSearchRegex(ctx, args),
    updateValue: async (tenantId, key, value) => await doUpdateValue(ctx, tenantId, key, value),
  };
}
