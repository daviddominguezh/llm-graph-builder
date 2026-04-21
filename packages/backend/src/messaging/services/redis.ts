/**
 * Redis service — dual client architecture:
 *
 * - **Upstash** (@upstash/redis, HTTP REST): simple cache operations (GET/SET/DEL)
 * - **Redis Cloud** (ioredis, TCP): pub/sub, distributed locking, rate limiting
 *
 * Consumers import from this file — the underlying client is an implementation detail.
 */
import { Redis as UpstashRedis } from '@upstash/redis';
import { setTimeout as sleepMs } from 'node:timers/promises';

import { REDIS_KEYS, buildRedisKey } from '../types/redisKeys.js';
import { acquireCloudLock, publishMessage, releaseCloudLock, subscribeToChannel } from './redisCloud.js';

/* ─── Constants ─── */

const LOCK_POLL_INTERVAL_MS = 500;
const DEADLINE_EXPIRED = 0;

/* ─── Environment ─── */

function getRequiredEnv(name: string): string {
  const { env } = process;
  const value: string | undefined = env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/* ─── Upstash singleton (cache only) ─── */

let upstashInstance: UpstashRedis | null = null;

export function getRedis(): UpstashRedis {
  upstashInstance ??= new UpstashRedis({
    url: getRequiredEnv('UPSTASH_REDIS_REST_URL'),
    token: getRequiredEnv('UPSTASH_REDIS_REST_TOKEN'),
  });
  return upstashInstance;
}

/* ─── Channel helpers (Redis Cloud) ─── */

export function buildRedisChannel(tenantId: string): string {
  return buildRedisKey(REDIS_KEYS.TENANT_CHANNEL, tenantId);
}

export async function publishToTenant(tenantId: string, payload: unknown): Promise<void> {
  const channel = buildRedisChannel(tenantId);
  await publishMessage(channel, JSON.stringify(payload));
}

/* ─── Generic read / write (Upstash cache) ─── */

export async function readRedis<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const data = await redis.get<T>(key);
    return data ?? null;
  } catch (err) {
    process.stdout.write(`[redis] readRedis error for key "${key}": ${String(err)}\n`);
    return null;
  }
}

export async function writeRedis(key: string, data: unknown): Promise<void> {
  if (data === null || data === undefined) return;
  try {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(data));
  } catch (err) {
    process.stdout.write(`[redis] writeRedis error for key "${key}": ${String(err)}\n`);
  }
}

export async function setWithTTL(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  if (data === null || data === undefined) return;
  try {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(data), { ex: ttlSeconds });
  } catch (err) {
    process.stdout.write(`[redis] setWithTTL error for key "${key}": ${String(err)}\n`);
  }
}

export async function deleteKey(key: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(key);
  } catch (err) {
    process.stdout.write(`[redis] deleteKey error for key "${key}": ${String(err)}\n`);
  }
}

/* ─── Distributed locking (Redis Cloud — atomic Lua) ─── */

/**
 * Acquire a distributed lock using SET NX (atomic).
 * Stores a unique token so only the owner can release it.
 * Returns the token string on success, `null` if already held.
 */
export async function acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
  return await acquireCloudLock(key, ttlSeconds);
}

/**
 * Release a distributed lock atomically — DEL only if stored token matches.
 * Uses Lua script on Redis Cloud (safe, unlike Upstash GET+DEL race).
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  await releaseCloudLock(key, token);
}

/* ─── Lock polling helpers ─── */

function getRemainingTime(deadline: number): number {
  return deadline - Date.now();
}

async function pollUntilAcquired(key: string, ttlSeconds: number, deadline: number): Promise<string | null> {
  if (getRemainingTime(deadline) <= DEADLINE_EXPIRED) return null;

  const token = await acquireLock(key, ttlSeconds);
  if (token !== null) return token;

  const remaining = getRemainingTime(deadline);
  if (remaining <= DEADLINE_EXPIRED) return null;

  const delay = Math.min(LOCK_POLL_INTERVAL_MS, remaining);
  await sleepMs(delay);
  return await pollUntilAcquired(key, ttlSeconds, deadline);
}

/**
 * Wait until the lock can be acquired, polling every 500ms.
 */
export async function waitForLock(
  key: string,
  ttlSeconds: number,
  timeoutMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  return await pollUntilAcquired(key, ttlSeconds, deadline);
}

/* ─── Subscribe (Redis Cloud — proper TCP pub/sub) ─── */

/**
 * Subscribe to a Redis pub/sub channel.
 * Uses ioredis with dedicated TCP subscriber connection.
 * Returns a proper unsubscribe function (cleans up connection).
 */
export function subscribe(channel: string, callback: (msg: string) => void): () => void {
  return subscribeToChannel(channel, callback);
}
