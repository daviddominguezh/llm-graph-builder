import type { McpServerConfig } from '@daviddh/graph-types';
import {
  type McpClientHandle,
  type McpTransport,
  SessionExpiredError,
  connectMcp,
  createTransport,
  extractServerUrl,
} from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { assertEgressForServers } from '../../lib/assertEgressForServers.js';
import { resolveAccessToken } from '../oauth/tokenRefresh.js';

/**
 * Injectable connect-path dependencies. Splitting egress, token resolution, and
 * the transport connect into seams keeps `connectEntry`'s orchestration logic
 * (egress → token → connect, 401 reconnect-once) unit-testable without real
 * network / Supabase access. Production wiring is `buildConnectEntryDeps`.
 */
export interface ConnectEntryDeps {
  assertEgress: (servers: McpServerConfig[]) => Promise<void>;
  resolveToken: (server: McpServerConfig) => Promise<string | null>;
  connect: (server: McpServerConfig, accessToken: string | null) => Promise<McpClientHandle>;
}

/**
 * Apply the OAuth bearer token to the transport config. stdio carries no HTTP
 * headers, and a null token means the server needs no auth (or none is wired),
 * so both pass through unchanged. Otherwise merge over any static headers.
 */
function applyAuthHeader(server: McpServerConfig, accessToken: string | null): McpServerConfig {
  if (accessToken === null) return server;
  const { transport } = server;
  if (transport.type === 'stdio') return server;
  const headers = { ...(transport.headers ?? {}), authorization: `Bearer ${accessToken}` };
  return { ...server, transport: { ...transport, headers } };
}

function isAuthFailure(err: unknown): boolean {
  return err instanceof SessionExpiredError;
}

/**
 * Production wiring of {@link ConnectEntryDeps}. OAuth is keyed on
 * `orgId + libraryItemId` (not tenantId); a server without a `libraryItemId` or
 * without a network URL needs no token. The connect seam builds the transport
 * (auth header applied) and closes it on connect failure so a failed attempt
 * never leaks a half-open transport.
 */
export function buildConnectEntryDeps(supabase: SupabaseClient, orgId: string): ConnectEntryDeps {
  return {
    assertEgress: async (servers) => {
      await assertEgressForServers(servers);
    },
    resolveToken: async (server) => {
      if (server.libraryItemId === undefined) return null;
      const url = extractServerUrl(server);
      if (url === '') return null;
      return await resolveAccessToken(supabase, orgId, server.libraryItemId, url);
    },
    connect: async (server, accessToken) => {
      const transport: McpTransport = createTransport(applyAuthHeader(server, accessToken));
      try {
        return await connectMcp({ transport });
      } catch (err) {
        await transport.close();
        throw err;
      }
    },
  };
}

/**
 * Connect a single MCP server: run the egress guard first (anti-rebinding SSRF
 * defense), resolve its OAuth token, then connect. If the connect fails with a
 * session-expired / 401, refresh the token and reconnect exactly ONCE; a second
 * failure propagates so callers can surface a reconnect prompt.
 */
export async function connectEntry(
  server: McpServerConfig,
  deps: ConnectEntryDeps
): Promise<McpClientHandle> {
  await deps.assertEgress([server]);
  const token = await deps.resolveToken(server);
  try {
    return await deps.connect(server, token);
  } catch (err) {
    if (!isAuthFailure(err)) throw err;
    const refreshed = await deps.resolveToken(server);
    return await deps.connect(server, refreshed);
  }
}
