import type { Request } from 'express';

import { getAgentsForKey } from '../../db/queries/executionKeyQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getKeyIdParam } from './secretsHelpers.js';

export async function handleGetExecutionKeyAgents(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const keyId = getKeyIdParam(req);

  if (keyId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Key ID is required' });
    return;
  }

  try {
    const { result, error } = await getAgentsForKey(supabase, keyId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
