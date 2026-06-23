import type { McpServerConfig, VariableValue } from '@daviddh/graph-types';
import { buildResolvedVars, resolveTransport } from '@daviddh/graph-types';
import {
  extractServerUrl,
  hashServerUrl,
  mcpCurrentVersionKey,
  mcpSessionKey,
  serverUrlSideTableKey,
} from '@daviddh/llm-graph-runner';
import { Redis } from '@upstash/redis';
import type { Request } from 'express';

import { getAgentById } from '../../db/queries/agentQueries.js';
import {
  type DecryptedEnvVars,
  getDecryptedEnvVariables,
  getPublishedGraphData,
} from '../../db/queries/executionAuthQueries.js';
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
const EMPTY_LENGTH = 0;

const EMPTY_URL = '';

export interface TenantConfigSnapshot {
  serverId: string;
  tenantId: string;
  variableValues: Record<string, VariableValue>;
}

interface GraphDataLike {
  mcpServers?: McpServerConfig[];
  mcpTenantConfig?: TenantConfigSnapshot[];
}

function extractMcpServers(graphData: unknown): McpServerConfig[] {
  if (typeof graphData !== 'object' || graphData === null) return [];
  const { mcpServers } = graphData as GraphDataLike;
  return Array.isArray(mcpServers) ? mcpServers : [];
}

function extractTenantConfig(graphData: unknown): TenantConfigSnapshot[] {
  if (typeof graphData !== 'object' || graphData === null) return [];
  const { mcpTenantConfig } = graphData as GraphDataLike;
  return Array.isArray(mcpTenantConfig) ? mcpTenantConfig : [];
}

function findServer(servers: McpServerConfig[], mcpServerId: string): McpServerConfig | null {
  return servers.find((s) => s.id === mcpServerId) ?? null;
}

function resolvedUrlForTenant(
  server: McpServerConfig,
  variableValues: Record<string, VariableValue>,
  env: DecryptedEnvVars
): string {
  const resolved = buildResolvedVars(variableValues, { byName: env.byName, byId: env.byId });
  return extractServerUrl({ ...server, transport: resolveTransport(server.transport, resolved) });
}

// Resolve the distinct cacheable URLs a server takes across every snapshotted
// tenant config. Each tenant can have different {{VAR}} values, so each yields a
// separate execution-time cache key — all of which must be busted. Falls back to
// the (possibly templated) transport URL when no per-tenant rows exist.
export function resolveTenantServerUrls(
  server: McpServerConfig,
  snapshot: TenantConfigSnapshot[],
  env: DecryptedEnvVars
): string[] {
  const forServer = snapshot.filter((row) => row.serverId === server.id);
  const urls = new Set<string>();
  if (forServer.length === EMPTY_LENGTH) {
    const fallback = resolvedUrlForTenant(server, server.variableValues ?? {}, env);
    if (fallback !== EMPTY_URL) urls.add(fallback);
    return [...urls];
  }
  for (const row of forServer) {
    const url = resolvedUrlForTenant(server, row.variableValues, env);
    if (url !== EMPTY_URL) urls.add(url);
  }
  return [...urls];
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

async function invalidateOneHash(redis: Redis, orgId: string, serverHash: string): Promise<number> {
  const toolsKeys = await scanAllVersionedToolsKeys(redis, orgId, serverHash);
  const sessionKey = mcpSessionKey(orgId, serverHash);
  const sideKey = serverUrlSideTableKey(serverHash);
  const versionKey = mcpCurrentVersionKey(orgId, serverHash);
  const allKeys = [...toolsKeys, sessionKey, sideKey, versionKey];
  if (allKeys.length === NO_KEYS) return NO_KEYS;
  return await redis.del(...allKeys);
}

// Hash each distinct resolved per-tenant URL and bust its keys. A single Redis
// connection is shared across the (typically small) set of tenant hashes.
async function invalidateForUrls(orgId: string, urls: string[]): Promise<number> {
  if (urls.length === EMPTY_LENGTH) return DELETED_STDIO;
  const redis = getRedis();
  if (redis === null) return NO_KEYS;
  const hashes = await Promise.all(urls.map(async (url) => await hashServerUrl(url)));
  const counts = await Promise.all(hashes.map(async (hash) => await invalidateOneHash(redis, orgId, hash)));
  return counts.reduce((sum, n) => sum + n, NO_KEYS);
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
  const env = await getDecryptedEnvVariables(supabase, agent.org_id);
  const urls = resolveTenantServerUrls(server, extractTenantConfig(graphData), env);
  return await invalidateForUrls(agent.org_id, urls);
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
