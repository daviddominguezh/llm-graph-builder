import { Redis } from '@upstash/redis';

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export interface CacheWrapperOptions {
  onUnavailable?: () => void;
}

export interface TryDelResult {
  ok: boolean;
  retries: number;
}

export interface CacheWrapper {
  tryGet<T>(key: string): Promise<T | null>;
  trySetex(key: string, ttlSeconds: number, value: unknown): Promise<void>;
  trySet(key: string, value: unknown): Promise<void>;
  tryDel(key: string): Promise<TryDelResult>;
}

const DEL_RETRIES = 3;
const DEL_BACKOFF_MS = 100;
const ZERO_TTL = 0;
const FIRST_INDEX = 0;

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function tryDelWithRetries(client: RedisLikeClient, key: string): Promise<TryDelResult> {
  for (let i = FIRST_INDEX; i < DEL_RETRIES; i += 1) {
    try {
      await client.del(key);
      return { ok: true, retries: i };
    } catch {
      if (i === DEL_RETRIES - 1) return { ok: false, retries: i };
      await delay(DEL_BACKOFF_MS * (i + 1));
    }
  }
  return { ok: false, retries: DEL_RETRIES };
}

function makeTryGet(client: RedisLikeClient, opts: CacheWrapperOptions): CacheWrapper['tryGet'] {
  return async <T>(key: string): Promise<T | null> => {
    try {
      const raw = await client.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      opts.onUnavailable?.();
      return null;
    }
  };
}

function makeTrySetex(client: RedisLikeClient, opts: CacheWrapperOptions): CacheWrapper['trySetex'] {
  return async (key, ttlSeconds, value) => {
    if (ttlSeconds <= ZERO_TTL) return;
    try {
      await client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      opts.onUnavailable?.();
    }
  };
}

function makeTrySet(client: RedisLikeClient, opts: CacheWrapperOptions): CacheWrapper['trySet'] {
  return async (key, value) => {
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
    tryDel: (key) => tryDelWithRetries(client, key),
  };
}

export function buildUpstashClient(): Redis {
  const url = process.env['UPSTASH_REDIS_REST_URL'];
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'];
  if (url === undefined || token === undefined) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  }
  return new Redis({ url, token });
}
