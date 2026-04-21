import {
  createExecutionKey as createExecutionKeyQuery,
  deleteExecutionKey as deleteExecutionKeyQuery,
  updateExecutionKeyAgents,
  updateExecutionKeyName,
} from '../../db/queries/executionKeyMutations.js';
import type {
  CreateExecutionKeyResult,
  ExecutionKeyAgent,
  ExecutionKeyRow,
} from '../../db/queries/executionKeyQueries.js';
import { getAgentsForKey, getExecutionKeysByOrg } from '../../db/queries/executionKeyQueries.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExecutionKeyWithAgents extends ExecutionKeyRow {
  agents: ExecutionKeyAgent[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function attachAgents(
  supabase: ServiceContext['supabase'],
  key: ExecutionKeyRow
): Promise<ExecutionKeyWithAgents> {
  const { result: agents } = await getAgentsForKey(supabase, key.id);
  return { ...key, agents };
}

/* ------------------------------------------------------------------ */
/*  Service functions                                                  */
/* ------------------------------------------------------------------ */

export async function listExecutionKeys(ctx: ServiceContext): Promise<ExecutionKeyWithAgents[]> {
  const { result, error } = await getExecutionKeysByOrg(ctx.supabase, ctx.orgId);
  if (error !== null) throw new Error(error);
  return await Promise.all(result.map(async (key) => await attachAgents(ctx.supabase, key)));
}

interface CreateExecutionKeyInput {
  name: string;
  agentIds: string[];
  expiresAt?: string | null;
  allAgents?: boolean;
}

export async function createExecutionKey(
  ctx: ServiceContext,
  input: CreateExecutionKeyInput
): Promise<CreateExecutionKeyResult> {
  const { result, error } = await createExecutionKeyQuery(ctx.supabase, {
    orgId: ctx.orgId,
    name: input.name,
    allAgents: input.allAgents ?? false,
    agentIds: input.agentIds,
    expiresAt: input.expiresAt ?? null,
  });
  if (error !== null || result === null) throw new Error(error ?? 'Failed to create execution key');
  return result;
}

export async function updateExecutionKey(
  ctx: ServiceContext,
  keyId: string,
  fields: { name?: string; allAgents?: boolean; agentIds?: string[] }
): Promise<void> {
  if (fields.name !== undefined) {
    const { error } = await updateExecutionKeyName(ctx.supabase, keyId, fields.name);
    if (error !== null) throw new Error(error);
  }
  if (fields.allAgents !== undefined || fields.agentIds !== undefined) {
    const { error } = await updateExecutionKeyAgents(
      ctx.supabase,
      keyId,
      fields.allAgents ?? false,
      fields.agentIds ?? []
    );
    if (error !== null) throw new Error(error);
  }
}

export async function deleteExecutionKey(ctx: ServiceContext, keyId: string): Promise<void> {
  const { error } = await deleteExecutionKeyQuery(ctx.supabase, keyId);
  if (error !== null) throw new Error(error);
}
