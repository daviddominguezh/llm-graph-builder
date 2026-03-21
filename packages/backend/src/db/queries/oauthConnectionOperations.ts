import { z } from 'zod';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

export interface OAuthConnectionRow {
  id: string;
  org_id: string;
  library_item_id: string;
  client_id: string;
  expires_at: string | null;
  token_endpoint: string;
  scopes: string | null;
  connected_by: string;
}

export interface DecryptedConnection {
  id: string;
  orgId: string;
  libraryItemId: string;
  clientId: string;
  clientRegistration: string; // decrypted
  accessToken: string; // decrypted
  refreshToken: string | null; // decrypted
  expiresAt: Date | null;
  tokenEndpoint: string;
  scopes: string | null;
  connectedBy: string;
}

export interface UpsertConnectionInput {
  orgId: string;
  libraryItemId: string;
  clientId: string;
  clientRegistration: string; // plaintext, encrypted by RPC
  accessToken: string; // plaintext, encrypted by RPC
  refreshToken: string | null; // plaintext, encrypted by RPC
  expiresAt: Date | null;
  tokenEndpoint: string;
  scopes: string | null;
  connectedBy: string;
}

const OAuthConnectionRowSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  library_item_id: z.string(),
  client_id: z.string(),
  expires_at: z.string().nullable(),
  token_endpoint: z.string(),
  scopes: z.string().nullable(),
  connected_by: z.string(),
});

const OAuthTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().nullable(),
  client_registration: z.string(),
});

const CONNECTION_COLUMNS =
  'id, org_id, library_item_id, client_id, expires_at, token_endpoint, scopes, connected_by';

function buildDecryptedConnection(
  row: OAuthConnectionRow,
  tokens: z.infer<typeof OAuthTokensSchema>
): DecryptedConnection {
  return {
    id: row.id,
    orgId: row.org_id,
    libraryItemId: row.library_item_id,
    clientId: row.client_id,
    clientRegistration: tokens.client_registration,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
    tokenEndpoint: row.token_endpoint,
    scopes: row.scopes,
    connectedBy: row.connected_by,
  };
}

async function fetchConnectionRow(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<OAuthConnectionRow | null> {
  const result = await supabase
    .from('mcp_oauth_connections')
    .select(CONNECTION_COLUMNS)
    .eq('org_id', orgId)
    .eq('library_item_id', libraryItemId)
    .single();
  if (result.error === null) return OAuthConnectionRowSchema.parse(result.data);
  if (result.error.code === 'PGRST116') return null;
  throw new Error(`getConnection: ${result.error.message}`);
}

const OAuthTokensResultSchema = z.array(OAuthTokensSchema).transform((rows) => {
  const [first] = rows;
  if (first === undefined) throw new Error('get_oauth_tokens returned empty result');
  return first;
});

async function fetchTokens(
  supabase: SupabaseClient,
  connectionId: string
): Promise<z.infer<typeof OAuthTokensSchema>> {
  const result = await supabase.rpc('get_oauth_tokens', { p_connection_id: connectionId });

  if (result.error !== null) throw new Error(`get_oauth_tokens: ${result.error.message}`);
  return OAuthTokensResultSchema.parse(result.data);
}

export async function getConnection(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<DecryptedConnection | null> {
  const row = await fetchConnectionRow(supabase, orgId, libraryItemId);
  if (row === null) return null;
  const tokens = await fetchTokens(supabase, row.id);
  return buildDecryptedConnection(row, tokens);
}

export async function upsertConnection(
  supabase: SupabaseClient,
  input: UpsertConnectionInput
): Promise<void> {
  const result = await supabase.rpc('upsert_oauth_connection', {
    p_org_id: input.orgId,
    p_library_item_id: input.libraryItemId,
    p_client_id: input.clientId,
    p_client_registration: input.clientRegistration,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken,
    p_token_endpoint: input.tokenEndpoint,
    p_scopes: input.scopes,
    p_connected_by: input.connectedBy,
    p_expires_at: input.expiresAt === null ? null : input.expiresAt.toISOString(),
  });
  throwOnMutationError(result, 'upsertConnection');
}

export async function deleteConnection(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<void> {
  const result = await supabase
    .from('mcp_oauth_connections')
    .delete()
    .eq('org_id', orgId)
    .eq('library_item_id', libraryItemId);
  throwOnMutationError(result, 'deleteConnection');
}

interface ConnectionStatus {
  connected: boolean;
  connectedBy?: string;
  expiresAt?: string;
}

const StatusRowSchema = z.object({
  connected_by: z.string(),
  expires_at: z.string().nullable(),
});

export async function getConnectionStatus(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<ConnectionStatus> {
  const result = await supabase
    .from('mcp_oauth_connections')
    .select('connected_by, expires_at')
    .eq('org_id', orgId)
    .eq('library_item_id', libraryItemId)
    .single();
  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return { connected: false };
    throw new Error(`getConnectionStatus: ${result.error.message}`);
  }
  const row = StatusRowSchema.parse(result.data);
  return {
    connected: true,
    connectedBy: row.connected_by,
    expiresAt: row.expires_at ?? undefined,
  };
}
