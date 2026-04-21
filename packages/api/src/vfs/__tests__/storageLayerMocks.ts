// storageLayerMocks.ts — mock factories for StorageLayer tests
import { jest } from '@jest/globals';

import { StorageLayer } from '../storageLayer.js';
import type { StorageBucketApi, SupabaseQueryBuilder, SupabaseVFSClient } from '../types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

export const PREFIX = 'tenant/agent/session';
export const FILE_PATH = 'src/hello.ts';
export const FILE_CONTENT = 'console.log("hello");';
export const TREE_INDEX_FILE = '__tree_index.json';
export const TREE_INDEX_DATA = '{"entries":[]}';
export const NEW_PATH = 'src/renamed.ts';
export const COPY_ERR_MSG = 'copy failed';
export const DELETE_ERR_MSG = 'delete failed';
export const UPLOAD_ERR_MSG = 'upload failed';
export const DOWNLOAD_ERR_MSG = 'download failed';
export const LIST_ERR_MSG = 'list failed';
export const REMOVE_ERR_MSG = 'remove failed';
export const NOT_FOUND_MSG = 'Object not found';
export const NOT_FOUND_STATUS = '404';
export const SERVER_ERR_STATUS = '500';
export const LIST_PAGE_SIZE = 100;

// ─── Mock Factories ─────────────────────────────────────────────────────────

export function createMockBucket(): jest.Mocked<StorageBucketApi> {
  return {
    upload: jest.fn<StorageBucketApi['upload']>().mockResolvedValue({
      data: { name: 'ok', id: 'id-1' },
      error: null,
    }),
    download: jest.fn<StorageBucketApi['download']>().mockResolvedValue({
      data: new Blob([FILE_CONTENT]),
      error: null,
    }),
    remove: jest.fn<StorageBucketApi['remove']>().mockResolvedValue({ data: [], error: null }),
    copy: jest.fn<StorageBucketApi['copy']>().mockResolvedValue({ data: { path: 'ok' }, error: null }),
    list: jest.fn<StorageBucketApi['list']>().mockResolvedValue({ data: [], error: null }),
  };
}

function createQueryBuilder(): SupabaseQueryBuilder {
  const thenFn: SupabaseQueryBuilder['then'] = async (onfulfilled) =>
    await Promise.resolve(onfulfilled({ data: {}, error: null }));
  const qb: SupabaseQueryBuilder = {
    upsert: jest.fn<SupabaseQueryBuilder['upsert']>(),
    update: jest.fn<SupabaseQueryBuilder['update']>(),
    delete: jest.fn<SupabaseQueryBuilder['delete']>(),
    eq: jest.fn<SupabaseQueryBuilder['eq']>(),
    select: jest.fn<SupabaseQueryBuilder['select']>(),
    lt: jest.fn<SupabaseQueryBuilder['lt']>(),
    single: jest.fn<SupabaseQueryBuilder['single']>(),
    then: thenFn,
  };
  qb.upsert = jest.fn<SupabaseQueryBuilder['upsert']>().mockReturnValue(qb);
  qb.update = jest.fn<SupabaseQueryBuilder['update']>().mockReturnValue(qb);
  qb.eq = jest.fn<SupabaseQueryBuilder['eq']>().mockReturnValue(qb);
  qb.select = jest.fn<SupabaseQueryBuilder['select']>().mockReturnValue(qb);
  return qb;
}

export function createMockSupabase(bucket: jest.Mocked<StorageBucketApi>): SupabaseVFSClient {
  const storageFrom = jest.fn<(b: string) => StorageBucketApi>().mockReturnValue(bucket);
  const qb = createQueryBuilder();
  const tableFrom = jest.fn<(t: string) => SupabaseQueryBuilder>().mockReturnValue(qb);
  return { storage: { from: storageFrom }, from: tableFrom };
}

export function fullPath(path: string): string {
  return `${PREFIX}/${path}`;
}

// ─── Test Context ───────────────────────────────────────────────────────────

export interface StorageTestContext {
  bucket: jest.Mocked<StorageBucketApi>;
  storage: StorageLayer;
}

export function createTestContext(): StorageTestContext {
  const bucket = createMockBucket();
  const supabase = createMockSupabase(bucket);
  const storage = new StorageLayer(supabase, PREFIX);
  return { bucket, storage };
}
