import type { OAuthTokenBundle } from '@daviddh/llm-graph-runner';

import { computeTtlSeconds, isFresh, oauthTokenKey } from '../../cache/oauthTokenCache.js';
import { type CacheWrapper, buildUpstashClient, createCache } from '../../cache/redis.js';
import { refreshWithSingleFlight } from '../../cache/refreshSingleFlight.js';
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
const FALLBACK_EXPIRY_OFFSET_MS = 3_600_000; // 1 hour fallback when expiresAt is unknown

const CALENDAR_PROVIDER_ID = 'calendar';

// Lazy singletons — never initialized at module load time
let cachedCache: CacheWrapper | null = null;
let cachedRedisClient: ReturnType<typeof buildUpstashClient> | null = null;

function getCache(): CacheWrapper {
  if (cachedCache !== null) return cachedCache;
  cachedRedisClient = buildUpstashClient();
  cachedCache = createCache(cachedRedisClient);
  return cachedCache;
}

function getRedisClient(): ReturnType<typeof buildUpstashClient> {
  if (cachedRedisClient !== null) return cachedRedisClient;
  cachedRedisClient = buildUpstashClient();
  cachedCache = createCache(cachedRedisClient);
  return cachedRedisClient;
}

function isTokenFresh(connection: DecryptedGoogleConnection): boolean {
  if (connection.expiresAt === null) return true;
  return connection.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS;
}

function computeExpiresAt(expiresIn: number | undefined): Date | null {
  if (expiresIn === undefined) return null;
  return new Date(Date.now() + expiresIn * MS_PER_SECOND);
}

async function refreshAndStore(
  supabase: SupabaseClient,
  conn: DecryptedGoogleConnection
): Promise<DecryptedGoogleConnection> {
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
  const expiresAt = computeExpiresAt(tokens.expires_in);
  await upsertGoogleConnection(supabase, {
    orgId: conn.orgId,
    clientId: conn.clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? conn.refreshToken,
    expiresAt,
    tokenEndpoint: conn.tokenEndpoint,
    scopes: tokens.scope ?? conn.scopes,
    connectedBy: conn.connectedBy,
  });
  return { ...conn, accessToken: tokens.access_token, expiresAt, scopes: tokens.scope ?? conn.scopes };
}

async function resolveConnection(
  supabase: SupabaseClient,
  orgId: string
): Promise<DecryptedGoogleConnection | null> {
  const connection = await getGoogleConnection(supabase, orgId);
  if (connection === null) return null;
  if (isTokenFresh(connection)) return connection;
  return await refreshAndStore(supabase, connection);
}

function computeBundleExpiresAt(conn: DecryptedGoogleConnection, now: number): number {
  if (conn.expiresAt === null) return now + FALLBACK_EXPIRY_OFFSET_MS;
  return conn.expiresAt.getTime();
}

function computeBundleScopes(conn: DecryptedGoogleConnection): string[] | undefined {
  if (conn.scopes === null) return undefined;
  return conn.scopes.split(' ');
}

function buildBundle(conn: DecryptedGoogleConnection): OAuthTokenBundle {
  const now = Date.now();
  return {
    accessToken: conn.accessToken,
    expiresAt: computeBundleExpiresAt(conn, now),
    scopes: computeBundleScopes(conn),
    tokenIssuedAt: now,
  };
}

function isOAuthTokenBundle(value: unknown): value is OAuthTokenBundle {
  return typeof value === 'object' && value !== null && 'accessToken' in value && 'expiresAt' in value;
}

async function rereadFreshFromDb(supabase: SupabaseClient, orgId: string): Promise<OAuthTokenBundle | null> {
  const conn = await getGoogleConnection(supabase, orgId);
  if (conn === null) return null;
  if (!isTokenFresh(conn)) return null;
  return buildBundle(conn);
}

async function writeBundleToCache(cache: CacheWrapper, key: string, bundle: OAuthTokenBundle): Promise<void> {
  const ttlSeconds = computeTtlSeconds(bundle.expiresAt, Date.now());
  await cache.trySetex(key, ttlSeconds, bundle);
}

async function resolveBundleFromDb(
  supabase: SupabaseClient,
  orgId: string,
  cache: CacheWrapper,
  key: string
): Promise<OAuthTokenBundle | null> {
  const conn = await getGoogleConnection(supabase, orgId);
  if (conn === null) return null;

  if (isTokenFresh(conn)) {
    const bundle = buildBundle(conn);
    await writeBundleToCache(cache, key, bundle);
    return bundle;
  }

  const bundle = await refreshWithSingleFlight({
    redis: getRedisClient(),
    lockKey: `oauth:lock:v1:${orgId}:${CALENDAR_PROVIDER_ID}`,
    reread: async () => await rereadFreshFromDb(supabase, orgId),
    doRefresh: async () => buildBundle(await refreshAndStore(supabase, conn)),
  });

  await writeBundleToCache(cache, key, bundle);
  return bundle;
}

export async function resolveGoogleAccessToken(supabase: SupabaseClient, orgId: string): Promise<string> {
  const connection = await getGoogleConnection(supabase, orgId);
  if (connection === null) throw new Error('Google Calendar not connected for this organization');
  if (isTokenFresh(connection)) return connection.accessToken;
  const refreshed = await refreshAndStore(supabase, connection);
  return refreshed.accessToken;
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
  const conn = await resolveConnection(supabase, orgId);
  if (conn === null) return null;
  return conn.accessToken;
}

/**
 * Like resolveGoogleAccessTokenOptional, but returns the full OAuthTokenBundle
 * (accessToken + expiresAt + scopes + tokenIssuedAt) instead of just the access
 * token string. Cache-first: reads from Redis, falls back to DB, uses single-flight
 * for stale token refresh. Used by the OAuth payload resolver.
 */
export async function resolveGoogleTokenBundle(
  supabase: SupabaseClient,
  orgId: string
): Promise<OAuthTokenBundle | null> {
  const cache = getCache();
  const key = oauthTokenKey(orgId, CALENDAR_PROVIDER_ID);

  const cached = await cache.tryGet(key);
  if (isOAuthTokenBundle(cached) && isFresh(cached, Date.now())) {
    return cached;
  }

  return await resolveBundleFromDb(supabase, orgId, cache, key);
}
