// Deno mirror of `packages/backend/src/rag/search/{simple,semantic,hybrid,regex}.ts`.
//
// Same paging shape (`PaginatedSearchResult`), same `MAX_OFFSET` clamp, same
// 70/30 hybrid lean. The only difference vs. the backend version is that the
// query embedding for semantic/hybrid is fetched via `/internal/embed` because
// Vertex SDK auth doesn't run in Deno.
import { ToolError } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import { embedText, validateRegexPattern } from './internalApiClient.ts';
import {
  type RagChunkRow,
  type SemanticChunk,
  countByContent,
  countBySemantic,
  searchByContent,
  searchByRegex,
  searchBySemantic,
} from './ragQueries.ts';

const MAX_OFFSET = 1000;
const MIN_OFFSET = 0;
const MIN_SIMILARITY = 0;
const MAX_SIMILARITY = 1;
const HYBRID_SEMANTIC_QUOTA = 35;
const HYBRID_SIMPLE_QUOTA = 15;
const ZERO = 0;
const ONE = 1;

export interface PaginatedSearchResult {
  items: string[];
  total: number;
  offset: number;
  limit: number;
  truncated?: true;
}

interface ClampedOffset {
  offset: number;
  truncated: boolean;
}

function clampOffset(offset: number, limit: number): ClampedOffset {
  if (offset + limit > MAX_OFFSET) {
    return { offset: Math.max(MIN_OFFSET, MAX_OFFSET - limit), truncated: true };
  }
  return { offset, truncated: false };
}

function toMaxDistance(minSimilarity: number): number | null {
  if (minSimilarity <= MIN_SIMILARITY) return null;
  return MAX_SIMILARITY - minSimilarity;
}

function buildResult(
  items: string[],
  total: number,
  clamp: ClampedOffset,
  limit: number
): PaginatedSearchResult {
  if (clamp.truncated) {
    return { items, total, offset: clamp.offset, limit, truncated: true };
  }
  return { items, total, offset: clamp.offset, limit };
}

export interface SimpleSearchParams {
  storeId: string;
  tenantId: string;
  query: string;
  offset: number;
  limit: number;
}

export async function runSimpleSearch(
  supabase: SupabaseClient,
  params: SimpleSearchParams
): Promise<PaginatedSearchResult> {
  const clamp = clampOffset(params.offset, params.limit);
  const k = clamp.offset + params.limit;
  const [hits, count] = await Promise.all([
    searchByContent(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      query: params.query,
      k,
    }),
    countByContent(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      query: params.query,
      countCap: MAX_OFFSET,
    }),
  ]);
  if (hits.error !== null) throw new Error(hits.error);
  if (count.error !== null) throw new Error(count.error);
  const slice = hits.result.slice(clamp.offset, clamp.offset + params.limit);
  return buildResult(slice.map((r) => r.content), count.total, clamp, params.limit);
}

export interface SemanticSearchParams extends SimpleSearchParams {
  minSimilarity: number;
}

export async function runSemanticSearch(
  supabase: SupabaseClient,
  params: SemanticSearchParams
): Promise<PaginatedSearchResult> {
  const clamp = clampOffset(params.offset, params.limit);
  const k = clamp.offset + params.limit;
  const queryVector = await embedText(params.query);
  const maxDistance = toMaxDistance(params.minSimilarity);
  const [hits, count] = await Promise.all([
    searchBySemantic(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      queryVector,
      k,
      maxDistance,
    }),
    countBySemantic(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      queryVector,
      maxDistance,
      countCap: MAX_OFFSET,
    }),
  ]);
  if (hits.error !== null) throw new Error(hits.error);
  if (count.error !== null) throw new Error(count.error);
  const slice = hits.result.slice(clamp.offset, clamp.offset + params.limit);
  return buildResult(slice.map((r) => r.content), count.total, clamp, params.limit);
}

type AnyChunk = SemanticChunk | RagChunkRow;

interface PoolAccumulator {
  pool: AnyChunk[];
  ids: Set<string>;
  targetTotal: number;
}

