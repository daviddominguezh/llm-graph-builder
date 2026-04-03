/**
 * Redis-based sliding window rate limiter.
 *
 * Uses the INCR + EXPIRE pattern for simple, atomic rate limiting.
 * Each key represents a time window; the counter resets when the key expires.
 */

import { setTimeout as sleepMs } from 'node:timers/promises';

import { getRedis } from './redis.js';

/* ─── Constants ─── */

const MS_TO_SECONDS = 1_000;

/* ─── Rate limit check ─── */

function parseCount(result: unknown): number {
  if (typeof result === 'number') return result;
  return Number(result);
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
  const redis = getRedis();
  const ttlSeconds = Math.ceil(windowMs / MS_TO_SECONDS);

  const pipeline = redis.multi();
  pipeline.incr(key);
  pipeline.expire(key, ttlSeconds);
  const results = await pipeline.exec();

  const [rawCount] = results;
  const count = parseCount(rawCount);
  return count <= maxRequests;
}

/**
 * If rate limited, wait until the current window expires then return.
 * If under the limit, returns immediately.
 */
export async function waitForRateLimit(key: string, maxRequests: number, windowMs: number): Promise<void> {
  const allowed = await checkRateLimit(key, maxRequests, windowMs);
  if (allowed) return;

  process.stdout.write(`[rate-limiter] rate limited on ${key}, waiting ${String(windowMs)}ms\n`);
  await sleepMs(windowMs);
}
