import { setTimeout as sleepMs } from 'node:timers/promises';

import { Redis } from '@upstash/redis';

/* ─── Constants ─── */

const LOCK_POLL_INTERVAL_MS = 500;
const DEADLINE_EXPIRED = 0;

/* ─── Environment ─── */

function getEnvValue(name: string): string | undefined {
  return process.env[name];
}

function getRequiredEnv(name: string): string {
  const value = getEnvValue(name);
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/* ─── Singleton ─── */

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  redisInstance ??= new Redis({
    url: getRequiredEnv('UPSTASH_REDIS_REST_URL'),
    token: getRequiredEnv('UPSTASH_REDIS_REST_TOKEN'),
  });
  return redisInstance;
}

/* ─── Channel helpers ─── */

export function buildRedisChannel(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export async function publishToTenant(tenantId: string, payload: unknown): Promise<void> {
  const redis = getRedis();
  const channel = buildRedisChannel(tenantId);
  await redis.publish(channel, JSON.stringify(payload));
}

/* ─── Generic read / write ─── */

export async function readRedis<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const data = await redis.get<T>(key);
  return data ?? null;
}

export async function writeRedis(key: string, data: unknown): Promise<void> {
  const redis = getRedis();
  await redis.set(key, JSON.stringify(data));
}

export async function setWithTTL(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  await redis.set(key, JSON.stringify(data), { ex: ttlSeconds });
}

export async function deleteKey(key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(key);
}

/* ─── Distributed locking (Fix 6, 21) ─── */

/**
 * Acquire a distributed lock using SET NX (atomic).
 * Returns `true` if the lock was acquired, `false` if already held.
 */
export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(key, 'locked', { nx: true, ex: ttlSeconds });
  return result === 'OK';
}

/**
 * Release a distributed lock.
 */
export async function releaseLock(key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(key);
}

/* ─── Lock polling helpers ─── */

function getRemainingTime(deadline: number): number {
  return deadline - Date.now();
}

async function pollUntilAcquired(key: string, ttlSeconds: number, deadline: number): Promise<boolean> {
  const remaining = getRemainingTime(deadline);
  if (remaining <= DEADLINE_EXPIRED) return false;

  const acquired = await acquireLock(key, ttlSeconds);
  if (acquired) return true;

  const delay = Math.min(LOCK_POLL_INTERVAL_MS, remaining);
  await sleepMs(delay);

  return await pollUntilAcquired(key, ttlSeconds, deadline);
}

/**
 * Wait until the lock can be acquired, polling every 500ms.
 *
 * 1. Try to acquire immediately.
 * 2. If another process holds it, poll until it is released, then acquire.
 * 3. Returns `false` if `timeoutMs` expires before the lock is acquired.
 */
export async function waitForLock(key: string, ttlSeconds: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return await pollUntilAcquired(key, ttlSeconds, deadline);
}

/* ─── Subscribe ─── */

/**
 * Subscribe to a Redis pub/sub channel.
 *
 * Uses @upstash/redis's built-in subscribe (HTTP long-polling).
 * Returns an unsubscribe function (best-effort cleanup — Upstash does not
 * support removing specific listeners, matching closer-back's pattern).
 *
 * The shared namespace subscription model (one subscription per tenant,
 * fanned out to N sockets) is managed by the Socket.io subscription layer,
 * not here. This is the low-level Redis primitive.
 */
export function subscribe(channel: string, callback: (msg: string) => void): () => void {
  const redis = getRedis();
  const subscriber = redis.subscribe<string>(channel);

  subscriber.on('message', (message) => {
    if (typeof message === 'string') {
      callback(message);
    } else {
      callback(JSON.stringify(message));
    }
  });

  // Best-effort cleanup — Upstash does not provide a way to unsubscribe
  // from specific channels. Same limitation as closer-back.
  return () => {
    process.stdout.write(`[redis] cleanup requested for channel "${channel}" (best-effort)\n`);
  };
}
