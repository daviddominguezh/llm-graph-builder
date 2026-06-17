import type { SupabaseClient } from '@supabase/supabase-js';

import { countByContent, countBySemantic } from '../../db/queries/ragChunksCountQueries.js';
import {
  type RagChunkRow,
  type SemanticChunk,
  searchByContent,
  searchBySemantic,
} from '../../db/queries/ragChunksQueries.js';
import { embedQuery } from '../embeddings.js';
import { MAX_OFFSET, type PaginatedSearchResult, type SemanticSearchParams, clampOffset } from './types.js';

// runHybridSearch — paginated hybrid (semantic + text) search for the agent path.
//
// Composes searchBySemantic + searchByContent, merges with a 70/30 lean
// (mirrors the FE handler's `buildHybridPool` weights — copied here rather than
// imported so the FE route stays untouched), and slices by offset/limit.
//
// No rerank. `total` is an upper-bounded estimate: max(semantic_count,
// content_count). The true union size is between max(a,b) and (a + b); since
// the agent path caps the addressable window at MAX_OFFSET, this approximation
// is sufficient.

const HYBRID_SEMANTIC_QUOTA = 35;
const HYBRID_SIMPLE_QUOTA = 15;
const ZERO = 0;
const ONE = 1;

const MIN_SIMILARITY = 0;
const MAX_SIMILARITY = 1;

type AnyChunk = SemanticChunk | RagChunkRow;

function toMaxDistance(minSimilarity: number): number | null {
  if (minSimilarity <= MIN_SIMILARITY) return null;
  return MAX_SIMILARITY - minSimilarity;
}

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

// Build the merged pool. Mirror of FE handler's buildHybridPool but
// parameterized by targetTotal so it scales to the offset window.
function buildHybridPool(semantic: SemanticChunk[], simple: RagChunkRow[], targetTotal: number): AnyChunk[] {
  const acc: PoolAccumulator = { pool: [], ids: new Set<string>(), targetTotal };
  takeFrom(semantic, HYBRID_SEMANTIC_QUOTA, acc);
  takeFrom(simple, HYBRID_SIMPLE_QUOTA, acc);
  // Backfill: semantic first (preserve the 70/30 lean), then simple.
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
  const queryVector = await embedQuery(params.query);
  const vec: VectorContext = { queryVector, maxDistance: toMaxDistance(params.minSimilarity) };
  const [sources, total] = await Promise.all([
    fetchHybridSources(supabase, params, vec, targetTotal),
    fetchHybridTotal(supabase, params, vec),
  ]);
  const pool = buildHybridPool(sources.semantic, sources.simple, targetTotal);
  const slice = pool.slice(clamp.offset, clamp.offset + params.limit);
  const items = slice.map((c) => c.content);
  return buildResult(items, total, clamp, params.limit);
}

function buildResult(
  items: string[],
  total: number,
  clamp: { offset: number; truncated: boolean },
  limit: number
): PaginatedSearchResult {
  if (clamp.truncated) {
    return { items, total, offset: clamp.offset, limit, truncated: true };
  }
  return { items, total, offset: clamp.offset, limit };
}
