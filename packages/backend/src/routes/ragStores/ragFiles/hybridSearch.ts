import {
  type RagChunkRow,
  type SemanticChunk,
  searchByContent,
  searchBySemantic,
} from '../../../db/queries/ragChunksQueries.js';
import { embedQuery } from '../../../rag/embeddings.js';
import { resolveImageChunksContent } from '../../../rag/imageChunkResolver.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
} from '../../routeHelpers.js';
import { fetchImagePoolIfAny, mergePoolsByScore } from './imageSearchPool.js';
import { type SearchParams, applyRerank } from './searchChunks.js';

const HYBRID_POOL_PER_MODE = 50;
const HYBRID_TARGET_TOTAL = 50;
const HYBRID_SEMANTIC_QUOTA = 35;
const HYBRID_SIMPLE_QUOTA = 15;
const ZERO = 0;
const ONE = 1;

type Supabase = AuthenticatedLocals['supabase'];
type PoolChunk = SemanticChunk & { rank?: number };
type AnyChunk = SemanticChunk | RagChunkRow;

function log(msg: string): void {
  process.stdout.write(`[ragHyb] ${msg}\n`);
}

function takeFrom(source: readonly AnyChunk[], limit: number, pool: PoolChunk[], ids: Set<string>): void {
  let taken = ZERO;
  for (const c of source) {
    if (taken >= limit) break;
    if (pool.length >= HYBRID_TARGET_TOTAL) break;
    if (ids.has(c.id)) continue;
    pool.push(c as PoolChunk);
    ids.add(c.id);
    taken += ONE;
  }
}

function buildHybridPool(semantic: SemanticChunk[], simple: RagChunkRow[]): PoolChunk[] {
  const pool: PoolChunk[] = [];
  const ids = new Set<string>();
  takeFrom(semantic, HYBRID_SEMANTIC_QUOTA, pool, ids);
  takeFrom(simple, HYBRID_SIMPLE_QUOTA, pool, ids);
  // Backfill from semantic first (preserve the 70/30 lean), then simple.
  takeFrom(semantic, HYBRID_TARGET_TOTAL, pool, ids);
  takeFrom(simple, HYBRID_TARGET_TOTAL, pool, ids);
  return pool;
}

async function fetchHybridSources(
  supabase: Supabase,
  p: SearchParams,
  queryVector: number[]
): Promise<{ semantic: SemanticChunk[]; simple: RagChunkRow[] }> {
  const [semRes, simRes] = await Promise.all([
    searchBySemantic(supabase, {
      ragStoreId: p.storeId,
      tenantId: p.tenantId,
      queryVector,
      k: HYBRID_POOL_PER_MODE,
      maxDistance: p.maxDistance,
    }),
    searchByContent(supabase, {
      ragStoreId: p.storeId,
      tenantId: p.tenantId,
      query: p.query,
      k: HYBRID_POOL_PER_MODE,
    }),
  ]);
  if (semRes.error !== null) throw new Error(`semantic: ${semRes.error}`);
  if (simRes.error !== null) throw new Error(`simple: ${simRes.error}`);
  log(`fetched semantic=${String(semRes.result.length)} simple=${String(simRes.result.length)}`);
  return { semantic: semRes.result, simple: simRes.result };
}

async function rerankedTextHybrid(p: SearchParams, pool: PoolChunk[]): Promise<SemanticChunk[]> {
  const chunks = await applyRerank({
    query: p.query,
    candidates: pool,
    topK: p.k,
    minScore: p.minSimilarity,
  });
  log(`rerank kept=${String(chunks.length)} from pool=${String(pool.length)}`);
  return chunks;
}

async function runHybridPipeline(supabase: Supabase, p: SearchParams): Promise<SemanticChunk[]> {
  const queryVector = await embedQuery(p.query);
  log(`embed ok dims=${String(queryVector.length)}`);
  const { semantic, simple } = await fetchHybridSources(supabase, p, queryVector);
  const pool = buildHybridPool(semantic, simple);
  log(`pool size=${String(pool.length)}`);
  const [reranked, imagePool] = await Promise.all([
    rerankedTextHybrid(p, pool),
    fetchImagePoolIfAny(supabase, { storeId: p.storeId, tenantId: p.tenantId, query: p.query, k: p.k }),
  ]);
  log(`image pool=${String(imagePool.length)}`);
  if (imagePool.length === ZERO) return reranked;
  return mergePoolsByScore(reranked, imagePool, p.k);
}

export async function runHybridSearch(
  supabase: Supabase,
  p: SearchParams,
  res: AuthenticatedResponse
): Promise<void> {
  log(`entry k=${String(p.k)} minSim=${String(p.minSimilarity)} query="${p.query}"`);
  try {
    const chunks = await resolveImageChunksContent(await runHybridPipeline(supabase, p));
    res.status(HTTP_OK).json({ mode: 'hybrid', chunks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`error: ${msg}`);
    res.status(HTTP_INTERNAL_ERROR).json({ error: msg });
  }
}
