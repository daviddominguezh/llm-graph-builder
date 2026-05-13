import type { Request } from 'express';

import { updateRagStoreName } from '../../db/queries/ragStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam, parseStringField } from './ragStoreHelpers.js';

export async function handleUpdateRagStore(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const name = parseStringField(req.body, 'name');
  if (storeId === undefined || name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId and name are required' });
    return;
  }
  try {
    const { result, error } = await updateRagStoreName(supabase, storeId, name);
    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'update failed' });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
