import { decrypt, encrypt } from '../../mcp/oauth/encryption.js';
import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

export interface OAuthConnectionRow {
  id: string;
  org_id: string;
  library_item_id: string;
  client_id: string;
  client_registration: string; // encrypted
  access_token: string; // encrypted
  refresh_token: string | null; // encrypted
  expires_at: string | null;
  token_endpoint: string;
  scopes: string | null;
  connected_by: string;
  key_version: number;
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
}

export interface UpsertConnectionInput {
  orgId: string;
  libraryItemId: string;
  clientId: string;
  clientRegistration: string; // plaintext, will be encrypted
  accessToken: string; // plaintext, will be encrypted
  refreshToken: string | null; // plaintext, will be encrypted
  expiresAt: Date | null;
  tokenEndpoint: string;
  scopes: string | null;
  connectedBy: string;
}

export function decryptRow(row: OAuthConnectionRow): DecryptedConnection {
  return {
    id: row.id,
    orgId: row.org_id,
    libraryItemId: row.library_item_id,
    clientId: row.client_id,
    clientRegistration: decrypt(row.client_registration),
    accessToken: decrypt(row.access_token),
    refreshToken: row.refresh_token !== null ? decrypt(row.refresh_token) : null,
    expiresAt: row.expires_at !== null ? new Date(row.expires_at) : null,
    tokenEndpoint: row.token_endpoint,
    scopes: row.scopes,
  };
}

export async function getConnection(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<DecryptedConnection | null> {
  const result = await supabase
    .from('mcp_oauth_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('library_item_id', libraryItemId)
    .single();
  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return null;
    throw new Error(`getConnection: ${result.error.message}`);
  }
  return decryptRow(result.data as OAuthConnectionRow);
}

function buildUpsertRow(input: UpsertConnectionInput): Record<string, unknown> {
  return {
    org_id: input.orgId,
    library_item_id: input.libraryItemId,
    client_id: input.clientId,
    client_registration: encrypt(input.clientRegistration),
    access_token: encrypt(input.accessToken),
    refresh_token: input.refreshToken !== null ? encrypt(input.refreshToken) : null,
    expires_at: input.expiresAt !== null ? input.expiresAt.toISOString() : null,
    token_endpoint: input.tokenEndpoint,
    scopes: input.scopes,
    connected_by: input.connectedBy,
  };
}

export async function upsertConnection(supabase: SupabaseClient, input: UpsertConnectionInput): Promise<void> {
  const row = buildUpsertRow(input);
  const result = await supabase
    .from('mcp_oauth_connections')
    .upsert(row, { onConflict: 'org_id,library_item_id' });
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

interface StatusRow {
  connected_by: string;
  expires_at: string | null;
}

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
  const row = result.data as StatusRow;
  return {
    connected: true,
    connectedBy: row.connected_by,
    expiresAt: row.expires_at ?? undefined,
  };
}
