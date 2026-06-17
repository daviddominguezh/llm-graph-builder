import type { Request } from 'express';

import { findAgentsByRagStore } from '../../db/queries/agentStoreBindingsQueries.js';
import { deleteRagStore, getRagStoreById } from '../../db/queries/ragStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam } from './ragStoreHelpers.js';

const HTTP_CONFLICT = 409;

async function runDelete(
  supabase: AuthenticatedLocals['supabase'],
  storeId: string,
  res: AuthenticatedResponse
): Promise<void> {
  const { error } = await deleteRagStore(supabase, storeId);
  if (error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error });
    return;
  }
  res.status(HTTP_OK).json({ success: true });
}

async function processDelete(
  supabase: AuthenticatedLocals['supabase'],
  storeId: string,
  res: AuthenticatedResponse
): Promise<void> {
  const storeRes = await getRagStoreById(supabase, storeId);
  if (storeRes.error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: storeRes.error });
    return;
  }
  if (storeRes.result === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'not_found' });
    return;
  }
  const blocking = await findAgentsByRagStore(supabase, storeRes.result.org_id, storeId);
  if (blocking.error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: blocking.error });
    return;
  }
  if (blocking.draft.length > 0 || blocking.published.length > 0) {
    res
      .status(HTTP_CONFLICT)
      .json({ error: 'in_use', draft: blocking.draft, published: blocking.published });
    return;
  }
  await runDelete(supabase, storeId, res);
}

export async function handleDeleteRagStore(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  if (storeId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Store ID is required' });
    return;
  }
  try {
    await processDelete(supabase, storeId, res);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
