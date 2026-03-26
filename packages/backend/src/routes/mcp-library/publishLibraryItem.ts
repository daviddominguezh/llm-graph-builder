import type { Request } from 'express';

import { publishToLibrary } from '../../db/queries/mcpLibraryQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parsePublishInput } from './mcpLibraryHelpers.js';

export async function handlePublishLibraryItem(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase, userId }: AuthenticatedLocals = res.locals;
  const input = parsePublishInput(req.body);

  if (input === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid publish input' });
    return;
  }

  try {
    const { result, error } = await publishToLibrary(supabase, input, userId);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to publish' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
