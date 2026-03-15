import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveOAuthToken } from './resolve-oauth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SINGLE_RESULT = 1;

interface McpServerEntry {
  libraryItemId?: string;
  transport?: { type?: string; headers?: Record<string, string> };
  [key: string]: unknown;
}

function hasAuthorizationHeader(server: McpServerEntry): boolean {
  const headers = server.transport?.headers;
  if (headers === undefined) return false;
  return Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
}

function isOAuthCandidate(server: McpServerEntry): boolean {
  return typeof server.libraryItemId === 'string' && !hasAuthorizationHeader(server);
}

function isMcpServerEntry(value: unknown): value is McpServerEntry {
  return typeof value === 'object' && value !== null;
}

interface AuthTypeRow {
  auth_type?: string;
}

function isAuthTypeRow(value: unknown): value is AuthTypeRow {
  return typeof value === 'object' && value !== null;
}

async function lookupAuthType(supabase: SupabaseClient, libraryItemId: string): Promise<string> {
  const result = await supabase.from('mcp_library').select('auth_type').eq('id', libraryItemId).single();
  if (result.error !== null) return 'token';
  const data: unknown = result.data;
  if (!isAuthTypeRow(data)) return 'token';
  return data.auth_type ?? 'token';
}

interface OrgIdRow {
  org_id?: string;
}

function isOrgIdRow(value: unknown): value is OrgIdRow {
  return typeof value === 'object' && value !== null;
}

async function lookupOrgId(supabase: SupabaseClient, libraryItemId: string): Promise<string | null> {
  const result = await supabase
    .from('mcp_oauth_connections')
    .select('org_id')
    .eq('library_item_id', libraryItemId)
    .limit(SINGLE_RESULT)
    .single();
  if (result.error !== null) return null;
  const data: unknown = result.data;
  if (!isOrgIdRow(data)) return null;
  return data.org_id ?? null;
}

function injectAuthHeader(server: McpServerEntry, token: string): void {
  const { transport } = server;
  if (transport === undefined) return;
  const existing = transport.headers ?? {};
  transport.headers = { ...existing, Authorization: `Bearer ${token}` };
}

async function resolveOneServer(
  supabase: SupabaseClient,
  authHeader: string,
  server: McpServerEntry
): Promise<void> {
  if (!isOAuthCandidate(server)) return;
  const { libraryItemId } = server;
  if (libraryItemId === undefined) return;
  const authType = await lookupAuthType(supabase, libraryItemId);
  if (authType !== 'oauth') return;
  const orgId = await lookupOrgId(supabase, libraryItemId);
  if (orgId === null) return;
  const token = await resolveOAuthToken(API_URL, authHeader, orgId, libraryItemId);
  injectAuthHeader(server, token);
}

export async function resolveOAuthServers(
  supabase: SupabaseClient,
  graph: unknown,
  authHeader: string
): Promise<void> {
  if (typeof graph !== 'object' || graph === null || !('mcpServers' in graph)) return;
  const g = graph as Record<string, unknown>;
  const { mcpServers: servers } = g;
  if (!Array.isArray(servers)) return;
  await Promise.all(
    servers.map(async (s: unknown) => {
      if (isMcpServerEntry(s)) await resolveOneServer(supabase, authHeader, s);
    })
  );
}
