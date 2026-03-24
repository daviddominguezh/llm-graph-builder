import type { Request } from 'express';

import { createApiKey } from '../../db/queries/apiKeyQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './secretsHelpers.js';

export async function handleCreateApiKey(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  const keyValue = parseStringField(req.body, 'keyValue');

  if (orgId === undefined || name === undefined || keyValue === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId, name, and keyValue are required' });
    return;
  }

  try {
    const { result, error } = await createApiKey(supabase, orgId, name, keyValue);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create API key' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
