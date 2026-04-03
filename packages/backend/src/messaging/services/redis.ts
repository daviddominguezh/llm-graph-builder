import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleepMs } from 'node:timers/promises';

import { REDIS_KEYS, buildRedisKey } from '../types/redisKeys.js';

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
  return buildRedisKey(REDIS_KEYS.TENANT_CHANNEL, tenantId);
}

export async function publishToTenant(tenantId: string, payload: unknown): Promise<void> {
  try {
    const redis = getRedis();
    const channel = buildRedisChannel(tenantId);
    await redis.publish(channel, JSON.stringify(payload));
  } catch (err) {
    process.stdout.write(`[redis] publishToTenant error: ${String(err)}\n`);
  }
}

/* ─── Generic read / write ─── */

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

/* ─── Distributed locking (R2-4: token-based release) ─── */

/**
 * Acquire a distributed lock using SET NX (atomic).
 * Stores a unique token so only the owner can release it.
 * Returns the token string on success, `null` if already held.
 */
export async function acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
  try {
    const redis = getRedis();
    const token = randomUUID();
    const result = await redis.set(key, token, { nx: true, ex: ttlSeconds });
    return result === 'OK' ? token : null;
  } catch (err) {
    process.stdout.write(`[redis] acquireLock error for key "${key}": ${String(err)}\n`);
    return null;
  }
}

/**
 * Release a distributed lock — only if the stored token matches.
 * Uses GET + compare + DEL as best-effort (Upstash REST doesn't support EVAL).
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  try {
    const redis = getRedis();
    const current = await redis.get<string>(key);
    if (current !== token) return;
    await redis.del(key);
  } catch (err) {
    process.stdout.write(`[redis] releaseLock error for key "${key}": ${String(err)}\n`);
  }
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
 *
 * 1. Try to acquire immediately.
 * 2. If another process holds it, poll until it is released, then acquire.
 * 3. Returns the lock token string, or `null` if `timeoutMs` expires.
 */
export async function waitForLock(
  key: string,
  ttlSeconds: number,
  timeoutMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  return await pollUntilAcquired(key, ttlSeconds, deadline);
}

/* ─── Subscribe ─── */

interface UpstashMessage {
  channel?: string;
  message?: string;
}

function isUpstashMessage(value: unknown): value is UpstashMessage {
  return typeof value === 'object' && value !== null;
}

/**
 * Subscribe to a Redis pub/sub channel.
 *
 * Uses @upstash/redis's built-in subscribe (HTTP long-polling).
 * Extracts the inner `message` field if present (matches closer-back pattern).
 * Returns an unsubscribe function (best-effort cleanup).
 */
export function subscribe(channel: string, callback: (msg: string) => void): () => void {
  const redis = getRedis();
  const subscriber = redis.subscribe<string>(channel);

  subscriber.on('message', (message: unknown) => {
    if (isUpstashMessage(message)) {
      if (message.channel !== undefined && message.channel !== channel) return;

      if (message.message !== undefined) {
        callback(message.message);
        return;
      }
    }

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
