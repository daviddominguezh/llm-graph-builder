import type { Request } from 'express';

import { getOrgBySlug } from '../../db/queries/orgQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getSlugParam } from './orgHelpers.js';

export async function handleGetOrgBySlug(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const slug = getSlugParam(req);

  if (slug === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Slug is required' });
    return;
  }

  try {
    const { result, error } = await getOrgBySlug(supabase, slug);

    if (error !== null || result === null) {
      res.status(HTTP_NOT_FOUND).json({ error: error ?? 'Organization not found' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
