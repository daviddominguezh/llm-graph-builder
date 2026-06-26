import type { SupabaseClient } from '@supabase/supabase-js';

import { type CacheWrapper, buildUpstashClient, createCache } from '../cache/redis.js';
import { hasImageChunks } from '../db/queries/ragChunksQueries.js';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TTL_SECONDS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;

function log(msg: string): void {
  process.stdout.write(`[ragCache] ${msg}\n`);
}

let cachedCache: CacheWrapper | null = null;
let cacheInitFailed = false;

function tryGetCache(): CacheWrapper | null {
  if (cachedCache !== null) return cachedCache;
  if (cacheInitFailed) return null;
  try {
    cachedCache = createCache(buildUpstashClient());
    return cachedCache;
  } catch {
    cacheInitFailed = true;
    return null;
  }
}

function cacheKey(storeId: string, tenantId: string): string {
  return `rag:has_image:${storeId}:${tenantId}`;
}

export async function cachedHasImageChunks(
  supabase: SupabaseClient,
  storeId: string,
  tenantId: string
): Promise<boolean> {
  const key = cacheKey(storeId, tenantId);
  const cache = tryGetCache();
  if (cache !== null) {
    const cached = await cache.tryGet(key);
    if (cached === true || cached === false) {
      log(`hit key=${key} value=${String(cached)}`);
      return cached;
    }
    log(`miss key=${key}`);
  }
  const { result } = await hasImageChunks(supabase, storeId, tenantId);
  if (cache !== null) {
    await cache.trySetex(key, TTL_SECONDS, result);
    log(`set key=${key} value=${String(result)} ttl=${String(TTL_SECONDS)}s`);
  }
  return result;
}

export async function setImagePresenceTrue(storeId: string, tenantId: string): Promise<void> {
  const key = cacheKey(storeId, tenantId);
  const cache = tryGetCache();
  if (cache === null) {
    log(`set key=${key} skipped (no cache)`);
    return;
  }
  await cache.trySetex(key, TTL_SECONDS, true);
  log(`set key=${key} value=true ttl=${String(TTL_SECONDS)}s`);
}

export async function invalidateImagePresence(storeId: string, tenantId: string): Promise<void> {
  const key = cacheKey(storeId, tenantId);
  const cache = tryGetCache();
  if (cache === null) return;
  await cache.tryDel(key);
  log(`del key=${key}`);
}
