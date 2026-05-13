import type { McpServerConfig } from '@daviddh/graph-types';

import type { ProviderCtx } from '../provider.js';
import { type McpClientHandle, connectMcp } from './client/mcpClient.js';
import {
  type CachedMcpSession,
  deleteCachedSession as defaultDelete,
  readCachedSession as defaultRead,
  writeCachedSession as defaultWrite,
} from './sessionCache.js';
import { createTransport as defaultCreateTransport } from './transport/createTransport.js';
import { SessionExpiredError } from './transport/errors.js';
import type { McpTransport } from './transport/transport.js';

export type CreateTransportFn = (server: McpServerConfig) => Promise<McpTransport> | McpTransport;

export interface SessionCacheIo {
  read: (orgId: string, serverUrl: string) => Promise<CachedMcpSession | null>;
  write: (orgId: string, serverUrl: string, session: CachedMcpSession) => Promise<void>;
  delete: (orgId: string, serverUrl: string) => Promise<void>;
}

export const defaultSessionCacheIo: SessionCacheIo = {
  read: defaultRead,
  write: defaultWrite,
  delete: defaultDelete,
};

export interface EnsureSessionDeps {
  createTransport: CreateTransportFn;
  cache: SessionCacheIo;
}

export interface EnsureSessionResult {
  handle: McpClientHandle;
  /** Empty string when transport is stdio (no URL — no caching). */
  serverUrl: string;
}

export function extractServerUrl(server: McpServerConfig): string {
  const { transport } = server;
  if (transport.type === 'http' || transport.type === 'sse') return transport.url;
  return '';
}

export function buildDefaultDeps(createTransport?: CreateTransportFn): EnsureSessionDeps {
  return {
    createTransport: createTransport ?? defaultCreateTransport,
    cache: defaultSessionCacheIo,
  };
}

async function connectAndCloseOnError(transport: McpTransport): Promise<McpClientHandle> {
  try {
    return await connectMcp({ transport });
  } catch (err) {
    await transport.close();
    throw err;
  }
}

async function freshConnect(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  serverUrl: string,
  ctx: ProviderCtx
): Promise<EnsureSessionResult> {
  const transport = await deps.createTransport(server);
  const handle = await connectAndCloseOnError(transport);
  if (serverUrl !== '' && handle.sessionId !== null) {
    await deps.cache.write(ctx.orgId, serverUrl, {
      sessionId: handle.sessionId,
      serverInfo: handle.initialized.serverInfo,
      capturedAt: Date.now(),
    });
  }
  return { handle, serverUrl };
}

async function reattachSession(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  serverUrl: string,
  cached: CachedMcpSession
): Promise<EnsureSessionResult> {
  const transport = await deps.createTransport(server);
  transport.setSessionId(cached.sessionId);
  const handle = await connectAndCloseOnError(transport);
  return { handle, serverUrl };
}

interface ReattachArgs {
  deps: EnsureSessionDeps;
  server: McpServerConfig;
  serverUrl: string;
  cached: CachedMcpSession;
  ctx: ProviderCtx;
}

async function tryReattach(args: ReattachArgs): Promise<EnsureSessionResult | null> {
  try {
    return await reattachSession(args.deps, args.server, args.serverUrl, args.cached);
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      await args.deps.cache.delete(args.ctx.orgId, args.serverUrl);
      return null;
    }
    throw err;
  }
}

/**
 * Open an MCP session, reusing a cached `Mcp-Session-Id` when available.
 *
 * On a hit the server reattaches to the existing session, skipping the cost
 * of full state setup on the server side. On a miss (or `SessionExpiredError`
 * during reattach) we fall through to a fresh `initialize` and persist the
 * resulting session ID for next time.
 *
 * stdio transports skip the cache entirely — there's no URL to key on, and
 * each stdio child is its own session.
 */
export async function ensureSession(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  ctx: ProviderCtx
): Promise<EnsureSessionResult> {
  const serverUrl = extractServerUrl(server);
  if (serverUrl === '') return await freshConnect(deps, server, '', ctx);
  const cached = await deps.cache.read(ctx.orgId, serverUrl);
  if (cached !== null) {
    const reattached = await tryReattach({ deps, server, serverUrl, cached, ctx });
    if (reattached !== null) return reattached;
  }
  return await freshConnect(deps, server, serverUrl, ctx);
}
