import type { McpServerConfig } from '@daviddh/graph-types';
import { Redis } from '@upstash/redis';

import { isCacheableSize, mcpToolsListKey } from '../../cache/mcpToolsListCache.js';
import { hashServerUrl, serverUrlSideTableKey } from '../../cache/serverHash.js';
import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import type { OpenFlowTool } from '../types.js';
import type { McpClientHandle } from './client/mcpClient.js';
import type { RawMcpTool } from './client/types.js';
import {
  type CreateTransportFn,
  type EnsureSessionDeps,
  type EnsureSessionResult,
  type SessionCacheIo,
  buildDefaultDeps,
  ensureSession,
  extractServerUrl,
} from './ensureSession.js';

const TOOLS_LIST_TTL_SECONDS = 300;
const SIDE_TABLE_TTL_SECONDS = 86_400;
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
  const v = value as { serverHash?: unknown; tools?: unknown; cachedAt?: unknown };
  return typeof v.serverHash === 'string' && Array.isArray(v.tools) && typeof v.cachedAt === 'number';
}

async function tryReadCachedTools(
  orgId: string,
  serverHash: string,
  version: string
): Promise<ToolDescriptor[] | null> {
  const redis = getRedis();
  if (redis === null) return null;
  try {
    const key = mcpToolsListKey(orgId, serverHash, version);
    const raw = await redis.get<string>(key);
    if (raw === null) return null;
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!isCachedToolsList(parsed)) return null;
    return parsed.tools;
  } catch {
    return null;
  }
}

interface ToolsCacheWriteArgs {
  orgId: string;
  serverHash: string;
  serverUrl: string;
  tools: ToolDescriptor[];
  version: string;
}

async function tryWriteCachedTools(args: ToolsCacheWriteArgs): Promise<void> {
  if (args.tools.length === EMPTY_TOOLS_LENGTH) return;
  const redis = getRedis();
  if (redis === null) return;
  const value: CachedToolsList = { serverHash: args.serverHash, tools: args.tools, cachedAt: Date.now() };
  const serialized = JSON.stringify(value);
  if (!isCacheableSize(serialized)) return;
  try {
    const key = mcpToolsListKey(args.orgId, args.serverHash, args.version);
    await redis.setex(key, TOOLS_LIST_TTL_SECONDS, serialized);
    const sideEntry = JSON.stringify({ serverUrl: args.serverUrl, firstSeenAt: Date.now() });
    await redis.setex(serverUrlSideTableKey(args.serverHash), SIDE_TABLE_TTL_SECONDS, sideEntry);
  } catch {
    // swallow — cache is best-effort
  }
}

export interface BuildMcpProviderOptions {
  /** Test seam — override the transport factory. Production uses the real createTransport. */
  createTransport?: CreateTransportFn;
  /** Test seam — override session cache I/O. */
  sessionCache?: SessionCacheIo;
}

function rawToolToDescriptor(rt: RawMcpTool): ToolDescriptor {
  return {
    toolName: rt.name,
    description: rt.description ?? '',
    inputSchema: rt.inputSchema,
  };
}

async function withSession<T>(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  ctx: ProviderCtx,
  body: (session: EnsureSessionResult) => Promise<T>
): Promise<T> {
  const session = await ensureSession(deps, server, ctx);
  try {
    return await body(session);
  } finally {
    await session.handle.close();
  }
}

async function listAndCacheTools(
  handle: McpClientHandle,
  ctx: ProviderCtx,
  serverUrl: string
): Promise<ToolDescriptor[]> {
  const rawTools = await handle.listTools();
  const descriptors = rawTools.map(rawToolToDescriptor);
  if (serverUrl === '') return descriptors;
  const serverHash = await hashServerUrl(serverUrl);
  const {
    initialized: {
      serverInfo: { version },
    },
  } = handle;
  await tryWriteCachedTools({
    orgId: ctx.orgId,
    serverHash,
    serverUrl,
    tools: descriptors,
    version,
  });
  return descriptors;
}

async function readCachedToolsForCachedSession(
  deps: EnsureSessionDeps,
  serverUrl: string,
  ctx: ProviderCtx
): Promise<ToolDescriptor[] | null> {
  const cachedSession = await deps.cache.read(ctx.orgId, serverUrl);
  if (cachedSession === null) return null;
  const serverHash = await hashServerUrl(serverUrl);
  return await tryReadCachedTools(ctx.orgId, serverHash, cachedSession.serverInfo.version);
}

async function describe(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  ctx: ProviderCtx
): Promise<ToolDescriptor[]> {
  const serverUrl = extractServerUrl(server);
  if (serverUrl !== '') {
    const cachedTools = await readCachedToolsForCachedSession(deps, serverUrl, ctx);
    if (cachedTools !== null) return cachedTools;
  }
  return await withSession(
    deps,
    server,
    ctx,
    async (session) => await listAndCacheTools(session.handle, ctx, session.serverUrl)
  );
}

function buildExecuteFn(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  ctx: ProviderCtx,
  toolName: string
): OpenFlowTool['execute'] {
  return async (args: unknown): Promise<unknown> =>
    await withSession(deps, server, ctx, async (session) => await session.handle.callTool(toolName, args));
}

function rawToolToOpenFlowTool(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  ctx: ProviderCtx,
  rt: RawMcpTool
): OpenFlowTool {
  return {
    description: rt.description ?? '',
    inputSchema: rt.inputSchema,
    execute: buildExecuteFn(deps, server, ctx, rt.name),
  };
}

async function build(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  ctx: ProviderCtx,
  toolNames: string[]
): Promise<Record<string, OpenFlowTool>> {
  return await withSession(deps, server, ctx, async (session) => {
    const rawTools = await session.handle.listTools();
    const out: Record<string, OpenFlowTool> = {};
    for (const name of toolNames) {
      const rt = rawTools.find((x) => x.name === name);
      if (rt === undefined) continue;
      out[name] = rawToolToOpenFlowTool(deps, server, ctx, rt);
    }
    return out;
  });
}

/**
 * Build an MCP Provider for a single MCP server config. Connection mechanics
 * are owned by the api package via the hand-rolled `createTransport` + `connectMcp`
 * client (see packages/api/src/providers/mcp/{client,transport}/).
 *
 * `describeTools` caches the tools/list result in Redis under a key that
 * includes the server's reported version (from `initialize.serverInfo.version`).
 * When the cached session is hit (no network), the cached version becomes the
 * cache key — so a "double hit" returns tools without any network round-trip.
 *
 * `buildTools` reuses the cached `Mcp-Session-Id` per call via
 * `transport.setSessionId`, so the server skips a fresh state setup on each
 * tool invocation. On `SessionExpiredError`, the cached session is deleted
 * and the next call falls back to a fresh initialize.
 */
export function buildMcpProvider(server: McpServerConfig, options: BuildMcpProviderOptions = {}): Provider {
  const baseDeps = buildDefaultDeps(options.createTransport);
  const deps: EnsureSessionDeps =
    options.sessionCache === undefined ? baseDeps : { ...baseDeps, cache: options.sessionCache };
  return {
    type: 'mcp',
    id: server.id,
    displayName: server.name,
    describeTools: async (ctx) => await describe(deps, server, ctx),
    buildTools: async ({ toolNames, ctx }) => await build(deps, server, ctx, toolNames),
  };
}
