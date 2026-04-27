import type { McpServerConfig } from '@daviddh/graph-types';
import { hashServerUrl, mcpToolsListKey, serverUrlSideTableKey } from '@daviddh/llm-graph-runner';
import type { Request } from 'express';

import { buildUpstashClient } from '../../cache/redis.js';
import { getAgentById } from '../../db/queries/agentQueries.js';
import { getPublishedGraphData } from '../../db/queries/executionAuthQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

const VERSION_UNKNOWN = '';
const DELETED_STDIO = 0;

interface GraphDataLike {
  mcpServers?: McpServerConfig[];
}

function extractMcpServers(graphData: unknown): McpServerConfig[] {
  if (typeof graphData !== 'object' || graphData === null) return [];
  const { mcpServers } = graphData as GraphDataLike;
  return Array.isArray(mcpServers) ? mcpServers : [];
}

function findServer(servers: McpServerConfig[], mcpServerId: string): McpServerConfig | null {
  return servers.find((s) => s.id === mcpServerId) ?? null;
}

function getServerUrl(server: McpServerConfig): string | null {
  const { transport } = server;
  if (transport.type === 'http' || transport.type === 'sse') return transport.url;
  return null;
}

async function invalidateCacheKeys(orgId: string, serverHash: string): Promise<number> {
  const redis = buildUpstashClient();
  const toolsKey = mcpToolsListKey(orgId, serverHash, VERSION_UNKNOWN);
  const sideKey = serverUrlSideTableKey(serverHash);
  const deleted = await redis.del(toolsKey, sideKey);
  return deleted;
}

async function runInvalidation(
  supabase: AuthenticatedLocals['supabase'],
  agentId: string,
  mcpServerId: string
): Promise<number | null> {
  const { result: agent } = await getAgentById(supabase, agentId);
  if (agent === null) return null;
  const graphData = await getPublishedGraphData(supabase, agentId, agent.current_version);
  const server = findServer(extractMcpServers(graphData), mcpServerId);
  if (server === null) return null;
  const serverUrl = getServerUrl(server);
  if (serverUrl === null) return DELETED_STDIO;
  const serverHash = await hashServerUrl(serverUrl);
  return await invalidateCacheKeys(agent.org_id, serverHash);
}

export async function handleInvalidateMcpCache(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const { mcpServerId } = req.params as { mcpServerId?: string };
  if (agentId === undefined || mcpServerId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId and mcpServerId required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  try {
    const invalidated = await runInvalidation(supabase, agentId, mcpServerId);
    if (invalidated === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'agent or mcp server not found' });
      return;
    }
    res.status(HTTP_OK).json({ invalidated });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