function takeFrom(source: readonly AnyChunk[], limit: number, acc: PoolAccumulator): void {
  let taken = ZERO;
  for (const c of source) {
    if (taken >= limit) break;
    if (acc.pool.length >= acc.targetTotal) break;
    if (acc.ids.has(c.id)) continue;
    acc.pool.push(c);
    acc.ids.add(c.id);
    taken += ONE;
  }
}

function buildHybridPool(semantic: SemanticChunk[], simple: RagChunkRow[], targetTotal: number): AnyChunk[] {
  const acc: PoolAccumulator = { pool: [], ids: new Set<string>(), targetTotal };
  takeFrom(semantic, HYBRID_SEMANTIC_QUOTA, acc);
  takeFrom(simple, HYBRID_SIMPLE_QUOTA, acc);
  takeFrom(semantic, targetTotal, acc);
  takeFrom(simple, targetTotal, acc);
  return acc.pool;
}

interface VectorContext {
  queryVector: number[];
  maxDistance: number | null;
}

async function fetchHybridSources(
  supabase: SupabaseClient,
  params: SemanticSearchParams,
  vec: VectorContext,
  poolSize: number
): Promise<{ semantic: SemanticChunk[]; simple: RagChunkRow[] }> {
  const [semRes, simRes] = await Promise.all([
    searchBySemantic(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      queryVector: vec.queryVector,
      k: poolSize,
      maxDistance: vec.maxDistance,
    }),
    searchByContent(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      query: params.query,
      k: poolSize,
    }),
  ]);
  if (semRes.error !== null) throw new Error(`semantic: ${semRes.error}`);
  if (simRes.error !== null) throw new Error(`simple: ${simRes.error}`);
  return { semantic: semRes.result, simple: simRes.result };
}

async function fetchHybridTotal(
  supabase: SupabaseClient,
  params: SemanticSearchParams,
  vec: VectorContext
): Promise<number> {
  const [semCount, simCount] = await Promise.all([
    countBySemantic(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      queryVector: vec.queryVector,
      maxDistance: vec.maxDistance,
      countCap: MAX_OFFSET,
    }),
    countByContent(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      query: params.query,
      countCap: MAX_OFFSET,
    }),
  ]);
  if (semCount.error !== null) throw new Error(`semantic count: ${semCount.error}`);
  if (simCount.error !== null) throw new Error(`simple count: ${simCount.error}`);
  return Math.max(semCount.total, simCount.total);
}

export async function runHybridSearch(
  supabase: SupabaseClient,
  params: SemanticSearchParams
): Promise<PaginatedSearchResult> {
  const clamp = clampOffset(params.offset, params.limit);
  const targetTotal = clamp.offset + params.limit;
  const queryVector = await embedText(params.query);
  const vec: VectorContext = { queryVector, maxDistance: toMaxDistance(params.minSimilarity) };
  const [sources, total] = await Promise.all([
    fetchHybridSources(supabase, params, vec, targetTotal),
    fetchHybridTotal(supabase, params, vec),
  ]);
  const pool = buildHybridPool(sources.semantic, sources.simple, targetTotal);
  const slice = pool.slice(clamp.offset, clamp.offset + params.limit);
  return buildResult(slice.map((c) => c.content), total, clamp, params.limit);
}

export interface RegexSearchParams {
  storeId: string;
  tenantId: string;
  pattern: string;
  offset: number;
  limit: number;
}

export async function runRegexSearch(
  supabase: SupabaseClient,
  params: RegexSearchParams
): Promise<PaginatedSearchResult> {
  await validateRegexPattern(params.pattern);
  const clamp = clampOffset(params.offset, params.limit);
  const res = await searchByRegex(supabase, {
    storeId: params.storeId,
    tenantId: params.tenantId,
    pattern: params.pattern,
    offset: clamp.offset,
    limit: params.limit,
  });
  if (res.timedOut) throw new ToolError('pattern_timeout', 'Regex pattern timed out (500ms)');
  if (res.error !== null) throw new ToolError('invalid_pattern', res.error);
  return buildResult(res.result.map((r) => r.content), res.total, clamp, params.limit);
}
