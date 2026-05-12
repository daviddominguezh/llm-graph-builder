import type { Request } from 'express';

import {
  type SemanticChunk,
  searchByContent,
  searchBySemantic,
} from '../../../db/queries/ragChunksQueries.js';
import { listFilesByStoreTenant } from '../../../db/queries/ragFilesQueries.js';
import { embedQuery } from '../../../rag/embeddings.js';
import { rerankRecords } from '../../../rag/rerank.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getStoreIdParam, parseBoolean, parseNumber, parseString } from './ragFileHelpers.js';

const DEFAULT_K = 5;
const MAX_K = 10;
const MIN_K = 1;
const MIN_SIMILARITY = 0;
const MAX_SIMILARITY = 1;
const DEFAULT_MIN_SIMILARITY = 0;
const RERANK_CANDIDATE_POOL = 50;

type Supabase = AuthenticatedLocals['supabase'];

interface SearchParams {
  storeId: string;
  tenantId: string;
  mode: string;
  query: string;
  k: number;
  maxDistance: number | null;
  rerank: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

function parseMaxDistance(body: unknown): number | null {
  const raw = parseNumber(body, 'minSimilarity') ?? DEFAULT_MIN_SIMILARITY;
  const sim = clamp(raw, MIN_SIMILARITY, MAX_SIMILARITY);
  if (sim <= MIN_SIMILARITY) return null;
  return MAX_SIMILARITY - sim;
}

function parseParams(req: Request): SearchParams | null {
  const storeId = getStoreIdParam(req);
  const tenantId = parseString(req.body, 'tenantId');
  const mode = parseString(req.body, 'mode');
  const query = parseString(req.body, 'query');
  const kRaw = parseNumber(req.body, 'k') ?? DEFAULT_K;
  const k = clamp(Math.floor(kRaw), MIN_K, MAX_K);
  const maxDistance = parseMaxDistance(req.body);
  const rerank = parseBoolean(req.body, 'rerank') ?? false;
  if (storeId === undefined || tenantId === undefined || query === undefined || mode === undefined) {
    return null;
  }
  return { storeId, tenantId, mode, query, k, maxDistance, rerank };
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
  res.status(HTTP_OK).json({ mode: 'simple', files, chunks: chunksRes.result });
}

async function applyRerank(
  query: string,
  candidates: SemanticChunk[],
  topK: number
): Promise<SemanticChunk[]> {
  const ranked = await rerankRecords({
    query,
    topN: topK,
    records: candidates.map((c) => ({ id: c.id, content: c.content })),
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const out: SemanticChunk[] = [];
  for (const r of ranked) {
    const chunk = byId.get(r.id);
    if (chunk === undefined) continue;
    out.push({ ...chunk, rerank_score: r.score });
  }
  return out;
}

async function runSemanticSearch(
  supabase: Supabase,
  p: SearchParams,
  res: AuthenticatedResponse
): Promise<void> {
  const queryVector = await embedQuery(p.query);
  const poolSize = p.rerank ? RERANK_CANDIDATE_POOL : p.k;
  const { result, error } = await searchBySemantic(supabase, {
    ragStoreId: p.storeId,
    tenantId: p.tenantId,
    queryVector,
    k: poolSize,
    maxDistance: p.maxDistance,
  });
  if (error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error });
    return;
  }
  const chunks = p.rerank ? await applyRerank(p.query, result, p.k) : result;
  res.status(HTTP_OK).json({ mode: 'semantic', chunks });
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
