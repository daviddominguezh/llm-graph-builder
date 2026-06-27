// Wires the bounded RAG retrieval layer (ragQueries) and the internal API client
// (embed + rerank, Task 6) into the `RagStoreServices` contract. Every mode
// retrieves a bounded candidate pool, reranks it (ALWAYS ON — no toggle), then
// cursor-paginates the reranked pool by match count. Regex stays portable by
// filtering the FTS pool through the in-process re2js matcher instead of a
// native Postgres `~` operator.
import type { RagRegexArgs, RagSearchArgs, RagStoreServices, SearchPage } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { InternalApiClient } from '../internalApiClient.js';
import { compileRegex } from '../kv/regexSearch.js';
import { type RagPoolCursor, decodeCursor, encodeCursor } from '../pagination.js';
import { type RagChunk, ftsPool, semanticPool } from './ragQueries.js';
import { rerankPool } from './rerank.js';

const POOL_SIZE = 100;
const MIN_SIMILARITY = 0;
const MAX_SIMILARITY = 1;
const START = 0;

interface Ctx {
  supabase: SupabaseClient;
  storeId: string;
  client: InternalApiClient;
}

interface PoolResult {
  rows: RagChunk[];
  error: string | null;
}

interface Bm25Args {
  tenantId: string;
  query: string;
  limit: number;
  cursor?: string;
}

function toMaxDistance(minSimilarity: number): number | null {
  if (minSimilarity <= MIN_SIMILARITY) return null;
  return MAX_SIMILARITY - minSimilarity;
}

function isRagPoolCursor(value: object): value is RagPoolCursor {
  return typeof (value as { poolIndex?: unknown }).poolIndex === 'number';
}

function poolIndexFromCursor(cursor: string | undefined): number {
  if (cursor === undefined) return START;
  return decodeCursor(cursor, isRagPoolCursor).poolIndex;
}

function poolCursor(poolIndex: number): string {
  const payload: RagPoolCursor = { poolIndex };
  return encodeCursor(payload);
}

// Slice the reranked pool by match count. A continuation cursor is emitted only
// while unread chunks remain in the pool; exhaustion yields a null cursor.
function paginate(pool: RagChunk[], start: number, limit: number): SearchPage<string> {
  const slice = pool.slice(start, start + limit);
  const nextIndex = start + slice.length;
  const nextCursor = nextIndex < pool.length ? poolCursor(nextIndex) : null;
  return { items: slice.map((c) => c.content), limit, nextCursor };
}

function unwrap(result: PoolResult): RagChunk[] {
  if (result.error !== null) throw new Error(result.error);
  return result.rows;
}

async function rankedPool(
  ctx: Ctx,
  query: string,
  fetchPool: () => Promise<PoolResult>
): Promise<RagChunk[]> {
  const rows = unwrap(await fetchPool());
  return await rerankPool(ctx.client, query, rows);
}

async function doBm25(ctx: Ctx, args: Bm25Args): Promise<SearchPage<string>> {
  const pool = await rankedPool(
    ctx,
    args.query,
    async () =>
      await ftsPool(ctx.supabase, {
        storeId: ctx.storeId,
        tenantId: args.tenantId,
        query: args.query,
        k: POOL_SIZE,
      })
  );
  return paginate(pool, poolIndexFromCursor(args.cursor), args.limit);
}

async function doSemantic(ctx: Ctx, args: RagSearchArgs): Promise<SearchPage<string>> {
  const queryVector = await ctx.client.embed(args.query);
  const pool = await rankedPool(
    ctx,
    args.query,
    async () =>
      await semanticPool(ctx.supabase, {
        storeId: ctx.storeId,
        tenantId: args.tenantId,
        queryVector,
        k: POOL_SIZE,
        maxDistance: toMaxDistance(args.minSimilarity),
      })
  );
  return paginate(pool, poolIndexFromCursor(args.cursor), args.limit);
}

function mergeUnique(a: RagChunk[], b: RagChunk[]): RagChunk[] {
  const seen = new Set<string>();
  const out: RagChunk[] = [];
  for (const c of [...a, ...b]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

async function doHybrid(ctx: Ctx, args: RagSearchArgs): Promise<SearchPage<string>> {
  const queryVector = await ctx.client.embed(args.query);
  const [sem, fts] = await Promise.all([
    semanticPool(ctx.supabase, {
      storeId: ctx.storeId,
      tenantId: args.tenantId,
      queryVector,
      k: POOL_SIZE,
      maxDistance: toMaxDistance(args.minSimilarity),
    }),
    ftsPool(ctx.supabase, { storeId: ctx.storeId, tenantId: args.tenantId, query: args.query, k: POOL_SIZE }),
  ]);
  const merged = mergeUnique(unwrap(sem), unwrap(fts));
  const pool = await rerankPool(ctx.client, args.query, merged);
  return paginate(pool, poolIndexFromCursor(args.cursor), args.limit);
}

async function doRegex(ctx: Ctx, args: RagRegexArgs): Promise<SearchPage<string>> {
  const re = compileRegex(args.pattern);
  const rows = unwrap(
    await ftsPool(ctx.supabase, {
      storeId: ctx.storeId,
      tenantId: args.tenantId,
      query: args.pattern,
      k: POOL_SIZE,
    })
  );
  const matched = rows.filter((c) => re.test(c.content));
  const pool = await rerankPool(ctx.client, args.pattern, matched);
  return paginate(pool, poolIndexFromCursor(args.cursor), args.limit);
}

export function makeRagStoreService(
  supabase: SupabaseClient,
  storeId: string,
  client: InternalApiClient
): RagStoreServices {
  const ctx: Ctx = { supabase, storeId, client };
  return {
    storeId,
    searchBm25: async (tenantId, query, limit, cursor) =>
      await doBm25(ctx, { tenantId, query, limit, cursor }),
    searchSemantic: async (args) => await doSemantic(ctx, args),
    searchHybrid: async (args) => await doHybrid(ctx, args),
    searchRegex: async (args) => await doRegex(ctx, args),
  };
}
