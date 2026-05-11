import type { Request } from 'express';

import { getKvEntries } from '../../db/queries/kvEntriesQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam, getTenantIdParam } from './kvStoreHelpers.js';

export async function handleGetKvEntries(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const tenantId = getTenantIdParam(req);
  if (storeId === undefined || tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId and tenantId are required' });
    return;
  }
  try {
    const { result, error } = await getKvEntries(supabase, storeId, tenantId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
