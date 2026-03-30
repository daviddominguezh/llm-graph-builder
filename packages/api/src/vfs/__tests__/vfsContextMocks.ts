// vfsContextMocks.ts — mock factories for VFSContext tests
import { jest } from '@jest/globals';

import type {
  RedisClient,
  RedisPipeline,
  SourceProvider,
  StorageBucketApi,
  SupabaseQueryBuilder,
  SupabaseVFSClient,
} from '../types.js';

const HELLO_SIZE = 100;
const RATE_LIMIT_DEFAULT = 5000;
const REDIS_OK = 1;

// ─── Redis ───────────────────────────────────────────────────────────────────

function makePipeline(): jest.Mocked<RedisPipeline> {
  const p: jest.Mocked<RedisPipeline> = {
    hset: jest.fn<RedisPipeline['hset']>(),
    expire: jest.fn<RedisPipeline['expire']>(),
    exec: jest.fn<RedisPipeline['exec']>(),
  };
  p.hset.mockReturnValue(p);
  p.expire.mockReturnValue(p);
  p.exec.mockResolvedValue([]);
  return p;
}

export function makeRedis(): jest.Mocked<RedisClient> {
  const pipeline = makePipeline();
  return {
    hget: jest.fn<RedisClient['hget']>().mockResolvedValue(null),
    hmget: jest.fn<RedisClient['hmget']>().mockResolvedValue([]),
    hset: jest.fn<RedisClient['hset']>().mockResolvedValue(REDIS_OK),
    expire: jest.fn<RedisClient['expire']>().mockResolvedValue(REDIS_OK),
    del: jest.fn<RedisClient['del']>().mockResolvedValue(REDIS_OK),
    pipeline: jest.fn<RedisClient['pipeline']>().mockReturnValue(pipeline),
  };
}

// ─── Supabase Query Builder ──────────────────────────────────────────────────

function makeQueryBuilder(): SupabaseQueryBuilder {
  // Build a chainable query builder for test mocking.
  // We assign methods explicitly to satisfy type requirements.
  const qb: SupabaseQueryBuilder = {
    upsert: jest.fn<SupabaseQueryBuilder['upsert']>(),
    update: jest.fn<SupabaseQueryBuilder['update']>(),
    delete: jest.fn<SupabaseQueryBuilder['delete']>(),
    eq: jest.fn<SupabaseQueryBuilder['eq']>(),
    select: jest.fn<SupabaseQueryBuilder['select']>(),
    lt: jest.fn<SupabaseQueryBuilder['lt']>(),
    single: jest.fn<SupabaseQueryBuilder['single']>(),
    then: (onfulfilled) => Promise.resolve(onfulfilled({ data: {}, error: null })),
  };
  // Wire up chaining — each method returns the builder itself
  (qb.upsert as jest.Mock).mockReturnValue(qb);
  (qb.update as jest.Mock).mockReturnValue(qb);
  (qb.delete as jest.Mock).mockReturnValue(qb);
  (qb.eq as jest.Mock).mockReturnValue(qb);
  (qb.select as jest.Mock).mockReturnValue(qb);
  (qb.lt as jest.Mock).mockReturnValue(qb);
  (qb.single as jest.Mock).mockReturnValue(qb);
  return qb;
}

// ─── Supabase Storage Bucket ─────────────────────────────────────────────────

export function makeBucket(): jest.Mocked<StorageBucketApi> {
  return {
    upload: jest.fn<StorageBucketApi['upload']>().mockResolvedValue({
      data: { name: 'ok', id: 'id-1' },
      error: null,
    }),
    download: jest.fn<StorageBucketApi['download']>().mockResolvedValue({
      data: null,
      error: { message: 'not found', statusCode: '404' },
    }),
    remove: jest.fn<StorageBucketApi['remove']>().mockResolvedValue({ data: [], error: null }),
    copy: jest.fn<StorageBucketApi['copy']>().mockResolvedValue({ data: { path: 'ok' }, error: null }),
    list: jest.fn<StorageBucketApi['list']>().mockResolvedValue({ data: [], error: null }),
  };
}

// ─── Supabase Client ─────────────────────────────────────────────────────────

export function makeSupabase(bucket: jest.Mocked<StorageBucketApi>): SupabaseVFSClient {
  const qb = makeQueryBuilder();
  const storageFrom = jest.fn<(b: string) => StorageBucketApi>().mockReturnValue(bucket);
  const tableFrom = jest.fn<(t: string) => SupabaseQueryBuilder>().mockReturnValue(qb);
  return { storage: { from: storageFrom }, from: tableFrom };
}

// ─── Source Provider ─────────────────────────────────────────────────────────

export interface MockSourceProvider extends SourceProvider {
  fetchTree: jest.Mock<SourceProvider['fetchTree']>;
  fetchFileContent: jest.Mock<SourceProvider['fetchFileContent']>;
}

export function makeSourceProvider(contentBytes: Uint8Array, commitSha: string): MockSourceProvider {
  return {
    commitSha,
    rateLimit: { remaining: RATE_LIMIT_DEFAULT, resetAt: new Date(), limit: RATE_LIMIT_DEFAULT },
    fetchTree: jest.fn<SourceProvider['fetchTree']>().mockResolvedValue([
      { path: 'src', type: 'directory' },
      { path: 'src/hello.ts', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
    ]),
    fetchFileContent: jest.fn<SourceProvider['fetchFileContent']>().mockResolvedValue(contentBytes),
  };
}
