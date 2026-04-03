/**
 * Redis-based sliding window rate limiter.
 *
 * Uses INCR + conditional EXPIRE pattern for simple rate limiting.
 * Each key represents a time window; the counter resets when the key expires.
 *
 * Upstash pipeline.exec() returns values directly (not [error, result] tuples).
 */
import { setTimeout as sleepMs } from 'node:timers/promises';

import { getRedis } from './redis.js';

/* ─── Constants ─── */

const MS_TO_SECONDS = 1_000;
const NEW_KEY_COUNT = 1;

/* ─── Rate limit check ─── */

function parseCount(result: unknown): number {
  if (typeof result === 'number') return result;
  return Number(result);
}

/**
 * Read the current count without incrementing.
 * Returns 0 if the key does not exist.
 */
async function readCurrentCount(key: string): Promise<number> {
  const redis = getRedis();
  const raw = await redis.get<number>(key);
  return raw ?? 0;
}

/**
 * Increment the counter and set TTL only when the key is new (count === 1).
 */
async function incrementAndExpire(key: string, ttlSeconds: number): Promise<number> {
  const redis = getRedis();
  const count = parseCount(await redis.incr(key));

  if (count === NEW_KEY_COUNT) {
    await redis.expire(key, ttlSeconds);
  }

  return count;
}

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
  const count = await incrementAndExpire(key, ttlSeconds);
  return count <= maxRequests;
}

/**
 * If rate limited, wait until the current window expires then return.
 * Reads the counter first without incrementing to avoid consuming a slot.
 * If under the limit, increments and returns immediately.
 */
export async function waitForRateLimit(key: string, maxRequests: number, windowMs: number): Promise<void> {
  const current = await readCurrentCount(key);

  if (current < maxRequests) {
    const ttlSeconds = Math.ceil(windowMs / MS_TO_SECONDS);
    await incrementAndExpire(key, ttlSeconds);
    return;
  }

  process.stdout.write(`[rate-limiter] rate limited on ${key}, waiting ${String(windowMs)}ms\n`);
  await sleepMs(windowMs);
}
