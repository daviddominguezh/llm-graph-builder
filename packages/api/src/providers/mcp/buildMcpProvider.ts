import type { McpServerConfig } from '@daviddh/graph-types';

import { hashServerUrl } from '../../cache/serverHash.js';
import type { DescribeToolsWithMeta, Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
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
import {
  tryReadCachedTools,
  tryReadCurrentVersion,
  tryWriteCachedTools,
  tryWriteCurrentVersion,
} from './mcpCacheHelpers.js';

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
): Promise<DescribeToolsWithMeta> {
  const rawTools = await handle.listTools();
  const descriptors = rawTools.map(rawToolToDescriptor);
  const cachedAt = Date.now();
  const {
    initialized: {
      serverInfo: { version },
    },
  } = handle;
  if (version === '') ctx.logger.warn('metric:mcp.no_version_field');
  if (serverUrl === '') return { tools: descriptors, cachedAt, serverVersion: version };
  const serverHash = await hashServerUrl(serverUrl);
  await tryWriteCachedTools(
    { orgId: ctx.orgId, serverHash, serverUrl, tools: descriptors, version, cachedAt },
    ctx.logger
  );
  await tryWriteCurrentVersion(ctx.orgId, serverHash, version, ctx.logger);
  return { tools: descriptors, cachedAt, serverVersion: version };
}

interface CachedToolsHit {
  tools: ToolDescriptor[];
  cachedAt: number;
  serverVersion: string;
}

async function readCachedToolsForCachedSession(
  deps: EnsureSessionDeps,
  serverUrl: string,
  ctx: ProviderCtx
): Promise<CachedToolsHit | null> {
  const cachedSession = await deps.cache.read(ctx.orgId, serverUrl);
  if (cachedSession === null) return null;
  const serverHash = await hashServerUrl(serverUrl);
  const cached = await tryReadCachedTools(
    ctx.orgId,
    serverHash,
    cachedSession.serverInfo.version,
    ctx.logger
  );
  if (cached === null) return null;
  return {
    tools: cached.tools,
    cachedAt: cached.cachedAt,
    serverVersion: cachedSession.serverInfo.version,
  };
}

async function readCachedToolsByPointer(serverUrl: string, ctx: ProviderCtx): Promise<CachedToolsHit | null> {
  const serverHash = await hashServerUrl(serverUrl);
  const version = await tryReadCurrentVersion(ctx.orgId, serverHash, ctx.logger);
  if (version === null) return null;
  const cached = await tryReadCachedTools(ctx.orgId, serverHash, version, ctx.logger);
  if (cached === null) return null;
  return { tools: cached.tools, cachedAt: cached.cachedAt, serverVersion: version };
}

const MS_PER_SECOND = 1_000;
const MIN_AGE_SECONDS = 0;

function ageSeconds(cachedAt: number): number {
  return Math.max(MIN_AGE_SECONDS, Math.floor((Date.now() - cachedAt) / MS_PER_SECOND));
}

async function describe(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  ctx: ProviderCtx
): Promise<DescribeToolsWithMeta> {
  const serverUrl = extractServerUrl(server);
  if (serverUrl !== '') {
    const viaSession = await readCachedToolsForCachedSession(deps, serverUrl, ctx);
    if (viaSession !== null) {
      ctx.logger.info(
        `metric:cache_hit cache=mcp_tools_list server=${server.name} via=session age=${String(ageSeconds(viaSession.cachedAt))}s`
      );
      return viaSession;
    }
    const viaPointer = await readCachedToolsByPointer(serverUrl, ctx);
    if (viaPointer !== null) {
      ctx.logger.info(
        `metric:cache_hit cache=mcp_tools_list server=${server.name} via=pointer age=${String(ageSeconds(viaPointer.cachedAt))}s`
      );
      return viaPointer;
    }
    ctx.logger.info(`metric:cache_miss cache=mcp_tools_list server=${server.name}`);
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
