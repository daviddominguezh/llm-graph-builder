import type { Request } from 'express';

import { createEnvVariable } from '../../db/queries/envVariableQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseBooleanField, parseStringField } from './secretsHelpers.js';

export async function handleCreateEnvVar(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase, userId }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  const value = parseStringField(req.body, 'value');
  const isSecret = parseBooleanField(req.body, 'isSecret');

  if (orgId === undefined || name === undefined || value === undefined || isSecret === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId, name, value, and isSecret are required' });
    return;
  }

  try {
    const { result, error } = await createEnvVariable(supabase, {
      orgId,
      name,
      value,
      isSecret,
      userId,
    });

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create env variable' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
