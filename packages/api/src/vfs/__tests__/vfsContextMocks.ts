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
    hset: jest.fn<RedisClient['hset']>().mockResolvedValue(1),
    expire: jest.fn<RedisClient['expire']>().mockResolvedValue(1),
    del: jest.fn<RedisClient['del']>().mockResolvedValue(1),
    pipeline: jest.fn<RedisClient['pipeline']>().mockReturnValue(pipeline),
  };
}

// ─── Supabase Query Builder ──────────────────────────────────────────────────

function makeQueryBuilder(): SupabaseQueryBuilder {
  const qb: Record<string, unknown> = {};
  const self = qb as unknown as SupabaseQueryBuilder;
  qb.upsert = jest.fn<SupabaseQueryBuilder['upsert']>().mockReturnValue(self);
  qb.update = jest.fn<SupabaseQueryBuilder['update']>().mockReturnValue(self);
  qb.delete = jest.fn<SupabaseQueryBuilder['delete']>().mockReturnValue(self);
  qb.eq = jest.fn<SupabaseQueryBuilder['eq']>().mockReturnValue(self);
  qb.select = jest.fn<SupabaseQueryBuilder['select']>().mockReturnValue(self);
  qb.lt = jest.fn<SupabaseQueryBuilder['lt']>().mockReturnValue(self);
  qb.single = jest.fn<SupabaseQueryBuilder['single']>().mockReturnValue(self);
  const thenFn: SupabaseQueryBuilder['then'] = (onfulfilled) =>
    Promise.resolve(onfulfilled({ data: {}, error: null }));
  qb.then = thenFn;
  return self;
}

// ─── Supabase Storage Bucket ─────────────────────────────────────────────────

export function makeBucket(): jest.Mocked<StorageBucketApi> {
  return {
    upload: jest.fn<StorageBucketApi['upload']>().mockResolvedValue({ data: { name: 'ok', id: '1' }, error: null }),
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
  const from = jest.fn<(t: string) => SupabaseQueryBuilder>().mockReturnValue(qb);
  return { storage: { from: storageFrom }, from };
}

// ─── Source Provider ─────────────────────────────────────────────────────────

export function makeSourceProvider(
  contentBytes: Uint8Array,
  commitSha: string
): jest.Mocked<Pick<SourceProvider, 'fetchTree' | 'fetchFileContent'>> & SourceProvider {
  const provider: SourceProvider = {
    commitSha,
    rateLimit: { remaining: RATE_LIMIT_DEFAULT, resetAt: new Date(), limit: RATE_LIMIT_DEFAULT },
    fetchTree: jest.fn<SourceProvider['fetchTree']>().mockResolvedValue([
      { path: 'src', type: 'directory' },
      { path: 'src/hello.ts', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
    ]),
    fetchFileContent: jest.fn<SourceProvider['fetchFileContent']>().mockResolvedValue(contentBytes),
  };
  return provider as jest.Mocked<Pick<SourceProvider, 'fetchTree' | 'fetchFileContent'>> & SourceProvider;
}
