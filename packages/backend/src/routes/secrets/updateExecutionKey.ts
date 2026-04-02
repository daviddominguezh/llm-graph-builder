import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';

import { updateExecutionKeyAgents, updateExecutionKeyName } from '../../db/queries/executionKeyMutations.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import {
  getKeyIdParam,
  parseBooleanField,
  parseStringArrayField,
  parseStringField,
} from './secretsHelpers.js';

async function applyNameUpdate(
  supabase: SupabaseClient,
  keyId: string,
  name: string | undefined
): Promise<string | null> {
  if (name === undefined) return null;
  const { error } = await updateExecutionKeyName(supabase, keyId, name);
  return error;
}

async function applyAgentIdsUpdate(
  supabase: SupabaseClient,
  keyId: string,
  allAgents: boolean | undefined,
  agentIds: string[] | undefined
): Promise<string | null> {
  if (allAgents === undefined && agentIds === undefined) return null;
  const { error } = await updateExecutionKeyAgents(supabase, keyId, allAgents ?? false, agentIds ?? []);
  return error;
}

export async function handleUpdateExecutionKey(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const keyId = getKeyIdParam(req);

  if (keyId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Key ID is required' });
    return;
  }

  const name = parseStringField(req.body, 'name');
  const allAgents = parseBooleanField(req.body, 'allAgents');
  const agentIds = parseStringArrayField(req.body, 'agentIds');

  if (name === undefined && allAgents === undefined && agentIds === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'At least name, allAgents, or agentIds is required' });
    return;
  }

  try {
    const nameError = await applyNameUpdate(supabase, keyId, name);
    if (nameError !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: nameError });
      return;
    }

    const agentError = await applyAgentIdsUpdate(supabase, keyId, allAgents, agentIds);
    if (agentError !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: agentError });
      return;
    }

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
