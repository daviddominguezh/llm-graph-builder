import type { McpServerConfig } from '@daviddh/graph-types';
import {
  type DescribeAllItem,
  type ProviderCtx,
  builtInProviders,
  composeRegistry,
} from '@daviddh/llm-graph-runner';
import type { Request } from 'express';

import { getAgentById } from '../../db/queries/agentQueries.js';
import { getPublishedGraphData } from '../../db/queries/executionAuthQueries.js';
import { consoleLogger } from '../../logger.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

interface GraphDataLike {
  mcpServers?: McpServerConfig[];
}

function extractMcpServers(graphData: Record<string, unknown> | null): McpServerConfig[] {
  if (graphData === null) return [];
  const { mcpServers } = graphData as GraphDataLike;
  return Array.isArray(mcpServers) ? mcpServers : [];
}

function buildCatalogProviderCtx(orgId: string, agentId: string): ProviderCtx {
  return {
    orgId,
    agentId,
    isChildAgent: false,
    logger: consoleLogger,
    oauthTokens: new Map<string, never>(),
    mcpServers: new Map<string, McpServerConfig>(),
    services: () => undefined,
  };
}

interface ProviderResponseShape {
  type: 'builtin' | 'mcp';
  id: string;
  displayName: string;
  description?: string;
  tools: DescribeAllItem['tools'];
  error?: DescribeAllItem['error'];
}

function shapeProviders(items: DescribeAllItem[]): ProviderResponseShape[] {
  return items.map((item) => ({
    type: item.provider.type,
    id: item.provider.id,
    displayName: item.provider.displayName,
    description: item.provider.description,
    tools: item.tools,
    error: item.error,
  }));
}

async function respondWithRegistry(
  supabase: AuthenticatedLocals['supabase'],
  agentId: string,
  res: AuthenticatedResponse
): Promise<void> {
  const { result: agent } = await getAgentById(supabase, agentId);
  if (agent === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agent not found' });
    return;
  }
  const graphData = await getPublishedGraphData(supabase, agentId, agent.current_version);
  const orgMcpServers = extractMcpServers(graphData);
  const registry = composeRegistry({ builtIns: builtInProviders, orgMcpServers, logger: consoleLogger });
  const ctx = buildCatalogProviderCtx(agent.org_id, agentId);
  const items = await registry.describeAll(ctx);
  res.status(HTTP_OK).json({ providers: shapeProviders(items), fetchedAt: Date.now() });
}

export async function handleGetAgentRegistry(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  try {
    await respondWithRegistry(supabase, agentId, res);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
