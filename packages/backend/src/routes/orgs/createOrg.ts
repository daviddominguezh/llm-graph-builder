import type { Request } from 'express';

import { insertOrg } from '../../db/queries/orgQueries.js';
import { findUniqueSlug, generateSlug } from '../../db/queries/slugQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './orgHelpers.js';

export async function handleCreateOrg(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const name = parseStringField(req.body, 'name');

  if (name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Name is required' });
    return;
  }

  const baseSlug = generateSlug(name);
  if (baseSlug === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid organization name' });
    return;
  }

  try {
    const slug = await findUniqueSlug(supabase, baseSlug, 'organizations');
    const { result, error } = await insertOrg(supabase, name, slug);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create organization' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
