import type { OAuthTokenBundle } from '@daviddh/llm-graph-runner';

import { computeTtlSeconds, isFresh, oauthTokenKey } from '../../cache/oauthTokenCache.js';
import { type CacheWrapper, buildUpstashClient, createCache } from '../../cache/redis.js';
import { refreshWithSingleFlight } from '../../cache/refreshSingleFlight.js';
import {
  type DecryptedConnection,
  getConnection,
  upsertConnection,
} from '../../db/queries/oauthConnectionOperations.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { recordMetric } from '../../observability/metrics.js';
import { parseClientRegistration } from '../../routes/oauth/oauthHelpers.js';
import { refreshAccessToken } from './tokenExchange.js';

const EXPIRY_BUFFER_MINUTES = 5;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_SECOND = 1_000;
const EXPIRY_BUFFER_MS = EXPIRY_BUFFER_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
const FALLBACK_EXPIRY_OFFSET_MS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

let cachedCache: CacheWrapper | null = null;
let cachedRedisClient: ReturnType<typeof buildUpstashClient> | null = null;

function onMcpCacheUnavailable(): void {
  recordMetric('cache_unavailable', { cache: 'oauth_token', provider: 'mcp' });
}

function getCache(): CacheWrapper {
  if (cachedCache !== null) return cachedCache;
  cachedRedisClient = buildUpstashClient();
  cachedCache = createCache(cachedRedisClient, { onUnavailable: onMcpCacheUnavailable });
  return cachedCache;
}

function getRedisClient(): ReturnType<typeof buildUpstashClient> {
  if (cachedRedisClient !== null) return cachedRedisClient;
  cachedRedisClient = buildUpstashClient();
  cachedCache = createCache(cachedRedisClient, { onUnavailable: onMcpCacheUnavailable });
  return cachedRedisClient;
}

export function mcpOAuthProviderId(libraryItemId: string): string {
  return `mcp:${libraryItemId}`;
}

function isTokenFresh(connection: DecryptedConnection): boolean {
  if (connection.expiresAt === null) return true;
  return connection.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS;
}

function computeExpiresAt(expiresIn: number | undefined): Date | null {
  if (expiresIn === undefined) return null;
  return new Date(Date.now() + expiresIn * MS_PER_SECOND);
}

function computeBundleExpiresAt(conn: DecryptedConnection, now: number): number {
  if (conn.expiresAt === null) return now + FALLBACK_EXPIRY_OFFSET_MS;
  return conn.expiresAt.getTime();
}

function computeBundleScopes(conn: DecryptedConnection): string[] | undefined {
  if (conn.scopes === null) return undefined;
  return conn.scopes.split(' ');
}

function buildBundle(conn: DecryptedConnection): OAuthTokenBundle {
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

async function refreshAndStore(
  supabase: SupabaseClient,
  conn: DecryptedConnection,
  mcpServerUrl: string
): Promise<DecryptedConnection> {
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
  return { ...conn, accessToken: tokens.access_token, expiresAt: computeExpiresAt(tokens.expires_in) };
}

async function rereadFreshFromDb(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<OAuthTokenBundle | null> {
  const conn = await getConnection(supabase, orgId, libraryItemId);
  if (conn === null) return null;
  if (!isTokenFresh(conn)) return null;
  return buildBundle(conn);
}

async function writeBundleToCache(cache: CacheWrapper, key: string, bundle: OAuthTokenBundle): Promise<void> {
  const ttlSeconds = computeTtlSeconds(bundle.expiresAt, Date.now());
  await cache.trySetex(key, ttlSeconds, bundle);
}

interface ResolveBundleFromDbArgs {
  supabase: SupabaseClient;
  orgId: string;
  libraryItemId: string;
  mcpServerUrl: string;
  cache: CacheWrapper;
  key: string;
}

async function resolveBundleFromDb(args: ResolveBundleFromDbArgs): Promise<OAuthTokenBundle> {
  const { supabase, orgId, libraryItemId, mcpServerUrl, cache, key } = args;
  const conn = await getConnection(supabase, orgId, libraryItemId);
  if (conn === null) throw new Error('OAuth connection not found');
  if (isTokenFresh(conn)) {
    const bundle = buildBundle(conn);
    await writeBundleToCache(cache, key, bundle);
    return bundle;
  }
  const lockKey = `oauth:lock:v1:${orgId}:${mcpOAuthProviderId(libraryItemId)}`;
  const bundle = await refreshWithSingleFlight({
    redis: getRedisClient(),
    lockKey,
    reread: async () => await rereadFreshFromDb(supabase, orgId, libraryItemId),
    doRefresh: async () => buildBundle(await refreshAndStore(supabase, conn, mcpServerUrl)),
  });
  await writeBundleToCache(cache, key, bundle);
  return bundle;
}

export async function resolveAccessToken(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string,
  mcpServerUrl: string
): Promise<string> {
  const cache = getCache();
  const key = oauthTokenKey(orgId, mcpOAuthProviderId(libraryItemId));
  const cached = await cache.tryGet(key);
  if (isOAuthTokenBundle(cached) && isFresh(cached, Date.now())) {
    recordMetric('cache_hit', { cache: 'oauth_token', provider: 'mcp' });
    return cached.accessToken;
  }
  recordMetric('cache_miss', { cache: 'oauth_token', provider: 'mcp' });
  const bundle = await resolveBundleFromDb({
    supabase,
    orgId,
    libraryItemId,
    mcpServerUrl,
    cache,
    key,
  });
  return bundle.accessToken;
}
