import {
  type DecryptedConnection,
  getConnection,
  upsertConnection,
} from '../../db/queries/oauthConnectionOperations.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { parseClientRegistration } from '../../routes/oauth/oauthHelpers.js';
import { refreshAccessToken } from './tokenExchange.js';

const EXPIRY_BUFFER_MINUTES = 5;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1_000;
const EXPIRY_BUFFER_MS = EXPIRY_BUFFER_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

function isTokenFresh(connection: DecryptedConnection): boolean {
  if (connection.expiresAt === null) return true;
  return connection.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS;
}

function computeExpiresAt(expiresIn: number | undefined): Date | null {
  if (expiresIn === undefined) return null;
  return new Date(Date.now() + expiresIn * MS_PER_SECOND);
}

async function refreshAndStore(
  supabase: SupabaseClient,
  conn: DecryptedConnection,
  mcpServerUrl: string
): Promise<string> {
  if (conn.refreshToken === null) {
    throw new Error('OAuth connection expired and no refresh token available — re-auth needed');
  }
  const reg = parseClientRegistration(conn.clientRegistration);
  const creds = {
    clientId: conn.clientId,
    clientSecret: reg.client_secret,
    authMethod: reg.token_endpoint_auth_method,
  };
  const tokens = await refreshAccessToken(conn.tokenEndpoint, conn.refreshToken, mcpServerUrl, creds);
  await upsertConnection(supabase, {
    orgId: conn.orgId,
    libraryItemId: conn.libraryItemId,
    clientId: conn.clientId,
    clientRegistration: conn.clientRegistration,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? conn.refreshToken,
    expiresAt: computeExpiresAt(tokens.expires_in),
    tokenEndpoint: conn.tokenEndpoint,
    scopes: tokens.scope ?? conn.scopes,
    connectedBy: conn.connectedBy,
  });
  return tokens.access_token;
}

export async function resolveAccessToken(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string,
  mcpServerUrl: string
): Promise<string> {
  const connection = await getConnection(supabase, orgId, libraryItemId);
  if (connection === null) {
    throw new Error('OAuth connection not found');
  }
  if (isTokenFresh(connection)) return connection.accessToken;
  return await refreshAndStore(supabase, connection, mcpServerUrl);
}
