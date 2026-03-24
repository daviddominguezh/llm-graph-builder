import type { Request } from 'express';

import { getLibraryItemById, incrementInstallations } from '../../db/queries/mcpLibraryQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getEntryId } from './mcpLibraryHelpers.js';

export async function handleInstallLibraryItem(req: Request, res: AuthenticatedResponse): Promise<void> {
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

    const countRes = await incrementInstallations(supabase, entryId);
    if (countRes.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: countRes.error });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
