import { describe, expect, it, jest } from '@jest/globals';

import { VFSContext } from '../vfsContext.js';
import { VFSError, VFSErrorCode } from '../types.js';
import type {
  RedisClient,
  RedisPipeline,
  SourceProvider,
  SupabaseQueryBuilder,
  SupabaseVFSClient,
} from '../types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT = 'acme';
const AGENT = 'bot';
const USER = 'user-1';
const SESSION = 'sess-1';
const COMMIT = 'abc123';
const HELLO_PATH = 'src/hello.ts';
const HELLO_CONTENT = 'console.log("hello");';
const HELLO_BYTES = new TextEncoder().encode(HELLO_CONTENT);
const HELLO_SIZE = 100;
const RATE_LIMIT_REMAINING = 5000;
const RATE_LIMIT_LOW = 5;

// ─── Mock Builders ───────────────────────────────────────────────────────────

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

function makeRedis(): jest.Mocked<RedisClient> {
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

function makeQueryBuilder(): jest.Mocked<SupabaseQueryBuilder> {
  const qb: jest.Mocked<SupabaseQueryBuilder> = {
    upsert: jest.fn<SupabaseQueryBuilder['upsert']>(),
    update: jest.fn<SupabaseQueryBuilder['update']>(),
    delete: jest.fn<SupabaseQueryBuilder['delete']>(),
    eq: jest.fn<SupabaseQueryBuilder['eq']>(),
    select: jest.fn<SupabaseQueryBuilder['select']>(),
    lt: jest.fn<SupabaseQueryBuilder['lt']>(),
    single: jest.fn<SupabaseQueryBuilder['single']>(),
    then: jest.fn<SupabaseQueryBuilder['then']>(),
  };
  qb.upsert.mockReturnValue(qb);
  qb.update.mockReturnValue(qb);
  qb.delete.mockReturnValue(qb);
  qb.eq.mockReturnValue(qb);
  qb.select.mockReturnValue(qb);
  qb.lt.mockReturnValue(qb);
  qb.single.mockReturnValue(qb);
  qb.then.mockImplementation((fn) => Promise.resolve(fn({ data: {}, error: null })));
  return qb;
}

function makeSupabase(): SupabaseVFSClient {
  const qb = makeQueryBuilder();
  return {
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ data: { path: 'ok' }, error: null }),
        download: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'not found', statusCode: '404' },
        }),
        remove: jest.fn().mockResolvedValue({ data: [], error: null }),
        copy: jest.fn().mockResolvedValue({ data: { path: 'ok' }, error: null }),
        list: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    },
    from: jest.fn().mockReturnValue(qb),
  };
}

function makeSourceProvider(): jest.Mocked<SourceProvider> {
  return {
    commitSha: COMMIT,
    rateLimit: { remaining: RATE_LIMIT_REMAINING, resetAt: new Date(), limit: RATE_LIMIT_REMAINING },
    fetchTree: jest.fn<SourceProvider['fetchTree']>().mockResolvedValue([
      { path: 'src', type: 'directory' },
      { path: HELLO_PATH, type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
    ]),
    fetchFileContent: jest.fn<SourceProvider['fetchFileContent']>().mockResolvedValue(HELLO_BYTES),
  };
}

interface MockDeps {
  sourceProvider: jest.Mocked<SourceProvider>;
  redis: jest.Mocked<RedisClient>;
  supabase: SupabaseVFSClient;
}

function createMockDeps(): MockDeps {
  return { sourceProvider: makeSourceProvider(), redis: makeRedis(), supabase: makeSupabase() };
}

function createCtx(deps: MockDeps): VFSContext {
  return new VFSContext({
    tenantSlug: TENANT,
    agentSlug: AGENT,
    userID: USER,
    sessionId: SESSION,
    commitSha: COMMIT,
    sourceProvider: deps.sourceProvider,
    supabase: deps.supabase,
    redis: deps.redis,
  });
}

async function initCtx(deps: MockDeps): Promise<VFSContext> {
  const ctx = createCtx(deps);
  await ctx.initialize();
  return ctx;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function describeReadFromSource(): void {
  it('fetches from source on full cache miss', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    const result = await ctx.readFile(HELLO_PATH);
    expect(result.content).toBe(HELLO_CONTENT);
    expect(result.path).toBe(HELLO_PATH);
    expect(deps.sourceProvider.fetchFileContent).toHaveBeenCalledWith(HELLO_PATH);
  });
}

function describeReadFromMemory(): void {
  it('returns from memory cache on hit', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    // First read populates memory
    await ctx.readFile(HELLO_PATH);
    deps.sourceProvider.fetchFileContent.mockClear();
    // Second read should hit memory
    const result = await ctx.readFile(HELLO_PATH);
    expect(result.content).toBe(HELLO_CONTENT);
    expect(deps.sourceProvider.fetchFileContent).not.toHaveBeenCalled();
  });
}

function describeReadStaleCache(): void {
  it('re-fetches from storage when dirty set says stale', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    // First read populates memory
    await ctx.readFile(HELLO_PATH);
    // Simulate dirty set returning a future timestamp (stale)
    const futureTs = String(Date.now() + 100000);
    deps.redis.hget.mockResolvedValue(futureTs);
    // Make storage return different data based on the path
    const updatedContent = 'console.log("updated");';
    const treeJson = JSON.stringify({
      entries: [
        { path: 'src', type: 'directory' },
        { path: HELLO_PATH, type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
      ],
    });
    const bucket = deps.supabase.storage.from('vfs');
    (bucket.download as jest.Mock).mockImplementation((fullPath: string) => {
      if (fullPath.endsWith('__tree_index.json')) {
        return Promise.resolve({ data: new Blob([treeJson]), error: null });
      }
      return Promise.resolve({ data: new Blob([updatedContent]), error: null });
    });
    const result = await ctx.readFile(HELLO_PATH);
    expect(result.content).toBe(updatedContent);
  });
}

