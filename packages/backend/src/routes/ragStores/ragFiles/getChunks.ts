import type { Request } from 'express';

import { listChunksForFile } from '../../../db/queries/ragChunksQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const FIRST_PAGE = 1;
const MIN_SIZE = 1;
const MIN_POSITIVE = 0;

function parsePage(value: unknown): number {
  const raw = typeof value === 'string' ? Number(value) : FIRST_PAGE;
  return Number.isFinite(raw) && raw > MIN_POSITIVE ? Math.floor(raw) : FIRST_PAGE;
}

function parsePageSize(value: unknown): number {
  const raw = typeof value === 'string' ? Number(value) : DEFAULT_PAGE_SIZE;
  const safe = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(MIN_SIZE, safe), MAX_PAGE_SIZE);
}

export async function handleGetChunks(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }
  const page = parsePage(req.query.page);
  const pageSize = parsePageSize(req.query.pageSize);
  try {
    const { result, error } = await listChunksForFile(supabase, fileId, page, pageSize);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ chunks: result, page, pageSize });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
