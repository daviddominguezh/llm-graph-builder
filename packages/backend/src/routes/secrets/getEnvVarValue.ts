import type { Request } from 'express';

import { getEnvVariableValue } from '../../db/queries/envVariableQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getVarIdParam } from './secretsHelpers.js';

export async function handleGetEnvVarValue(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const varId = getVarIdParam(req);

  if (varId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Variable ID is required' });
    return;
  }

  try {
    const { value, error } = await getEnvVariableValue(supabase, varId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ value });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
