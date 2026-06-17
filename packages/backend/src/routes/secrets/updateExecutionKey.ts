import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';

import {
  updateExecutionKeyAgents,
  updateExecutionKeyName,
  updateExecutionKeyTenants,
} from '../../db/queries/executionKeyMutations.js';
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

async function applyTenantIdsUpdate(
  supabase: SupabaseClient,
  keyId: string,
  allTenants: boolean | undefined,
  tenantIds: string[] | undefined
): Promise<string | null> {
  if (allTenants === undefined && tenantIds === undefined) return null;
  const { error } = await updateExecutionKeyTenants(supabase, keyId, allTenants ?? false, tenantIds ?? []);
  return error;
}

interface UpdateInput {
  name: string | undefined;
  allAgents: boolean | undefined;
  agentIds: string[] | undefined;
  allTenants: boolean | undefined;
  tenantIds: string[] | undefined;
}

function parseUpdateInput(body: unknown): UpdateInput {
  return {
    name: parseStringField(body, 'name'),
    allAgents: parseBooleanField(body, 'allAgents'),
    agentIds: parseStringArrayField(body, 'agentIds'),
    allTenants: parseBooleanField(body, 'allTenants'),
    tenantIds: parseStringArrayField(body, 'tenantIds'),
  };
}

function isEmptyUpdate(input: UpdateInput): boolean {
  return (
    input.name === undefined &&
    input.allAgents === undefined &&
    input.agentIds === undefined &&
    input.allTenants === undefined &&
    input.tenantIds === undefined
  );
}

async function applyAllUpdates(
  supabase: SupabaseClient,
  keyId: string,
  input: UpdateInput
): Promise<string | null> {
  const nameError = await applyNameUpdate(supabase, keyId, input.name);
  if (nameError !== null) return nameError;
  const agentError = await applyAgentIdsUpdate(supabase, keyId, input.allAgents, input.agentIds);
  if (agentError !== null) return agentError;
  return await applyTenantIdsUpdate(supabase, keyId, input.allTenants, input.tenantIds);
}

export async function handleUpdateExecutionKey(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const keyId = getKeyIdParam(req);

  if (keyId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Key ID is required' });
    return;
  }

  const input = parseUpdateInput(req.body);

  if (isEmptyUpdate(input)) {
    res
      .status(HTTP_BAD_REQUEST)
      .json({ error: 'At least name, allAgents, agentIds, allTenants, or tenantIds is required' });
    return;
  }

  try {
    const error = await applyAllUpdates(supabase, keyId, input);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
