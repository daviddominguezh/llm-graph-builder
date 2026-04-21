/**
 * Redis Cloud client (ioredis) for pub/sub, distributed locking, and rate limiting.
 *
 * Upstash remains for simple cache operations (GET/SET).
 * Redis Cloud handles operations that need TCP connections, Lua atomicity, or real-time pub/sub.
 */
import { Redis } from 'ioredis';

/* ─── Constants ─── */

const LOCK_RELEASED = 1;
const MAX_RETRIES = 3;
const NUM_KEYS_ONE = 1;
const ZERO = 0;

/* ─── Lua Scripts ─── */

/** Atomic lock release: DEL only if the stored value matches the token. */
const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

/** Atomic increment + conditional expire (for rate limiting). */
const INCR_WITH_EXPIRE_SCRIPT = `
  local count = redis.call("INCR", KEYS[1])
  if count == 1 then
    redis.call("EXPIRE", KEYS[1], ARGV[1])
  end
  return count
`;

/* ─── Environment ─── */

function getRedisUrl(): string {
  const { env } = process;
  const { REDIS_URL } = env;
  if (REDIS_URL === undefined || REDIS_URL === '') {
    throw new Error('Missing required env var: REDIS_URL');
  }
  return REDIS_URL;
}

/* ─── Singleton ─── */

let instance: Redis | null = null;

export function getRedisCloud(): Redis {
  if (instance === null) {
    instance = new Redis(getRedisUrl(), { maxRetriesPerRequest: MAX_RETRIES, lazyConnect: false });
    instance.on('error', (err: unknown) => {
      process.stdout.write(`[redis-cloud] connection error: ${String(err)}\n`);
    });
  }
  return instance;
}

/* ─── Pub/Sub ─── */

/**
 * Publish a message to a Redis channel.
 */
export async function publishMessage(channel: string, payload: string): Promise<void> {
  try {
    await getRedisCloud().publish(channel, payload);
  } catch (err) {
    process.stdout.write(`[redis-cloud] publish error on "${channel}": ${String(err)}\n`);
  }
}

/**
 * Subscribe to a Redis channel with proper TCP-based subscription.
 * Returns an unsubscribe function that cleanly removes the listener.
 *
 * Note: ioredis requires a dedicated connection for subscribe mode.
 * Each call creates a new subscriber connection.
 */
export function subscribeToChannel(channel: string, callback: (msg: string) => void): () => void {
  const subscriber = new Redis(getRedisUrl(), { maxRetriesPerRequest: MAX_RETRIES });

  void subscriber.subscribe(channel, (err) => {
    if (err !== null) {
      process.stdout.write(`[redis-cloud] subscribe error on "${channel}": ${String(err)}\n`);
      return;
    }
    process.stdout.write(`[redis-cloud] subscribed to "${channel}"\n`);
  });

  subscriber.on('message', (ch: string, message: string) => {
    if (ch === channel) callback(message);
  });

  return () => {
    void subscriber.unsubscribe(channel).then(() => {
      subscriber.disconnect();
      process.stdout.write(`[redis-cloud] unsubscribed from "${channel}"\n`);
    });
  };
}

/* ─── Distributed Locking (atomic via Lua) ─── */

/**
 * Acquire a distributed lock. Returns a token on success, null if already held.
 */
export async function acquireCloudLock(key: string, ttlSeconds: number): Promise<string | null> {
  try {
    const token = crypto.randomUUID();
    const result = await getRedisCloud().set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  } catch (err) {
    process.stdout.write(`[redis-cloud] acquireLock error for "${key}": ${String(err)}\n`);
    return null;
  }
}

/**
 * Release a lock atomically — DEL only if the stored token matches.
 * Uses Lua script to prevent race conditions (unlike Upstash GET+DEL).
 */
export async function releaseCloudLock(key: string, token: string): Promise<void> {
  try {
    const result = await getRedisCloud().eval(RELEASE_LOCK_SCRIPT, NUM_KEYS_ONE, key, token);
    if (result !== LOCK_RELEASED) {
      process.stdout.write(`[redis-cloud] lock "${key}" not released (token mismatch or expired)\n`);
    }
  } catch (err) {
    process.stdout.write(`[redis-cloud] releaseLock error for "${key}": ${String(err)}\n`);
  }
}

/* ─── Rate Limiting (atomic via Lua) ─── */

/**
 * Atomically increment a counter and set TTL on first increment.
 * Single round-trip via Lua (unlike Upstash's separate INCR + EXPIRE).
 */
export async function atomicIncrWithExpire(key: string, ttlSeconds: number): Promise<number> {
  try {
    const result = await getRedisCloud().eval(INCR_WITH_EXPIRE_SCRIPT, NUM_KEYS_ONE, key, String(ttlSeconds));
    return typeof result === 'number' ? result : Number(result);
  } catch (err) {
    process.stdout.write(`[redis-cloud] atomicIncrWithExpire error for "${key}": ${String(err)}\n`);
    return ZERO;
  }
}

/**
 * Read the current counter value without incrementing.
 */
export async function readCounter(key: string): Promise<number> {
  try {
    const value = await getRedisCloud().get(key);
    return value === null ? ZERO : Number(value);
  } catch (err) {
    process.stdout.write(`[redis-cloud] readCounter error for "${key}": ${String(err)}\n`);
    return ZERO;
  }
}

/* ─── Shutdown ─── */

export function shutdownRedisCloud(): void {
  if (instance !== null) {
    instance.disconnect();
    instance = null;
  }
}
