import { Redis } from '@upstash/redis';
import { setTimeout as sleepMs } from 'node:timers/promises';

export interface RedisLikeClient {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, ttlSeconds: number, value: string) => Promise<unknown>;
  set: (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
}

export interface CacheWrapperOptions {
  onUnavailable?: () => void;
}

export interface TryDelResult {
  ok: boolean;
  retries: number;
}

export interface CacheWrapper {
  tryGet: (key: string) => Promise<unknown>;
  trySetex: (key: string, ttlSeconds: number, value: unknown) => Promise<void>;
  trySet: (key: string, value: unknown) => Promise<void>;
  tryDel: (key: string) => Promise<TryDelResult>;
}

const DEL_RETRIES = 3;
const DEL_BACKOFF_MS = 100;
const ZERO_TTL = 0;
const FIRST_INDEX = 0;
const NEXT_OFFSET = 1;

async function attemptDel(client: RedisLikeClient, key: string, attempt: number): Promise<TryDelResult> {
  try {
    await client.del(key);
    return { ok: true, retries: attempt };
  } catch {
    if (attempt >= DEL_RETRIES - NEXT_OFFSET) return { ok: false, retries: attempt };
    await sleepMs(DEL_BACKOFF_MS * (attempt + NEXT_OFFSET));
    return await attemptDel(client, key, attempt + NEXT_OFFSET);
  }
}

async function tryDelWithRetries(client: RedisLikeClient, key: string): Promise<TryDelResult> {
  return await attemptDel(client, key, FIRST_INDEX);
}

function makeTryGet(client: RedisLikeClient, opts: CacheWrapperOptions): CacheWrapper['tryGet'] {
  return async (key: string): Promise<unknown> => {
    try {
      const raw = await client.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as unknown;
    } catch {
      opts.onUnavailable?.();
      return null;
    }
  };
}

function makeTrySetex(client: RedisLikeClient, opts: CacheWrapperOptions): CacheWrapper['trySetex'] {
  return async (key: string, ttlSeconds: number, value: unknown): Promise<void> => {
    if (ttlSeconds <= ZERO_TTL) return;
    try {
      await client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      opts.onUnavailable?.();
    }
  };
}

function makeTrySet(client: RedisLikeClient, opts: CacheWrapperOptions): CacheWrapper['trySet'] {
  return async (key: string, value: unknown): Promise<void> => {
    try {
      await client.set(key, JSON.stringify(value));
    } catch {
      opts.onUnavailable?.();
    }
  };
}

export function createCache(client: RedisLikeClient, opts: CacheWrapperOptions = {}): CacheWrapper {
  return {
    tryGet: makeTryGet(client, opts),
    trySetex: makeTrySetex(client, opts),
    trySet: makeTrySet(client, opts),
    tryDel: async (key) => await tryDelWithRetries(client, key),
  };
}

export function buildUpstashClient(): RedisLikeClient {
  const url: string | undefined = process.env.UPSTASH_REDIS_REST_URL;
  const token: string | undefined = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url === undefined || token === undefined) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  }
  // Upstash's Redis class has the same method shape as RedisLikeClient (get, setex,
  // set, del). The structural typing should align — but if TS is strict about the
  // narrower return types of the library's signatures, we wrap in a thin adapter.
  const redis = new Redis({ url, token });
  return adaptRedisClient(redis);
}

function adaptRedisClient(redis: Redis): RedisLikeClient {
  return {
    get: async (key) => await redis.get(key),
    setex: async (key, ttl, value) => await redis.setex(key, ttl, value),
    set: async (key, value, opts) => {
      if (opts === undefined) return await redis.set(key, value);
      // Upstash SETNX is expressed via { nx: true } + { ex: <seconds> }
      if (opts.nx === true && opts.ex !== undefined) {
        return await redis.set(key, value, { nx: true, ex: opts.ex });
      }
      if (opts.nx === true) return await redis.set(key, value, { nx: true });
      if (opts.ex !== undefined) return await redis.set(key, value, { ex: opts.ex });
      return await redis.set(key, value);
    },
    del: async (...keys) => await redis.del(...keys),
  };
}
