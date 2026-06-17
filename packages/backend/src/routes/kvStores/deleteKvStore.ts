import type { Request } from 'express';

import { findAgentsByKvStore } from '../../db/queries/agentStoreBindingsQueries.js';
import { deleteKvStore, getKvStoreById } from '../../db/queries/kvStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam } from './kvStoreHelpers.js';

const HTTP_CONFLICT = 409;
const EMPTY_LENGTH = 0;

async function runDelete(
  supabase: AuthenticatedLocals['supabase'],
  storeId: string,
  res: AuthenticatedResponse
): Promise<void> {
  const { error } = await deleteKvStore(supabase, storeId);
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
  const storeRes = await getKvStoreById(supabase, storeId);
  if (storeRes.error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: storeRes.error });
    return;
  }
  if (storeRes.result === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'not_found' });
    return;
  }
  const blocking = await findAgentsByKvStore(supabase, storeRes.result.org_id, storeId);
  if (blocking.error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: blocking.error });
    return;
  }
  if (blocking.draft.length > EMPTY_LENGTH || blocking.published.length > EMPTY_LENGTH) {
    res.status(HTTP_CONFLICT).json({ error: 'in_use', draft: blocking.draft, published: blocking.published });
    return;
  }
  await runDelete(supabase, storeId, res);
}

export async function handleDeleteKvStore(req: Request, res: AuthenticatedResponse): Promise<void> {
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
