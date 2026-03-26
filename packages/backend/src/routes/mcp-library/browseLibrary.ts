import type { Request } from 'express';

import { browseLibrary } from '../../db/queries/mcpLibraryQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseBrowseOptions } from './mcpLibraryHelpers.js';

export async function handleBrowseLibrary(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const options = parseBrowseOptions(req);

  try {
    const { result, error } = await browseLibrary(supabase, options);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
