/**
 * 3-tier credential cache: in-memory -> Redis -> DB.
 *
 * Reduces database calls for credential lookups that rarely change.
 * Default TTL: 3 hours (10 800 seconds).
 *
 * TODO: When credentials change (via admin UI), invalidate both caches:
 * call `invalidateCredentialCache(key)` which deletes from in-memory Map and Redis.
 */

import { deleteKey, readRedis, setWithTTL } from './redis.js';

/* ─── Constants ─── */

const DEFAULT_TTL_SECONDS = 10_800; // 3 hours
const MS_PER_SECOND = 1_000;

/* ─── In-memory LRU cache ─── */

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

/* ─── Read from in-memory cache ─── */

function readMemory(key: string): unknown {
  const entry = memoryCache.get(key);
  if (entry === undefined) return null;

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.data;
}

/* ─── Write to in-memory cache ─── */

function writeMemory(key: string, data: unknown, ttlSeconds: number): void {
  const expiresAt = Date.now() + ttlSeconds * MS_PER_SECOND;
  memoryCache.set(key, { data, expiresAt });
}

/* ─── Public API ─── */

/**
 * Look up a cached credential. Returns the cached value or null.
 * The caller is responsible for verifying the returned shape matches expectations.
 */
export async function getCachedCredential(key: string): Promise<unknown> {
  // Tier 1: in-memory
  const memResult = readMemory(key);
  if (memResult !== null) return memResult;

  // Tier 2: Redis
  const redisResult = await readRedis<unknown>(key);
  if (redisResult !== null) {
    // Backfill in-memory cache
    writeMemory(key, redisResult, DEFAULT_TTL_SECONDS);
    return redisResult;
  }

  // Tier 3: caller must go to DB
  return null;
}

export async function setCachedCredential(
  key: string,
  data: unknown,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  writeMemory(key, data, ttlSeconds);
  await setWithTTL(key, data, ttlSeconds);
}

export async function invalidateCredentialCache(key: string): Promise<void> {
  memoryCache.delete(key);
  await deleteKey(key);
}
