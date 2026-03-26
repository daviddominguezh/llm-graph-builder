import type { Request } from 'express';

import { browseTemplates } from '../../db/queries/templateQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseBrowseTemplateOptions } from './templateHelpers.js';

export async function handleBrowseTemplates(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const options = parseBrowseTemplateOptions(req);

  try {
    const { result, error } = await browseTemplates(supabase, options);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
