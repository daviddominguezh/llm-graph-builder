import type { McpServerConfig } from '@daviddh/graph-types';
import type { OAuthTokenBundle, SelectedTool } from '@daviddh/llm-graph-runner';

import { type DecryptedConnection, getConnection } from '../../db/queries/oauthConnectionOperations.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { resolveGoogleTokenBundle } from '../../google/calendar/tokenResolver.js';
import { resolveAccessToken } from '../../mcp/oauth/tokenRefresh.js';
import { logExec } from './executeHelpers.js';

const SECONDS_PER_MIN = 60;
const MS_PER_SECOND = 1000;
const MINUTES_PER_HOUR = 60;
const FALLBACK_TTL_MS = MINUTES_PER_HOUR * SECONDS_PER_MIN * MS_PER_SECOND;
const EMPTY_LENGTH = 0;

/* ─── Calendar bundle ─── */

interface CalendarBundleArgs {
  supabase: SupabaseClient;
  orgId: string;
  selectedTools: SelectedTool[];
}

function isCalendarUsed(selectedTools: SelectedTool[]): boolean {
  return selectedTools.some((s) => s.providerType === 'builtin' && s.providerId === 'calendar');
}

async function fetchCalendarBundle(args: CalendarBundleArgs): Promise<OAuthTokenBundle | null> {
  if (!isCalendarUsed(args.selectedTools)) return null;
  try {
    return await resolveGoogleTokenBundle(args.supabase, args.orgId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    logExec('calendar token resolution failed (non-fatal)', { error: msg });
    return null;
  }
}

/* ─── MCP bundles ─── */

interface McpBundleArgs {
  supabase: SupabaseClient;
  orgId: string;
  selectedTools: SelectedTool[];
  mcpServers: McpServerConfig[];
}

function selectedMcpProviderIds(selectedTools: SelectedTool[]): Set<string> {
  return new Set(selectedTools.filter((s) => s.providerType === 'mcp').map((s) => s.providerId));
}

function getMcpServerUrl(server: McpServerConfig): string | null {
  const { transport } = server;
  if (transport.type === 'http' || transport.type === 'sse') return transport.url;
  return null;
}

function bundleFromConnection(conn: DecryptedConnection, accessToken: string): OAuthTokenBundle {
  const expiresAt = conn.expiresAt === null ? Date.now() + FALLBACK_TTL_MS : conn.expiresAt.getTime();
  const scopes =
    conn.scopes === null ? undefined : conn.scopes.split(' ').filter((s) => s.length > EMPTY_LENGTH);
  return {
    accessToken,
    expiresAt,
    scopes,
    tokenIssuedAt: Date.now(),
  };
}

async function resolveOneMcpBundle(
  supabase: SupabaseClient,
  orgId: string,
  server: McpServerConfig
): Promise<OAuthTokenBundle | null> {
  // OAuth-protected MCPs are sourced from the MCP library; their connection is
  // keyed by libraryItemId. Custom MCPs (no libraryItemId) carry their own auth
  // via transport.headers and don't need a bundle.
  if (server.libraryItemId === undefined) return null;
  const serverUrl = getMcpServerUrl(server);
  if (serverUrl === null) return null;
  try {
    const conn = await getConnection(supabase, orgId, server.libraryItemId);
    if (conn === null) return null;
    const accessToken = await resolveAccessToken(supabase, orgId, server.libraryItemId, serverUrl);
    return bundleFromConnection(conn, accessToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    logExec(`mcp oauth resolution failed for ${server.id}`, { error: msg });
    return null;
  }
}

async function resolveMcpBundles(args: McpBundleArgs): Promise<Record<string, OAuthTokenBundle>> {
  const wanted = selectedMcpProviderIds(args.selectedTools);
  const usedServers = args.mcpServers.filter((s) => wanted.has(s.id));
  if (usedServers.length === EMPTY_LENGTH) return {};
  const bundles = await Promise.all(
    usedServers.map(async (s) => ({
      id: s.id,
      bundle: await resolveOneMcpBundle(args.supabase, args.orgId, s),
    }))
  );
  const out: Record<string, OAuthTokenBundle> = {};
  for (const { id, bundle } of bundles) {
    if (bundle !== null) out[id] = bundle;
  }
  return out;
}

/* ─── Public: resolveOAuthBundle ─── */

export interface ResolveOAuthBundleArgs {
  supabase: SupabaseClient;
  orgId: string;
  selectedTools: SelectedTool[];
  mcpServers: McpServerConfig[];
}

export async function resolveOAuthBundle(
  args: ResolveOAuthBundleArgs
): Promise<Record<string, OAuthTokenBundle>> {
  const out: Record<string, OAuthTokenBundle> = {};

  const calendarBundle = await fetchCalendarBundle(args);
  if (calendarBundle !== null) out.calendar = calendarBundle;

  const mcpBundles = await resolveMcpBundles({
    supabase: args.supabase,
    orgId: args.orgId,
    selectedTools: args.selectedTools,
    mcpServers: args.mcpServers,
  });
  return { ...out, ...mcpBundles };
}
