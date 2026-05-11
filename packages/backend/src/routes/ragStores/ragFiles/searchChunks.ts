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

type Supabase = AuthenticatedLocals['supabase'];

interface SearchParams {
  storeId: string;
  tenantId: string;
  mode: string;
  query: string;
  k: number;
}

function parseParams(req: Request): SearchParams | null {
  const storeId = getStoreIdParam(req);
  const tenantId = parseString(req.body, 'tenantId');
  const mode = parseString(req.body, 'mode');
  const query = parseString(req.body, 'query');
  const kRaw = parseNumber(req.body, 'k') ?? DEFAULT_K;
  const k = Math.min(Math.max(MIN_K, Math.floor(kRaw)), MAX_K);
  if (
    storeId === undefined ||
    tenantId === undefined ||
    query === undefined ||
    mode === undefined
  ) {
    return null;
  }
  return { storeId, tenantId, mode, query, k };
}

async function runNameSearch(
  supabase: Supabase,
  p: SearchParams,
  res: AuthenticatedResponse
): Promise<void> {
  const { result, error } = await listFilesByStoreTenant(supabase, p.storeId, p.tenantId);
  if (error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error });
    return;
  }
  const needle = p.query.toLowerCase();
  const matches = result.filter((f) => f.filename.toLowerCase().includes(needle));
  res.status(HTTP_OK).json({ mode: 'name', files: matches });
}

async function runContentSearch(
  supabase: Supabase,
  p: SearchParams,
  res: AuthenticatedResponse
): Promise<void> {
  const { result, error } = await searchByContent(supabase, {
    ragStoreId: p.storeId,
    tenantId: p.tenantId,
    query: p.query,
    k: p.k,
  });
  if (error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error });
    return;
  }
  res.status(HTTP_OK).json({ mode: 'content', chunks: result });
}

async function runSemanticSearch(
  supabase: Supabase,
  p: SearchParams,
  res: AuthenticatedResponse
): Promise<void> {
  const queryVector = await embedQuery(p.query);
  const { result, error } = await searchBySemantic(supabase, {
    ragStoreId: p.storeId,
    tenantId: p.tenantId,
    queryVector,
    k: p.k,
  });
  if (error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error });
    return;
  }
  res.status(HTTP_OK).json({ mode: 'semantic', chunks: result });
}

async function dispatch(
  supabase: Supabase,
  params: SearchParams,
  res: AuthenticatedResponse
): Promise<void> {
  if (params.mode === 'name') {
    await runNameSearch(supabase, params, res);
    return;
  }
  if (params.mode === 'content') {
    await runContentSearch(supabase, params, res);
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
