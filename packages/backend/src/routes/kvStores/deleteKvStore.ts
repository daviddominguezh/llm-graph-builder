import type { Request } from 'express';

import { deleteKvStore } from '../../db/queries/kvStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam } from './kvStoreHelpers.js';

export async function handleDeleteKvStore(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  if (storeId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Store ID is required' });
    return;
  }
  try {
    const { error } = await deleteKvStore(supabase, storeId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
