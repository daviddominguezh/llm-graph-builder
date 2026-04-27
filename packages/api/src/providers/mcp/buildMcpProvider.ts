import type { McpServerConfig } from '@daviddh/graph-types';
import { Redis } from '@upstash/redis';

import { isCacheableSize, mcpToolsListKey } from '../../cache/mcpToolsListCache.js';
import { hashServerUrl, serverUrlSideTableKey } from '../../cache/serverHash.js';
import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import type { OpenFlowTool } from '../types.js';
import { describeAllAiSdkTools, filterToolsByNames } from './adapters.js';

const TOOLS_LIST_TTL_SECONDS = 300;
const SIDE_TABLE_TTL_SECONDS = 86_400;
const VERSION_UNKNOWN = '';
const EMPTY_TOOLS_LENGTH = 0;

let cachedRedis: Redis | null = null;

function getRedis(): Redis | null {
  if (cachedRedis !== null) return cachedRedis;
  const url: string | undefined = process.env.UPSTASH_REDIS_REST_URL;
  const token: string | undefined = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url === undefined || token === undefined) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

interface CachedToolsList {
  serverHash: string;
  tools: ToolDescriptor[];
  cachedAt: number;
}

function isCachedToolsList(value: unknown): value is CachedToolsList {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'serverHash' in value &&
    typeof (value as { serverHash: unknown }).serverHash === 'string' &&
    'tools' in value &&
    Array.isArray((value as { tools: unknown }).tools) &&
    'cachedAt' in value &&
    typeof (value as { cachedAt: unknown }).cachedAt === 'number'
  );
}

async function tryReadCachedTools(orgId: string, serverHash: string): Promise<ToolDescriptor[] | null> {
  const redis = getRedis();
  if (redis === null) return null;
  try {
    const key = mcpToolsListKey(orgId, serverHash, VERSION_UNKNOWN);
    const raw = await redis.get<string>(key);
    if (raw === null) return null;
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!isCachedToolsList(parsed)) return null;
    return parsed.tools;
  } catch {
    return null;
  }
}

async function tryWriteCachedTools(
  orgId: string,
  serverHash: string,
  serverUrl: string,
  tools: ToolDescriptor[]
): Promise<void> {
  if (tools.length === EMPTY_TOOLS_LENGTH) return;
  const redis = getRedis();
  if (redis === null) return;
  const value: CachedToolsList = { serverHash, tools, cachedAt: Date.now() };
  const serialized = JSON.stringify(value);
  if (!isCacheableSize(serialized)) return;
  try {
    const key = mcpToolsListKey(orgId, serverHash, VERSION_UNKNOWN);
    await redis.setex(key, TOOLS_LIST_TTL_SECONDS, serialized);
    const sideEntry = JSON.stringify({ serverUrl, firstSeenAt: Date.now() });
    await redis.setex(serverUrlSideTableKey(serverHash), SIDE_TABLE_TTL_SECONDS, sideEntry);
  } catch {
    // swallow — cache is best-effort
  }
}

function extractServerUrl(server: McpServerConfig): string {
  const { transport } = server;
  if (transport.type === 'http' || transport.type === 'sse') return transport.url;
  return '';
}

async function describeUncached(server: McpServerConfig, ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  if (ctx.mcpConnector === undefined) return [];
  const client = await ctx.mcpConnector.connect(server);
  try {
    const tools = await client.tools();
    return describeAllAiSdkTools(tools);
  } finally {
    await client.close();
  }
}

async function describe(server: McpServerConfig, ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  if (ctx.mcpConnector === undefined) return [];
  const serverUrl = extractServerUrl(server);
  if (serverUrl === '') return await describeUncached(server, ctx);
  const serverHash = await hashServerUrl(serverUrl);
  const cached = await tryReadCachedTools(ctx.orgId, serverHash);
  if (cached !== null) return cached;
  const tools = await describeUncached(server, ctx);
  await tryWriteCachedTools(ctx.orgId, serverHash, serverUrl, tools);
  return tools;
}

async function build(
  server: McpServerConfig,
  toolNames: string[],
  ctx: ProviderCtx
): Promise<Record<string, OpenFlowTool>> {
  if (ctx.mcpConnector === undefined) return {};
  const client = await ctx.mcpConnector.connect(server);
  try {
    const tools = await client.tools();
    return filterToolsByNames(tools, toolNames);
  } finally {
    await client.close();
  }
}

/**
 * Build an MCP Provider for a single MCP server config. Connection mechanics
 * are delegated to ctx.mcpConnector — backend and edge function each supply
 * their own. See packages/api/src/providers/mcp/README.md for the architecture.
 *
 * describeTools caches the tools/list result in Redis (5-minute TTL) keyed by
 * orgId + serverHash (SHA-256 prefix of URL). Uses the v0 sentinel version since
 * @ai-sdk/mcp's createMCPClient does not expose serverInfo.version. Cache is
 * skipped for stdio transports (no URL) and when Redis env vars are absent.
 *
 * buildTools always reaches the live MCP server — it calls tools to execute,
 * not just list.
 */
export function buildMcpProvider(server: McpServerConfig): Provider {
  return {
    type: 'mcp',
    id: server.id,
    displayName: server.name,
    describeTools: async (ctx) => await describe(server, ctx),
    buildTools: async ({ toolNames, ctx }) => await build(server, toolNames, ctx),
  };
}
