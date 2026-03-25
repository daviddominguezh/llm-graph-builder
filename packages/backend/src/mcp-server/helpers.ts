import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { getAgentBySlugAndOrg, validateKeyAgentAccess } from '../db/queries/executionAuthQueries.js';
import { getAgentsForKey } from '../db/queries/executionKeyQueries.js';
import type { ServiceContext } from './types.js';

const NO_AGENTS = 0;
const JSON_INDENT = 2;

async function checkKeyAccess(ctx: ServiceContext, agentId: string, slug: string): Promise<void> {
  const { result } = await getAgentsForKey(ctx.supabase, ctx.keyId);

  if (result.length === NO_AGENTS) return;

  const hasAccess = await validateKeyAgentAccess(ctx.supabase, ctx.keyId, agentId);
  if (!hasAccess) {
    throw new Error(`Access denied for agent: ${slug}`);
  }
}

export async function resolveAgentId(ctx: ServiceContext, agentSlug: string): Promise<string> {
  const agent = await getAgentBySlugAndOrg(ctx.supabase, agentSlug, ctx.orgId);

  if (agent === null) {
    throw new Error(`Agent not found: ${agentSlug}`);
  }

  await checkKeyAccess(ctx, agent.id, agentSlug);

  return agent.id;
}

export function textResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, JSON_INDENT) }] };
}

export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
