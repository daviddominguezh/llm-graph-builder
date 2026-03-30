// DirtySetClient — Redis hash wrapper for VFS cache coherence across sub-agents
// Key format: vfs:dirty:{sessionKey}
// Fields: file paths → epoch timestamps of last writes
// Special field: __tree_index → timestamp of last tree modification
import type { RedisClient } from './types.js';

const TREE_INDEX_KEY = '__tree_index';
const TTL_SECONDS = 900;

function buildRedisKey(sessionKey: string): string {
  return `vfs:dirty:${sessionKey}`;
}

function buildFallbackMap(paths: string[]): Map<string, number> {
  const now = Date.now();
  const map = new Map<string, number>();
  for (const path of paths) {
    map.set(path, now);
  }
  return map;
}

function parseTimestamp(value: string | null): number | null {
  if (value === null) return null;
  return Number(value);
}

function addEntryIfPresent(map: Map<string, number>, path: string, raw: string | null | undefined): void {
  if (raw !== null && raw !== undefined) {
    map.set(path, Number(raw));
  }
}

function buildTimestampMap(paths: string[], values: Array<string | null>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [index, path] of paths.entries()) {
    addEntryIfPresent(map, path, values[index]);
  }
  return map;
}

export class DirtySetClient {
  private readonly redis: RedisClient;
  private readonly redisKey: string;

  constructor(redis: RedisClient, sessionKey: string) {
    this.redis = redis;
    this.redisKey = buildRedisKey(sessionKey);
  }

  async getTimestamp(path: string): Promise<number | null> {
    try {
      const value = await this.redis.hget(this.redisKey, path);
      return parseTimestamp(value);
    } catch {
      return Date.now();
    }
  }

  async getTimestamps(paths: string[]): Promise<Map<string, number>> {
    try {
      const values = await this.redis.hmget(this.redisKey, ...paths);
      return buildTimestampMap(paths, values);
    } catch {
      return buildFallbackMap(paths);
    }
  }

  async markDirty(path: string, timestamp: number): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.hset(this.redisKey, path, String(timestamp));
      pipeline.expire(this.redisKey, TTL_SECONDS);
      await pipeline.exec();
    } catch {
      // silently no-op on Redis failure
    }
  }

  async markTreeDirty(timestamp: number): Promise<void> {
    await this.markDirty(TREE_INDEX_KEY, timestamp);
  }

  async getTreeTimestamp(): Promise<number | null> {
    try {
      const value = await this.redis.hget(this.redisKey, TREE_INDEX_KEY);
      return parseTimestamp(value);
    } catch {
      return null;
    }
  }

  async deleteKey(): Promise<void> {
    try {
      await this.redis.del(this.redisKey);
    } catch {
      // silently no-op on Redis failure
    }
  }
}
