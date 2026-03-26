import type { Request } from 'express';

import { insertAgent } from '../../db/queries/agentQueries.js';
import { findUniqueSlug, generateSlug } from '../../db/queries/slugQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './agentCrudHelpers.js';

export async function handleCreateAgent(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  const description = parseStringField(req.body, 'description');

  if (orgId === undefined || name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and name are required' });
    return;
  }

  const baseSlug = generateSlug(name);
  if (baseSlug === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid agent name' });
    return;
  }

  try {
    const slug = await findUniqueSlug(supabase, baseSlug, 'agents');
    const { result, error } = await insertAgent(supabase, {
      orgId,
      name,
      slug,
      description: description ?? '',
    });

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create agent' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
