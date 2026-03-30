import { describe, expect, it, jest } from '@jest/globals';

import { DirtySetClient } from '../dirtySet.js';
import type { RedisClient, RedisPipeline } from '../types.js';

const SESSION_KEY = 'test-session';
const REDIS_KEY = `vfs:dirty:${SESSION_KEY}`;
const TTL = 900;
const TEST_PATH = 'src/foo.ts';
const TEST_TIMESTAMP = 1700000000000;
const TIMESTAMP_OFFSET = 1;
const TIMESTAMP_PLUS_ONE = TEST_TIMESTAMP + TIMESTAMP_OFFSET;
const DEL_RESULT_ONE = 1;

function makePipeline(): jest.Mocked<RedisPipeline> {
  const pipeline: jest.Mocked<RedisPipeline> = {
    hset: jest.fn<RedisPipeline['hset']>(),
    expire: jest.fn<RedisPipeline['expire']>(),
    exec: jest.fn<RedisPipeline['exec']>(),
  };
  pipeline.hset.mockReturnValue(pipeline);
  pipeline.expire.mockReturnValue(pipeline);
  pipeline.exec.mockResolvedValue([]);
  return pipeline;
}

function makeRedis(pipeline: jest.Mocked<RedisPipeline>): jest.Mocked<RedisClient> {
  const redis: jest.Mocked<RedisClient> = {
    hget: jest.fn<RedisClient['hget']>(),
    hmget: jest.fn<RedisClient['hmget']>(),
    hset: jest.fn<RedisClient['hset']>(),
    expire: jest.fn<RedisClient['expire']>(),
    del: jest.fn<RedisClient['del']>(),
    pipeline: jest.fn<RedisClient['pipeline']>().mockReturnValue(pipeline),
  };
  return redis;
}

function describeGetTimestamp(): void {
  it('returns null when path not in hash', async () => {
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    redis.hget.mockResolvedValue(null);
    const client = new DirtySetClient(redis, SESSION_KEY);
    const result = await client.getTimestamp(TEST_PATH);
    expect(redis.hget).toHaveBeenCalledWith(REDIS_KEY, TEST_PATH);
    expect(result).toBeNull();
  });

  it('returns parsed timestamp when path is dirty', async () => {
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    redis.hget.mockResolvedValue(String(TEST_TIMESTAMP));
    const client = new DirtySetClient(redis, SESSION_KEY);
    const result = await client.getTimestamp(TEST_PATH);
    expect(result).toBe(TEST_TIMESTAMP);
  });

  it('returns current timestamp on Redis error (graceful fallback)', async () => {
    const before = Date.now();
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    redis.hget.mockRejectedValue(new Error('connection refused'));
    const client = new DirtySetClient(redis, SESSION_KEY);
    const result = await client.getTimestamp(TEST_PATH);
    const after = Date.now();
    expect(result).not.toBeNull();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
}

function describeMarkDirty(): void {
  it('pipelines HSET + EXPIRE with correct key/TTL', async () => {
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    const client = new DirtySetClient(redis, SESSION_KEY);
    await client.markDirty(TEST_PATH, TEST_TIMESTAMP);
    expect(redis.pipeline).toHaveBeenCalled();
    expect(pipeline.hset).toHaveBeenCalledWith(REDIS_KEY, TEST_PATH, String(TEST_TIMESTAMP));
    expect(pipeline.expire).toHaveBeenCalledWith(REDIS_KEY, TTL);
    expect(pipeline.exec).toHaveBeenCalled();
  });

  it('silently no-ops on Redis error', async () => {
    const pipeline = makePipeline();
    pipeline.exec.mockRejectedValue(new Error('Redis down'));
    const redis = makeRedis(pipeline);
    const client = new DirtySetClient(redis, SESSION_KEY);
    await expect(client.markDirty(TEST_PATH, TEST_TIMESTAMP)).resolves.toBeUndefined();
  });
}

function describeGetTimestamps(): void {
  it('batch returns Map with only non-null entries', async () => {
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    const paths = ['a.ts', 'b.ts', 'c.ts'];
    redis.hmget.mockResolvedValue([String(TEST_TIMESTAMP), null, String(TIMESTAMP_PLUS_ONE)]);
    const client = new DirtySetClient(redis, SESSION_KEY);
    const result = await client.getTimestamps(paths);
    expect(redis.hmget).toHaveBeenCalledWith(REDIS_KEY, 'a.ts', 'b.ts', 'c.ts');
    expect(result.get('a.ts')).toBe(TEST_TIMESTAMP);
    expect(result.has('b.ts')).toBe(false);
    expect(result.get('c.ts')).toBe(TIMESTAMP_PLUS_ONE);
  });

  it('returns fallback Map with current timestamps on Redis error', async () => {
    const before = Date.now();
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    const paths = ['a.ts', 'b.ts'];
    redis.hmget.mockRejectedValue(new Error('timeout'));
    const client = new DirtySetClient(redis, SESSION_KEY);
    const result = await client.getTimestamps(paths);
    const after = Date.now();
    expect(result.size).toBe(paths.length);
    for (const path of paths) {
      const ts = result.get(path);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    }
  });
}

function describeMarkTreeDirty(): void {
  it('delegates to markDirty with __tree_index path', async () => {
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    const client = new DirtySetClient(redis, SESSION_KEY);
    await client.markTreeDirty(TEST_TIMESTAMP);
    expect(pipeline.hset).toHaveBeenCalledWith(REDIS_KEY, '__tree_index', String(TEST_TIMESTAMP));
    expect(pipeline.expire).toHaveBeenCalledWith(REDIS_KEY, TTL);
  });
}

function describeGetTreeTimestamp(): void {
  it('returns null on Redis error (trusts local tree)', async () => {
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    redis.hget.mockRejectedValue(new Error('Redis unavailable'));
    const client = new DirtySetClient(redis, SESSION_KEY);
    const result = await client.getTreeTimestamp();
    expect(result).toBeNull();
  });

  it('returns parsed timestamp when tree index is set', async () => {
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    redis.hget.mockResolvedValue(String(TEST_TIMESTAMP));
    const client = new DirtySetClient(redis, SESSION_KEY);
    const result = await client.getTreeTimestamp();
    expect(redis.hget).toHaveBeenCalledWith(REDIS_KEY, '__tree_index');
    expect(result).toBe(TEST_TIMESTAMP);
  });
}

function describeDeleteKey(): void {
  it('calls redis.del with the correct key', async () => {
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    redis.del.mockResolvedValue(DEL_RESULT_ONE);
    const client = new DirtySetClient(redis, SESSION_KEY);
    await client.deleteKey();
    expect(redis.del).toHaveBeenCalledWith(REDIS_KEY);
  });

  it('silently no-ops on Redis error', async () => {
    const pipeline = makePipeline();
    const redis = makeRedis(pipeline);
    redis.del.mockRejectedValue(new Error('Redis down'));
    const client = new DirtySetClient(redis, SESSION_KEY);
    await expect(client.deleteKey()).resolves.toBeUndefined();
  });
}

describe('DirtySetClient', () => {
  describe('getTimestamp', describeGetTimestamp);
  describe('markDirty', describeMarkDirty);
  describe('getTimestamps', describeGetTimestamps);
  describe('markTreeDirty', describeMarkTreeDirty);
  describe('getTreeTimestamp', describeGetTreeTimestamp);
  describe('deleteKey', describeDeleteKey);
});
