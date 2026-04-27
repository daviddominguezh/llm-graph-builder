import { describe, expect, it, jest } from '@jest/globals';

import { type RedisLikeClient, createCache } from '../redis.js';

interface FakeClient extends RedisLikeClient {
  get: jest.Mock<(key: string) => Promise<string | null>>;
  setex: jest.Mock<(key: string, ttl: number, value: string) => Promise<unknown>>;
  set: jest.Mock<(key: string, value: string) => Promise<unknown>>;
  del: jest.Mock<(...keys: string[]) => Promise<number>>;
}

function makeFakeClient(): FakeClient {
  return {
    get: jest.fn(),
    setex: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  } as unknown as FakeClient;
}

describe('cache wrapper', () => {
  it('tryGet returns null on Redis error and increments cache_unavailable', async () => {
    const client = makeFakeClient();
    client.get.mockRejectedValue(new Error('connection refused'));
    const counter = jest.fn();
    const cache = createCache(client, { onUnavailable: counter });
    const result = await cache.tryGet('k');
    expect(result).toBeNull();
    expect(counter).toHaveBeenCalled();
  });

  it('tryGet parses JSON values', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue('{"a":1}');
    const cache = createCache(client);
    expect(await cache.tryGet('k')).toEqual({ a: 1 });
  });

  it('trySetex skips when ttlSeconds <= 0', async () => {
    const client = makeFakeClient();
    const cache = createCache(client);
    await cache.trySetex('k', 0, { a: 1 });
    expect(client.setex).not.toHaveBeenCalled();
  });

  it('tryDel returns success on normal call', async () => {
    const client = makeFakeClient();
    client.del.mockResolvedValue(1);
    const cache = createCache(client);
    const result = await cache.tryDel('k');
    expect(result.ok).toBe(true);
  });

  it('tryDel returns failure after exhausting retries (non-swallowing)', async () => {
    const client = makeFakeClient();
    client.del.mockRejectedValue(new Error('boom'));
    const cache = createCache(client);
    const result = await cache.tryDel('k');
    const EXPECTED_RETRIES = 3;
    expect(result.ok).toBe(false);
    expect(client.del).toHaveBeenCalledTimes(EXPECTED_RETRIES);
  });

  it('tryDel succeeds after a transient failure (retry actually retries)', async () => {
    const client = makeFakeClient();
    let calls = 0;
    client.del.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
      return await Promise.resolve(1);
    });
    const cache = createCache(client);
    const result = await cache.tryDel('k');
    const EXPECTED_RETRIES_AFTER_TRANSIENT = 1;
    const EXPECTED_TOTAL_CALLS = 2;
    expect(result.ok).toBe(true);
    expect(result.retries).toBe(EXPECTED_RETRIES_AFTER_TRANSIENT);
    expect(client.del).toHaveBeenCalledTimes(EXPECTED_TOTAL_CALLS);
  });
});
