import type { McpServerConfig } from '@daviddh/graph-types';
import { Redis } from '@upstash/redis';

import { isCacheableSize, mcpToolsListKey } from '../../cache/mcpToolsListCache.js';
import { hashServerUrl, serverUrlSideTableKey } from '../../cache/serverHash.js';
import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import type { OpenFlowTool } from '../types.js';
import { type McpClientHandle, connectMcp } from './client/mcpClient.js';
import type { RawMcpTool } from './client/types.js';
import { createTransport as defaultCreateTransport } from './transport/createTransport.js';
import type { McpTransport } from './transport/transport.js';

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

export type CreateTransportFn = (server: McpServerConfig) => Promise<McpTransport>;

export interface BuildMcpProviderOptions {
  /** Test seam — override the transport factory. Production uses the real createTransport. */
  createTransport?: CreateTransportFn;
}

function rawToolToDescriptor(rt: RawMcpTool): ToolDescriptor {
  return {
    toolName: rt.name,
    description: rt.description ?? '',
    inputSchema: rt.inputSchema,
  };
}

async function withConnectedClient<T>(
  factory: CreateTransportFn,
  server: McpServerConfig,
  body: (handle: McpClientHandle) => Promise<T>
): Promise<T> {
  const transport = await factory(server);
  let handle: McpClientHandle | null = null;
  try {
    handle = await connectMcp({ transport });
    return await body(handle);
  } finally {
    if (handle === null) await transport.close();
    else await handle.close();
  }
}

async function describeUncached(
  factory: CreateTransportFn,
  server: McpServerConfig,
  _ctx: ProviderCtx
): Promise<ToolDescriptor[]> {
  return await withConnectedClient(factory, server, async (handle) => {
    const rawTools = await handle.listTools();
    return rawTools.map(rawToolToDescriptor);
  });
}

async function describe(
  factory: CreateTransportFn,
  server: McpServerConfig,
  ctx: ProviderCtx
): Promise<ToolDescriptor[]> {
  const serverUrl = extractServerUrl(server);
  if (serverUrl === '') return await describeUncached(factory, server, ctx);
  const serverHash = await hashServerUrl(serverUrl);
  const cached = await tryReadCachedTools(ctx.orgId, serverHash);
  if (cached !== null) return cached;
  const tools = await describeUncached(factory, server, ctx);
  await tryWriteCachedTools(ctx.orgId, serverHash, serverUrl, tools);
  return tools;
}

function buildExecuteFn(
  factory: CreateTransportFn,
  server: McpServerConfig,
  toolName: string
): OpenFlowTool['execute'] {
  return async (args: unknown): Promise<unknown> =>
    await withConnectedClient(factory, server, async (handle) => await handle.callTool(toolName, args));
}

function rawToolToOpenFlowTool(
  factory: CreateTransportFn,
  server: McpServerConfig,
  rt: RawMcpTool
): OpenFlowTool {
  return {
    description: rt.description ?? '',
    inputSchema: rt.inputSchema,
    execute: buildExecuteFn(factory, server, rt.name),
  };
}

async function build(
  factory: CreateTransportFn,
  server: McpServerConfig,
  toolNames: string[]
): Promise<Record<string, OpenFlowTool>> {
  return await withConnectedClient(factory, server, async (handle) => {
    const rawTools = await handle.listTools();
    const out: Record<string, OpenFlowTool> = {};
    for (const name of toolNames) {
      const rt = rawTools.find((x) => x.name === name);
      if (rt === undefined) continue;
      out[name] = rawToolToOpenFlowTool(factory, server, rt);
    }
    return out;
  });
}

/**
 * Build an MCP Provider for a single MCP server config. Connection mechanics
 * are owned by the api package via the hand-rolled `createTransport` + `connectMcp`
 * client (see packages/api/src/providers/mcp/{client,transport}/).
 *
 * `describeTools` caches the tools/list result in Redis (5-minute TTL) keyed by
 * orgId + serverHash (SHA-256 prefix of URL). Uses the v0 sentinel version since
 * version-keyed caching is a follow-up. Cache is skipped for stdio transports
 * (no URL) and when Redis env vars are absent.
 *
 * `buildTools` opens a fresh transport per `execute` call; Plan E session-cache
 * reactivation (next task) will reuse a cached session via `transport.setSessionId`,
 * eliminating the per-call init overhead.
 */
export function buildMcpProvider(server: McpServerConfig, options: BuildMcpProviderOptions = {}): Provider {
  const factory = options.createTransport ?? defaultCreateTransport;
  return {
    type: 'mcp',
    id: server.id,
    displayName: server.name,
    describeTools: async (ctx) => await describe(factory, server, ctx),
    buildTools: async ({ toolNames }) => await build(factory, server, toolNames),
  };
}
