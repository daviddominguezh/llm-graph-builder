import { Redis } from '@upstash/redis';

import { hashServerUrl } from '../../cache/serverHash.js';

const SESSION_KEY_PREFIX = 'mcp_session:v1:';
const SECONDS_PER_MINUTE = 60;
const SESSION_TTL_MINUTES = 30;
const SESSION_TTL_SECONDS = SESSION_TTL_MINUTES * SECONDS_PER_MINUTE;

export interface CachedMcpSession {
  sessionId: string;
  serverInfo: { name: string; version: string };
  capturedAt: number;
}

/**
 * Minimal Redis surface this module needs. Allows tests to pass a fake without
 * pulling in the real Upstash client. Production resolves the real Redis via
 * `getRedis()` below; tests inject via the `*WithClient` overloads.
 *
 * `get` returns `string | null` because we only ever store serialized JSON in
 * this cache. The real Upstash client has a generic `get<T>` that's compatible
 * by structural assignability (a function returning `string | null` satisfies
 * the call signature when the caller asks for `string | null`).
 */
export interface SessionCacheRedisLike {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, ttlSeconds: number, value: string) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
}

export function mcpSessionKey(orgId: string, serverHash: string): string {
  return `${SESSION_KEY_PREFIX}${orgId}:${serverHash}`;
}

let cachedRedis: Redis | null = null;

function adaptRedis(client: Redis): SessionCacheRedisLike {
  return {
    get: async (key) => await client.get<string>(key),
    setex: async (key, ttlSeconds, value) => await client.setex(key, ttlSeconds, value),
    del: async (key) => await client.del(key),
  };
}

function getRedis(): SessionCacheRedisLike | null {
  if (cachedRedis === null) {
    const url: string | undefined = process.env.UPSTASH_REDIS_REST_URL;
    const token: string | undefined = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url === undefined || token === undefined) return null;
    cachedRedis = new Redis({ url, token });
  }
  return adaptRedis(cachedRedis);
}

function isCachedSession(value: unknown): value is CachedMcpSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { sessionId?: unknown; capturedAt?: unknown; serverInfo?: unknown };
  if (typeof v.sessionId !== 'string') return false;
  if (typeof v.capturedAt !== 'number') return false;
  if (typeof v.serverInfo !== 'object' || v.serverInfo === null) return false;
  const info = v.serverInfo as { name?: unknown; version?: unknown };
  return typeof info.name === 'string' && typeof info.version === 'string';
}

export async function readCachedSessionWithClient(
  client: SessionCacheRedisLike | null,
  orgId: string,
  serverUrl: string
): Promise<CachedMcpSession | null> {
  if (client === null) return null;
  const hash = await hashServerUrl(serverUrl);
  try {
    const raw = await client.get(mcpSessionKey(orgId, hash));
    if (raw === null) return null;
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return isCachedSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeCachedSessionWithClient(
  client: SessionCacheRedisLike | null,
  orgId: string,
  serverUrl: string,
  session: CachedMcpSession
): Promise<void> {
  if (client === null) return;
  const hash = await hashServerUrl(serverUrl);
  try {
    await client.setex(mcpSessionKey(orgId, hash), SESSION_TTL_SECONDS, JSON.stringify(session));
  } catch {
    // best-effort
  }
}

export async function deleteCachedSessionWithClient(
  client: SessionCacheRedisLike | null,
  orgId: string,
  serverUrl: string
): Promise<void> {
  if (client === null) return;
  const hash = await hashServerUrl(serverUrl);
  try {
    await client.del(mcpSessionKey(orgId, hash));
  } catch {
    // best-effort
  }
}

export async function readCachedSession(orgId: string, serverUrl: string): Promise<CachedMcpSession | null> {
  return await readCachedSessionWithClient(getRedis(), orgId, serverUrl);
}

export async function writeCachedSession(
  orgId: string,
  serverUrl: string,
  session: CachedMcpSession
): Promise<void> {
  await writeCachedSessionWithClient(getRedis(), orgId, serverUrl, session);
}

export async function deleteCachedSession(orgId: string, serverUrl: string): Promise<void> {
  await deleteCachedSessionWithClient(getRedis(), orgId, serverUrl);
}
