import type { SupabaseClient } from '@supabase/supabase-js';

import { type CacheWrapper, buildUpstashClient, createCache } from '../cache/redis.js';
import { hasImageChunks } from '../db/queries/ragChunksQueries.js';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TTL_SECONDS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;

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
  const cache = tryGetCache();
  if (cache !== null) {
    const cached = await cache.tryGet(cacheKey(storeId, tenantId));
    if (cached === true || cached === false) return cached;
  }
  const { result } = await hasImageChunks(supabase, storeId, tenantId);
  if (cache !== null) {
    await cache.trySetex(cacheKey(storeId, tenantId), TTL_SECONDS, result);
  }
  return result;
}

export async function setImagePresenceTrue(storeId: string, tenantId: string): Promise<void> {
  const cache = tryGetCache();
  if (cache === null) return;
  await cache.trySetex(cacheKey(storeId, tenantId), TTL_SECONDS, true);
}

export async function invalidateImagePresence(storeId: string, tenantId: string): Promise<void> {
  const cache = tryGetCache();
  if (cache === null) return;
  await cache.tryDel(cacheKey(storeId, tenantId));
}
