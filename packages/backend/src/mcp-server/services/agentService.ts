import {
  type AgentMetadata,
  type AgentRow,
  deleteAgent as deleteAgentQuery,
  getAgentBySlug,
  getAgentsByOrg,
  insertAgent,
  updateAgent as updateAgentQuery,
} from '../../db/queries/agentQueries.js';
import { findUniqueSlug, generateSlug } from '../../db/queries/slugQueries.js';
import type { ServiceContext } from '../types.js';

export async function listAgents(ctx: ServiceContext, search?: string): Promise<AgentMetadata[]> {
  const { result, error } = await getAgentsByOrg(ctx.supabase, ctx.orgId);
  if (error !== null) throw new Error(error);
  if (search === undefined) return result;
  const lower = search.toLowerCase();
  return result.filter((a) => a.name.toLowerCase().includes(lower) || a.slug.toLowerCase().includes(lower));
}

export async function createAgent(
  ctx: ServiceContext,
  name: string,
  description: string,
  category: string
): Promise<AgentRow> {
  const base = generateSlug(name);
  const slug = await findUniqueSlug(ctx.supabase, base, 'agents');
  const { result, error } = await insertAgent(ctx.supabase, {
    orgId: ctx.orgId,
    name,
    slug,
    description,
    category,
    isPublic: false,
  });
  if (error !== null || result === null) throw new Error(error ?? 'Failed to create agent');
  return result;
}

export async function getAgent(ctx: ServiceContext, agentSlug: string): Promise<AgentRow> {
  const { result, error } = await getAgentBySlug(ctx.supabase, agentSlug);
  if (error !== null || result === null) throw new Error(error ?? `Agent not found: ${agentSlug}`);
  return result;
}

export async function updateAgent(
  ctx: ServiceContext,
  agentId: string,
  fields: { name?: string; description?: string }
): Promise<void> {
  const { error } = await updateAgentQuery(ctx.supabase, agentId, fields);
  if (error !== null) throw new Error(error);
}

export async function deleteAgent(ctx: ServiceContext, agentSlug: string): Promise<void> {
  const { result, error } = await getAgentBySlug(ctx.supabase, agentSlug);
  if (error !== null || result === null) throw new Error(error ?? `Agent not found: ${agentSlug}`);
  const deleteResult = await deleteAgentQuery(ctx.supabase, result.id);
  if (deleteResult.error !== null) throw new Error(deleteResult.error);
}