function describeCreateAndRead(): void {
  it('creates a file then reads it back', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    const newPath = 'src/new-file.ts';
    // Ensure tree knows it does not exist
    deps.sourceProvider.fetchTree.mockResolvedValue([
      { path: 'src', type: 'directory' },
      { path: HELLO_PATH, type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
    ]);
    const createResult = await ctx.createFile(newPath, 'export const x = 1;');
    expect(createResult.path).toBe(newPath);
    expect(createResult.linesWritten).toBe(1);
    const readResult = await ctx.readFile(newPath);
    expect(readResult.content).toBe('export const x = 1;');
  });
}

function describeEditFile(): void {
  it('applies search-and-replace edits', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    // Read first to populate
    await ctx.readFile(HELLO_PATH);
    const result = await ctx.editFile(HELLO_PATH, [
      { old_text: 'hello', new_text: 'world' },
    ]);
    expect(result.editsApplied).toBe(1);
    const readBack = await ctx.readFile(HELLO_PATH);
    expect(readBack.content).toContain('world');
  });
}

function describeEditAtomicFailure(): void {
  it('leaves file unchanged when second edit fails', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    await expect(
      ctx.editFile(HELLO_PATH, [
        { old_text: 'hello', new_text: 'world' },
        { old_text: 'NONEXISTENT', new_text: 'fail' },
      ])
    ).rejects.toThrow(VFSError);
    const readBack = await ctx.readFile(HELLO_PATH);
    expect(readBack.content).toBe(HELLO_CONTENT);
  });
}

function describeEditMutualExclusivity(): void {
  it('rejects both edits and fullContent', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    await expect(
      ctx.editFile(HELLO_PATH, [{ old_text: 'hello', new_text: 'world' }], 'full content')
    ).rejects.toThrow(VFSError);
  });
}

function describeDeleteFile(): void {
  it('removes file from all layers', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    const result = await ctx.deleteFile(HELLO_PATH);
    expect(result.deleted).toBe(true);
    await expect(ctx.readFile(HELLO_PATH)).rejects.toThrow(VFSError);
  });
}

function describeRenameFile(): void {
  it('moves file in all layers', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    const newPath = 'src/renamed.ts';
    const result = await ctx.renameFile(HELLO_PATH, newPath);
    expect(result.oldPath).toBe(HELLO_PATH);
    expect(result.newPath).toBe(newPath);
    const readBack = await ctx.readFile(newPath);
    expect(readBack.content).toBe(HELLO_CONTENT);
  });
}

function describeBinaryFile(): void {
  it('throws BINARY_FILE for files with null bytes', async () => {
    const deps = createMockDeps();
    const binaryBytes = new Uint8Array([72, 101, 0, 108, 111]);
    deps.sourceProvider.fetchFileContent.mockResolvedValue(binaryBytes);
    const ctx = await initCtx(deps);
    try {
      await ctx.readFile(HELLO_PATH);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(VFSError);
      expect((err as VFSError).code).toBe(VFSErrorCode.BINARY_FILE);
    }
  });
}

const TINY_LINE_CEILING = 3;

function describeTooLarge(): void {
  it('throws TOO_LARGE when file exceeds readLineCeiling', async () => {
    const deps = createMockDeps();
    const bigContent = Array.from({ length: 5 }, (_, i) => `line ${i}`).join('\n');
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(bigContent));
    const ctx = new VFSContext({
      tenantSlug: TENANT,
      agentSlug: AGENT,
      userID: USER,
      sessionId: SESSION,
      commitSha: COMMIT,
      sourceProvider: deps.sourceProvider,
      supabase: deps.supabase,
      redis: deps.redis,
      readLineCeiling: TINY_LINE_CEILING,
    });
    await ctx.initialize();
    try {
      await ctx.readFile(HELLO_PATH);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(VFSError);
      expect((err as VFSError).code).toBe(VFSErrorCode.TOO_LARGE);
    }
  });
}

function describeRateLimit(): void {
  it('throws RATE_LIMITED when remaining is below threshold', async () => {
    const deps = createMockDeps();
    deps.sourceProvider.rateLimit.remaining = RATE_LIMIT_LOW;
    const ctx = await initCtx(deps);
    try {
      await ctx.readFile(HELLO_PATH);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(VFSError);
      expect((err as VFSError).code).toBe(VFSErrorCode.RATE_LIMITED);
    }
  });
}

describe('VFSContext', () => {
  describe('readFile from source', describeReadFromSource);
  describe('readFile from memory', describeReadFromMemory);
  describe('readFile stale cache', describeReadStaleCache);
  describe('createFile + readFile round-trip', describeCreateAndRead);
  describe('editFile with search-and-replace', describeEditFile);
  describe('editFile atomic failure', describeEditAtomicFailure);
  describe('editFile mutual exclusivity', describeEditMutualExclusivity);
  describe('deleteFile', describeDeleteFile);
  describe('renameFile', describeRenameFile);
  describe('binary file detection', describeBinaryFile);
  describe('TOO_LARGE error', describeTooLarge);
  describe('rate limit check', describeRateLimit);
});
