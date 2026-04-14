/**
 * Redis-based sliding window rate limiter.
 *
 * Uses atomic Lua script (INCR + conditional EXPIRE) via Redis Cloud.
 * Single round-trip per check — no race between INCR and EXPIRE.
 */
import { setTimeout as sleepMs } from 'node:timers/promises';

import { atomicIncrWithExpire, readCounter } from './redisCloud.js';

/* ─── Constants ─── */

const MS_TO_SECONDS = 1_000;

/**
 * Check whether the given key is under the rate limit.
 *
 * @param key - Rate limit key (e.g. `ratelimit:ig:{igUserId}`)
 * @param maxRequests - Maximum number of requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 * @returns `true` if the request is allowed, `false` if rate limited
 */
export async function checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  const ttlSeconds = Math.ceil(windowMs / MS_TO_SECONDS);
  const count = await atomicIncrWithExpire(key, ttlSeconds);
  return count <= maxRequests;
}

/**
 * If rate limited, wait until the current window expires then return.
 * Reads the counter first without incrementing to avoid consuming a slot.
 * If under the limit, increments and returns immediately.
 */
export async function waitForRateLimit(key: string, maxRequests: number, windowMs: number): Promise<void> {
  const current = await readCounter(key);

  if (current < maxRequests) {
    const ttlSeconds = Math.ceil(windowMs / MS_TO_SECONDS);
    await atomicIncrWithExpire(key, ttlSeconds);
    return;
  }

  process.stdout.write(`[rate-limiter] rate limited on ${key}, waiting ${String(windowMs)}ms\n`);
  await sleepMs(windowMs);
}
