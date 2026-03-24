import type { Request } from 'express';

import { getLibraryItemById } from '../../db/queries/mcpLibraryQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getEntryId } from './mcpLibraryHelpers.js';

export async function handleGetLibraryItem(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const entryId = getEntryId(req);

  if (entryId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Entry ID is required' });
    return;
  }

  try {
    const { result, error } = await getLibraryItemById(supabase, entryId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    if (result === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Library item not found' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
