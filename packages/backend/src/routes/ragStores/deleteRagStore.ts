import type { Request } from 'express';

import { deleteRagStore } from '../../db/queries/ragStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam } from './ragStoreHelpers.js';

export async function handleDeleteRagStore(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  if (storeId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Store ID is required' });
    return;
  }
  try {
    const { error } = await deleteRagStore(supabase, storeId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
