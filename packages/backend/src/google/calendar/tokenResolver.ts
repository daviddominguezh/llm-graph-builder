import {
  type DecryptedGoogleConnection,
  getGoogleConnection,
  upsertGoogleConnection,
} from '../../db/queries/googleOauthConnectionOperations.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { loadGoogleOAuthConfig } from './oauthConfig.js';
import { refreshGoogleAccessToken } from './tokenExchange.js';

const EXPIRY_BUFFER_MINUTES = 5;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1_000;
const EXPIRY_BUFFER_MS = EXPIRY_BUFFER_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

function isTokenFresh(connection: DecryptedGoogleConnection): boolean {
  if (connection.expiresAt === null) return true;
  return connection.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS;
}

function computeExpiresAt(expiresIn: number | undefined): Date | null {
  if (expiresIn === undefined) return null;
  return new Date(Date.now() + expiresIn * MS_PER_SECOND);
}

async function refreshAndStore(supabase: SupabaseClient, conn: DecryptedGoogleConnection): Promise<string> {
  if (conn.refreshToken === null) {
    throw new Error('Google Calendar connection expired and no refresh token — reconnect needed');
  }
  const cfg = loadGoogleOAuthConfig();
  const tokens = await refreshGoogleAccessToken({
    tokenEndpoint: conn.tokenEndpoint,
    refreshToken: conn.refreshToken,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
  });
  await upsertGoogleConnection(supabase, {
    orgId: conn.orgId,
    clientId: conn.clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? conn.refreshToken,
    expiresAt: computeExpiresAt(tokens.expires_in),
    tokenEndpoint: conn.tokenEndpoint,
    scopes: tokens.scope ?? conn.scopes,
    connectedBy: conn.connectedBy,
  });
  return tokens.access_token;
}

export async function resolveGoogleAccessToken(supabase: SupabaseClient, orgId: string): Promise<string> {
  const connection = await getGoogleConnection(supabase, orgId);
  if (connection === null) throw new Error('Google Calendar not connected for this organization');
  if (isTokenFresh(connection)) return connection.accessToken;
  return await refreshAndStore(supabase, connection);
}

/**
 * Like resolveGoogleAccessToken, but returns null when the org has no
 * Google Calendar connection (instead of throwing). Use when preparing
 * the edge function payload — we want to skip calendar tools silently
 * for orgs that haven't connected a Google account.
 */
export async function resolveGoogleAccessTokenOptional(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  const connection = await getGoogleConnection(supabase, orgId);
  if (connection === null) return null;
  if (isTokenFresh(connection)) return connection.accessToken;
  return await refreshAndStore(supabase, connection);
}
