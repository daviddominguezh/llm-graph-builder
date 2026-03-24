import type { Request } from 'express';

import { unpublishFromLibrary } from '../../db/queries/mcpLibraryQueries.js';
import { removeMcpImage } from '../../db/queries/mcpLibraryStorageQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getEntryId } from './mcpLibraryHelpers.js';

export async function handleUnpublishLibraryItem(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const entryId = getEntryId(req);

  if (entryId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Entry ID is required' });
    return;
  }

  try {
    await removeMcpImage(supabase, entryId);
    const { error } = await unpublishFromLibrary(supabase, entryId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
