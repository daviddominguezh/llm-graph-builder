import { z } from 'zod';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

export interface GoogleOAuthConnectionRow {
  id: string;
  org_id: string;
  client_id: string;
  expires_at: string | null;
  token_endpoint: string;
  scopes: string | null;
  connected_by: string;
}

export interface DecryptedGoogleConnection {
  id: string;
  orgId: string;
  clientId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  tokenEndpoint: string;
  scopes: string | null;
  connectedBy: string;
}

export interface UpsertGoogleConnectionInput {
  orgId: string;
  clientId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  tokenEndpoint: string;
  scopes: string | null;
  connectedBy: string;
}

export interface GoogleTokensPair {
  access_token: string;
  refresh_token: string | null;
}

const GoogleOAuthConnectionRowSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  client_id: z.string(),
  expires_at: z.string().nullable(),
  token_endpoint: z.string(),
  scopes: z.string().nullable(),
  connected_by: z.string(),
});

const CONNECTION_COLUMNS = 'id, org_id, client_id, expires_at, token_endpoint, scopes, connected_by';

function buildDecryptedConnection(
  row: GoogleOAuthConnectionRow,
  tokens: GoogleTokensPair
): DecryptedGoogleConnection {
  return {
    id: row.id,
    orgId: row.org_id,
    clientId: row.client_id,
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
  orgId: string
): Promise<GoogleOAuthConnectionRow | null> {
  const result = await supabase
    .from('oauth_connections')
    .select(CONNECTION_COLUMNS)
    .eq('org_id', orgId)
    .eq('provider', 'google_calendar')
    .single();
  if (result.error === null) return GoogleOAuthConnectionRowSchema.parse(result.data);
  if (result.error.code === 'PGRST116') return null;
  throw new Error(`getGoogleConnection: ${result.error.message}`);
}

const TokensResultSchema = z
  .array(
    z.object({
      access_token: z.string(),
      refresh_token: z.string().nullable(),
      client_registration: z.string().nullable(),
    })
  )
  .transform((rows) => {
    const [first] = rows;
    if (first === undefined) throw new Error('get_oauth_tokens returned empty result');
    return { access_token: first.access_token, refresh_token: first.refresh_token };
  });

async function fetchTokens(supabase: SupabaseClient, connectionId: string): Promise<GoogleTokensPair> {
  const result = await supabase.rpc('get_oauth_tokens', { p_connection_id: connectionId });
  if (result.error !== null) throw new Error(`get_oauth_tokens: ${result.error.message}`);
  return TokensResultSchema.parse(result.data);
}

export async function getGoogleConnection(
  supabase: SupabaseClient,
  orgId: string
): Promise<DecryptedGoogleConnection | null> {
  const row = await fetchConnectionRow(supabase, orgId);
  if (row === null) return null;
  const tokens = await fetchTokens(supabase, row.id);
  return buildDecryptedConnection(row, tokens);
}

export async function upsertGoogleConnection(
  supabase: SupabaseClient,
  input: UpsertGoogleConnectionInput
): Promise<void> {
  const result = await supabase.rpc('upsert_google_calendar_oauth_connection', {
    p_org_id: input.orgId,
    p_client_id: input.clientId,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken,
    p_token_endpoint: input.tokenEndpoint,
    p_scopes: input.scopes,
    p_connected_by: input.connectedBy,
    p_expires_at: input.expiresAt === null ? null : input.expiresAt.toISOString(),
  });
  throwOnMutationError(result, 'upsertGoogleConnection');
}

export async function deleteGoogleConnection(supabase: SupabaseClient, orgId: string): Promise<void> {
  const result = await supabase
    .from('oauth_connections')
    .delete()
    .eq('org_id', orgId)
    .eq('provider', 'google_calendar');
  throwOnMutationError(result, 'deleteGoogleConnection');
}

interface GoogleConnectionStatus {
  connected: boolean;
  connectedBy?: string;
  expiresAt?: string;
  scopes?: string;
}

const StatusRowSchema = z.object({
  connected_by: z.string(),
  expires_at: z.string().nullable(),
  scopes: z.string().nullable(),
});

export async function getGoogleConnectionStatus(
  supabase: SupabaseClient,
  orgId: string
): Promise<GoogleConnectionStatus> {
  const result = await supabase
    .from('oauth_connections')
    .select('connected_by, expires_at, scopes')
    .eq('org_id', orgId)
    .eq('provider', 'google_calendar')
    .single();
  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return { connected: false };
    throw new Error(`getGoogleConnectionStatus: ${result.error.message}`);
  }
  const row = StatusRowSchema.parse(result.data);
  return {
    connected: true,
    connectedBy: row.connected_by,
    expiresAt: row.expires_at ?? undefined,
    scopes: row.scopes ?? undefined,
  };
}
