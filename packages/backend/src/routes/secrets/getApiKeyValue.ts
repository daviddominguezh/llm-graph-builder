import type { Request } from 'express';

import { getApiKeyValueById } from '../../db/queries/apiKeyQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getKeyIdParam } from './secretsHelpers.js';

export async function handleGetApiKeyValue(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const keyId = getKeyIdParam(req);

  if (keyId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Key ID is required' });
    return;
  }

  try {
    const { value, error } = await getApiKeyValueById(supabase, keyId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ value });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
