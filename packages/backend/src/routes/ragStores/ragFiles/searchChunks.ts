import type { Request } from 'express';

import {
  type SemanticChunk,
  searchByContent,
  searchBySemantic,
} from '../../../db/queries/ragChunksQueries.js';
import { listFilesByStoreTenant } from '../../../db/queries/ragFilesQueries.js';
import { embedQuery } from '../../../rag/embeddings.js';
import { resolveImageChunksContent } from '../../../rag/imageChunkResolver.js';
import { rerankRecords } from '../../../rag/rerank.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { runHybridSearch } from './hybridSearch.js';
import { fetchImagePoolIfAny, mergePoolsByScore } from './imageSearchPool.js';
import { getStoreIdParam, parseBoolean, parseNumber, parseString } from './ragFileHelpers.js';

const DEFAULT_K = 5;
const MAX_K = 10;
const MIN_K = 1;
const MIN_SIMILARITY = 0;
const MAX_SIMILARITY = 1;
const DEFAULT_MIN_SIMILARITY = 0;
const RERANK_CANDIDATE_POOL = 50;
const EMPTY_POOL = 0;

type Supabase = AuthenticatedLocals['supabase'];

export interface SearchParams {
  storeId: string;
  tenantId: string;
  mode: string;
  query: string;
  k: number;
  minSimilarity: number;
  maxDistance: number | null;
  rerank: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

function parseMinSimilarity(body: unknown): number {
  const raw = parseNumber(body, 'minSimilarity') ?? DEFAULT_MIN_SIMILARITY;
  return clamp(raw, MIN_SIMILARITY, MAX_SIMILARITY);
}

function toMaxDistance(minSimilarity: number): number | null {
  if (minSimilarity <= MIN_SIMILARITY) return null;
  return MAX_SIMILARITY - minSimilarity;
}

function parseParams(req: Request): SearchParams | null {
  const storeId = getStoreIdParam(req);
  const tenantId = parseString(req.body, 'tenantId');
  const mode = parseString(req.body, 'mode');
  const query = parseString(req.body, 'query');
  const kRaw = parseNumber(req.body, 'k') ?? DEFAULT_K;
  const k = clamp(Math.floor(kRaw), MIN_K, MAX_K);
  const minSimilarity = parseMinSimilarity(req.body);
  const maxDistance = toMaxDistance(minSimilarity);
  const rerank = parseBoolean(req.body, 'rerank') ?? false;
  if (storeId === undefined || tenantId === undefined || query === undefined || mode === undefined) {
    return null;
  }
  return { storeId, tenantId, mode, query, k, minSimilarity, maxDistance, rerank };
}

async function runSimpleSearch(
  supabase: Supabase,
  p: SearchParams,
  res: AuthenticatedResponse
): Promise<void> {
  const needle = p.query.toLowerCase();
  const [filesRes, chunksRes] = await Promise.all([
    listFilesByStoreTenant(supabase, p.storeId, p.tenantId),
    searchByContent(supabase, {
      ragStoreId: p.storeId,
      tenantId: p.tenantId,
      query: p.query,
      k: p.k,
    }),
  ]);
  if (filesRes.error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: filesRes.error });
    return;
  }
  if (chunksRes.error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: chunksRes.error });
    return;
  }
  const files = filesRes.result.filter((f) => f.filename.toLowerCase().includes(needle));
  const chunks = await resolveImageChunksContent(chunksRes.result);
  res.status(HTTP_OK).json({ mode: 'simple', files, chunks });
}

export interface RerankInputParams {
  query: string;
  candidates: SemanticChunk[];
  topK: number;
  minScore: number;
}

export async function applyRerank(params: RerankInputParams): Promise<SemanticChunk[]> {
  const ranked = await rerankRecords({
    query: params.query,
    topN: params.topK,
    records: params.candidates.map((c) => ({ id: c.id, content: c.content })),
  });
  const byId = new Map(params.candidates.map((c) => [c.id, c]));
  const out: SemanticChunk[] = [];
  for (const r of ranked) {
    if (r.score < params.minScore) continue;
    const chunk = byId.get(r.id);
    if (chunk === undefined) continue;
    out.push({ ...chunk, rerank_score: r.score });
  }
  return out;
}

function log(msg: string): void {
  process.stdout.write(`[ragSem] ${msg}\n`);
}

async function fetchTextPool(supabase: Supabase, p: SearchParams): Promise<SemanticChunk[]> {
  const queryVector = await embedQuery(p.query);
  log(`embed ok dims=${String(queryVector.length)}`);
  const poolSize = p.rerank ? RERANK_CANDIDATE_POOL : p.k;
  const { result, error } = await searchBySemantic(supabase, {
    ragStoreId: p.storeId,
    tenantId: p.tenantId,
    queryVector,
    k: poolSize,
    maxDistance: p.maxDistance,
  });
  if (error !== null) throw new Error(error);
  log(`rpc ok pool=${String(result.length)}`);
  return result;
}

async function maybeRerankTextPool(p: SearchParams, pool: SemanticChunk[]): Promise<SemanticChunk[]> {
  if (!p.rerank) return pool;
  const chunks = await applyRerank({
    query: p.query,
    candidates: pool,
    topK: p.k,
    minScore: p.minSimilarity,
  });
  log(`rerank kept=${String(chunks.length)}`);
  return chunks;
}

async function runSemanticPipeline(supabase: Supabase, p: SearchParams): Promise<SemanticChunk[]> {
  const textPool = await fetchTextPool(supabase, p);
  const [textRanked, imagePool] = await Promise.all([
    maybeRerankTextPool(p, textPool),
    fetchImagePoolIfAny(supabase, { storeId: p.storeId, tenantId: p.tenantId, query: p.query, k: p.k }),
  ]);
  log(`image pool=${String(imagePool.length)}`);
  if (imagePool.length === EMPTY_POOL) return textRanked;
  return mergePoolsByScore(textRanked, imagePool, p.k);
}

async function runSemanticSearch(
  supabase: Supabase,
  p: SearchParams,
  res: AuthenticatedResponse
): Promise<void> {
  log(`entry k=${String(p.k)} rerank=${String(p.rerank)} query="${p.query}"`);
  try {
    const chunks = await resolveImageChunksContent(await runSemanticPipeline(supabase, p));
    res.status(HTTP_OK).json({ mode: 'semantic', chunks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`error: ${msg}`);
    res.status(HTTP_INTERNAL_ERROR).json({ error: msg });
  }
}

async function dispatch(supabase: Supabase, params: SearchParams, res: AuthenticatedResponse): Promise<void> {
  if (params.mode === 'simple') {
    await runSimpleSearch(supabase, params, res);
    return;
  }
  if (params.mode === 'semantic') {
    await runSemanticSearch(supabase, params, res);
    return;
  }
  if (params.mode === 'hybrid') {
    await runHybridSearch(supabase, params, res);
    return;
  }
  res.status(HTTP_BAD_REQUEST).json({ error: `unknown mode: ${params.mode}` });
}

export async function handleSearchChunks(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const params = parseParams(req);
  if (params === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId, tenantId, mode, query required' });
    return;
  }
  try {
    await dispatch(supabase, params, res);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
