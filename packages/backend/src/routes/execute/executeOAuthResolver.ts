import type { McpServerConfig } from '@daviddh/graph-types';
import type { OAuthTokenBundle, SelectedTool } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { resolveGoogleTokenBundle } from '../../google/calendar/tokenResolver.js';
import { logExec } from './executeHelpers.js';

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
  selectedTools: SelectedTool[];
  mcpServers: McpServerConfig[];
}

function resolveMcpBundles(_args: McpBundleArgs): Record<string, OAuthTokenBundle> {
  // TODO(Plan E / OAuth follow-up): resolve per-server OAuth from oauth_connections.
  // Most MCP servers don't require OAuth today; transports that need auth use their
  // own credentials via transport.headers.
  return {};
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

  const mcpBundles = resolveMcpBundles(args);
  return { ...out, ...mcpBundles };
}
