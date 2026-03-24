import type { Request } from 'express';

import { createExecutionKey } from '../../db/queries/executionKeyMutations.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseNullableStringField, parseStringArrayField, parseStringField } from './secretsHelpers.js';

export async function handleCreateExecutionKey(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  const agentIds = parseStringArrayField(req.body, 'agentIds');
  const expiresAt = parseNullableStringField(req.body, 'expiresAt');

  if (orgId === undefined || name === undefined || agentIds === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId, name, and agentIds are required' });
    return;
  }

  try {
    const { result, error } = await createExecutionKey(supabase, {
      orgId,
      name,
      agentIds,
      expiresAt: expiresAt ?? null,
    });

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create execution key' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
