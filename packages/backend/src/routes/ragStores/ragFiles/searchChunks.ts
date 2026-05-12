import type { Request } from 'express';

import { searchByContent, searchBySemantic } from '../../../db/queries/ragChunksQueries.js';
import { listFilesByStoreTenant } from '../../../db/queries/ragFilesQueries.js';
import { embedQuery } from '../../../rag/embeddings.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getStoreIdParam, parseNumber, parseString } from './ragFileHelpers.js';

const DEFAULT_K = 20;
const MAX_K = 50;
const MIN_K = 1;
const MIN_SIMILARITY = 0;
const MAX_SIMILARITY = 1;
const DEFAULT_MIN_SIMILARITY = 0;
const QUERY_LOG_MAX_CHARS = 80;
const VECTOR_PREVIEW_DIMS = 4;
const FRACTION_DIGITS = 4;
const ZERO = 0;
const LAST_OFFSET = 1;

type Supabase = AuthenticatedLocals['supabase'];

function log(msg: string): void {
  process.stdout.write(`[ragSearch] ${msg}\n`);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(ZERO, max)}…`;
}

function vectorNorm(v: readonly number[]): number {
  let sum = ZERO;
  for (const n of v) sum += n * n;
  return Math.sqrt(sum);
}

function bodyKeys(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  return Object.keys(body);
}

function fmt(n: number | undefined): string {
  return n === undefined ? 'n/a' : n.toFixed(FRACTION_DIGITS);
}

function fmtMaxDistance(n: number | null): string {
  return n === null ? 'none' : n.toFixed(FRACTION_DIGITS);
}

interface SearchParams {
  storeId: string;
  tenantId: string;
  mode: string;
  query: string;
  k: number;
  maxDistance: number | null;
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
  if (storeId === undefined || tenantId === undefined || query === undefined || mode === undefined) {
    return null;
  }
  return { storeId, tenantId, mode, query, k, maxDistance };
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

async function runSemanticSearch(
  supabase: Supabase,
  p: SearchParams,
  res: AuthenticatedResponse
): Promise<void> {
  const embedStart = Date.now();
  const queryVector = await embedQuery(p.query);
  const embedMs = Date.now() - embedStart;
  log(
    `semantic embed: dims=${String(queryVector.length)} norm=${vectorNorm(queryVector).toFixed(FRACTION_DIGITS)} preview=[${queryVector
      .slice(ZERO, VECTOR_PREVIEW_DIMS)
      .map((n) => n.toFixed(FRACTION_DIGITS))
      .join(', ')}] took=${String(embedMs)}ms`
  );
  if (queryVector.length === ZERO) {
    log('semantic embed: vector empty, aborting');
    res.status(HTTP_INTERNAL_ERROR).json({ error: 'embedding returned empty vector' });
    return;
  }
  const rpcStart = Date.now();
  const { result, error } = await searchBySemantic(supabase, {
    ragStoreId: p.storeId,
    tenantId: p.tenantId,
    queryVector,
    k: p.k,
    maxDistance: p.maxDistance,
  });
  const rpcMs = Date.now() - rpcStart;
  if (error !== null) {
    log(`semantic rpc error after ${String(rpcMs)}ms: ${error}`);
    res.status(HTTP_INTERNAL_ERROR).json({ error });
    return;
  }
  const first = result[ZERO]?.distance;
  const last = result[result.length - LAST_OFFSET]?.distance;
  log(
    `semantic rpc ok: rows=${String(result.length)} took=${String(rpcMs)}ms firstDist=${fmt(first)} lastDist=${fmt(last)} maxDistanceFilter=${fmtMaxDistance(p.maxDistance)}`
  );
  res.status(HTTP_OK).json({ mode: 'semantic', chunks: result });
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
    log(`bad request body keys=${JSON.stringify(bodyKeys(req.body))}`);
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId, tenantId, mode, query required' });
    return;
  }
  log(
    `incoming mode=${params.mode} k=${String(params.k)} maxDistance=${fmtMaxDistance(params.maxDistance)} storeId=${params.storeId} tenantId=${params.tenantId} query="${truncate(params.query, QUERY_LOG_MAX_CHARS)}"`
  );
  const startedAt = Date.now();
  try {
    await dispatch(supabase, params, res);
    log(`done mode=${params.mode} totalMs=${String(Date.now() - startedAt)}`);
  } catch (err) {
    const msg = extractErrorMessage(err);
    log(`throw mode=${params.mode} totalMs=${String(Date.now() - startedAt)} error=${msg}`);
    res.status(HTTP_INTERNAL_ERROR).json({ error: msg });
  }
}
