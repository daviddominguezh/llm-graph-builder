import type { Request } from 'express';

import type { EnvVariableUpdates } from '../../db/queries/envVariableQueries.js';
import { updateEnvVariable } from '../../db/queries/envVariableQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getVarIdParam, parseBooleanField, parseOptionalStringField } from './secretsHelpers.js';

function buildUpdates(body: unknown): EnvVariableUpdates | undefined {
  const name = parseOptionalStringField(body, 'name');
  const value = parseOptionalStringField(body, 'value');
  const isSecret = parseBooleanField(body, 'isSecret');

  if (name === undefined && value === undefined && isSecret === undefined) {
    return undefined;
  }

  return { name, value, isSecret };
}

export async function handleUpdateEnvVar(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const varId = getVarIdParam(req);

  if (varId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Variable ID is required' });
    return;
  }

  const updates = buildUpdates(req.body);
  if (updates === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'At least one field to update is required' });
    return;
  }

  try {
    const { error } = await updateEnvVariable(supabase, varId, updates);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
