import type { Request } from 'express';

import { replaceKvEntries } from '../../db/queries/kvEntriesQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam, getTenantIdParam, parseEntriesBody } from './kvStoreHelpers.js';

export async function handleSaveKvEntries(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const tenantId = getTenantIdParam(req);
  if (storeId === undefined || tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId and tenantId are required' });
    return;
  }
  const entries = parseEntriesBody(req.body);
  if (entries === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Body must be an array of { key, value }' });
    return;
  }
  try {
    const { error } = await replaceKvEntries(supabase, storeId, tenantId, entries);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
