import { describe, expect, it, jest } from '@jest/globals';

import { type RedisLikeClient, createCache } from '../redis.js';

/* ─── Types ─── */

interface FakeClient extends RedisLikeClient {
  get: jest.Mock<(key: string) => Promise<string | null>>;
  setex: jest.Mock<(key: string, ttl: number, value: string) => Promise<unknown>>;
  set: jest.Mock<(key: string, value: string) => Promise<unknown>>;
  del: jest.Mock<(...keys: string[]) => Promise<number>>;
}

/* ─── Constants ─── */

const CACHE_KEY = 'k';
const TTL_SKIP = 0;
const DEL_SUCCESS = 1;
const FIRST_CALL = 1;
const EXPECTED_RETRIES = 3;
const EXPECTED_RETRIES_AFTER_TRANSIENT = 1;
const EXPECTED_TOTAL_CALLS = 2;
const SAMPLE_VALUE = { a: EXPECTED_RETRIES_AFTER_TRANSIENT };

/* ─── Helpers ─── */

function makeFakeClient(): FakeClient {
  const get: FakeClient['get'] = jest.fn();
  const setex: FakeClient['setex'] = jest.fn();
  const set: FakeClient['set'] = jest.fn();
  const del: FakeClient['del'] = jest.fn();
  return { get, setex, set, del };
}

/* ─── tryGet tests ─── */

describe('cache wrapper — tryGet', () => {
  it('returns null on Redis error and calls onUnavailable', async () => {
    const client = makeFakeClient();
    client.get.mockRejectedValue(new Error('connection refused'));
    const counter = jest.fn();
    const cache = createCache(client, { onUnavailable: counter });
    const result = await cache.tryGet(CACHE_KEY);
    expect(result).toBeNull();
    expect(counter).toHaveBeenCalled();
  });

  it('parses JSON values', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue(JSON.stringify(SAMPLE_VALUE));
    const cache = createCache(client);
    expect(await cache.tryGet(CACHE_KEY)).toEqual(SAMPLE_VALUE);
  });
});

/* ─── trySetex tests ─── */

describe('cache wrapper — trySetex', () => {
  it('skips when ttlSeconds <= 0', async () => {
    const client = makeFakeClient();
    const cache = createCache(client);
    await cache.trySetex(CACHE_KEY, TTL_SKIP, SAMPLE_VALUE);
    expect(client.setex).not.toHaveBeenCalled();
  });
});

/* ─── tryDel tests ─── */

describe('cache wrapper — tryDel', () => {
  it('returns success on normal call', async () => {
    const client = makeFakeClient();
    client.del.mockResolvedValue(DEL_SUCCESS);
    const cache = createCache(client);
    const result = await cache.tryDel(CACHE_KEY);
    expect(result.ok).toBe(true);
  });

  it('returns failure after exhausting retries (non-swallowing)', async () => {
    const client = makeFakeClient();
    client.del.mockRejectedValue(new Error('boom'));
    const cache = createCache(client);
    const result = await cache.tryDel(CACHE_KEY);
    expect(result.ok).toBe(false);
    expect(client.del).toHaveBeenCalledTimes(EXPECTED_RETRIES);
  });

  it('succeeds after a transient failure (retry actually retries)', async () => {
    const client = makeFakeClient();
    let calls = 0;
    client.del.mockImplementation(async () => {
      calls += DEL_SUCCESS;
      if (calls === FIRST_CALL) throw new Error('transient');
      return await Promise.resolve(DEL_SUCCESS);
    });
    const cache = createCache(client);
    const result = await cache.tryDel(CACHE_KEY);
    expect(result.ok).toBe(true);
    expect(result.retries).toBe(EXPECTED_RETRIES_AFTER_TRANSIENT);
    expect(client.del).toHaveBeenCalledTimes(EXPECTED_TOTAL_CALLS);
  });
});
