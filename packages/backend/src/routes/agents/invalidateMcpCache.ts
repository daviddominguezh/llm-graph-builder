import type { McpServerConfig } from '@daviddh/graph-types';
import {
  hashServerUrl,
  mcpCurrentVersionKey,
  mcpSessionKey,
  serverUrlSideTableKey,
} from '@daviddh/llm-graph-runner';
import { Redis } from '@upstash/redis';
import type { Request } from 'express';

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

const DELETED_STDIO = 0;
const SCAN_COUNT = 100;
const ZERO_CURSOR = '0';
const NO_KEYS = 0;

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

function getRedis(): Redis | null {
  const url: string | undefined = process.env.UPSTASH_REDIS_REST_URL;
  const token: string | undefined = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url === undefined || token === undefined) return null;
  return new Redis({ url, token });
}

async function scanStep(redis: Redis, pattern: string, cursor: string, acc: string[]): Promise<string[]> {
  const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: SCAN_COUNT });
  const merged = [...acc, ...batch];
  if (nextCursor === ZERO_CURSOR) return merged;
  return await scanStep(redis, pattern, nextCursor, merged);
}

async function scanAllVersionedToolsKeys(redis: Redis, orgId: string, serverHash: string): Promise<string[]> {
  const pattern = `mcp_tools:v1:${orgId}:${serverHash}:*`;
  return await scanStep(redis, pattern, ZERO_CURSOR, []);
}

async function invalidateCacheKeys(orgId: string, serverHash: string): Promise<number> {
  const redis = getRedis();
  if (redis === null) return NO_KEYS;
  const toolsKeys = await scanAllVersionedToolsKeys(redis, orgId, serverHash);
  const sessionKey = mcpSessionKey(orgId, serverHash);
  const sideKey = serverUrlSideTableKey(serverHash);
  const versionKey = mcpCurrentVersionKey(orgId, serverHash);
  const allKeys = [...toolsKeys, sessionKey, sideKey, versionKey];
  if (allKeys.length === NO_KEYS) return NO_KEYS;
  return await redis.del(...allKeys);
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
