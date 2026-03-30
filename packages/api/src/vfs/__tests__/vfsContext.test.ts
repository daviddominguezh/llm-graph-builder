import { describe, expect, it } from '@jest/globals';

import type { RedisClient, StorageBucketApi, SupabaseVFSClient } from '../types.js';
import { VFSError, VFSErrorCode } from '../types.js';
import { VFSContext } from '../vfsContext.js';
import type { jest } from '@jest/globals';
import type { MockSourceProvider } from './vfsContextMocks.js';
import { makeBucket, makeRedis, makeSourceProvider, makeSupabase } from './vfsContextMocks.js';

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
const RATE_LIMIT_LOW = 5;
const STALE_OFFSET = 100000;
const LINE_CEILING_SMALL = 3;
const BIG_LINE_COUNT = 5;
const EXPECTED_ONE = 1;

const NULL_BYTE_VALUE = 0;
const NULL_BYTE_INDEX = 2;

function makeBinaryBytes(): Uint8Array {
  const bytes = new TextEncoder().encode('Hello');
  const withNull = new Uint8Array(bytes.length);
  withNull.set(bytes);
  withNull[NULL_BYTE_INDEX] = NULL_BYTE_VALUE;
  return withNull;
}

const BINARY_BYTES = makeBinaryBytes();

// ─── Shared Setup ────────────────────────────────────────────────────────────

interface MockDeps {
  sourceProvider: MockSourceProvider;
  redis: jest.Mocked<RedisClient>;
  supabase: SupabaseVFSClient;
  bucket: jest.Mocked<StorageBucketApi>;
}

function createMockDeps(): MockDeps {
  const bucket = makeBucket();
  const supabase = makeSupabase(bucket);
  return { sourceProvider: makeSourceProvider(HELLO_BYTES, COMMIT), redis: makeRedis(), supabase, bucket };
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

function assertVFSError(err: unknown, expectedCode: VFSErrorCode): void {
  expect(err).toBeInstanceOf(VFSError);
  if (err instanceof VFSError) {
    expect(err.code).toBe(expectedCode);
  }
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
    await ctx.readFile(HELLO_PATH);
    deps.sourceProvider.fetchFileContent.mockClear();
    const result = await ctx.readFile(HELLO_PATH);
    expect(result.content).toBe(HELLO_CONTENT);
    expect(deps.sourceProvider.fetchFileContent).not.toHaveBeenCalled();
  });
}

function buildTreeJson(): string {
  return JSON.stringify({
    entries: [
      { path: 'src', type: 'directory' },
      { path: HELLO_PATH, type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
    ],
  });
}

function describeReadStaleCache(): void {
  it('re-fetches from storage when dirty set says stale', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    const futureTs = String(Date.now() + STALE_OFFSET);
    deps.redis.hget.mockResolvedValue(futureTs);
    const updatedContent = 'console.log("updated");';
    const treeJson = buildTreeJson();
    deps.bucket.download.mockImplementation(async (fullPath: string) => {
      const isTree = fullPath.endsWith('__tree_index.json');
      const blob = new Blob([isTree ? treeJson : updatedContent]);
      return await Promise.resolve({ data: blob, error: null });
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
    const createResult = await ctx.createFile(newPath, 'export const x = 1;');
    expect(createResult.path).toBe(newPath);
    expect(createResult.linesWritten).toBe(EXPECTED_ONE);
    const readResult = await ctx.readFile(newPath);
    expect(readResult.content).toBe('export const x = 1;');
  });
}

function describeEditFile(): void {
  it('applies search-and-replace edits', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    const result = await ctx.editFile(HELLO_PATH, [{ old_text: 'hello', new_text: 'world' }]);
    expect(result.editsApplied).toBe(EXPECTED_ONE);
    const readBack = await ctx.readFile(HELLO_PATH);
    expect(readBack.content).toContain('world');
  });
}

function describeEditAtomicFailure(): void {
  it('leaves file unchanged when second edit fails', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    const editPromise = ctx.editFile(HELLO_PATH, [
      { old_text: 'hello', new_text: 'world' },
      { old_text: 'NONEXISTENT', new_text: 'fail' },
    ]);
    await expect(editPromise).rejects.toThrow(VFSError);
    const readBack = await ctx.readFile(HELLO_PATH);
    expect(readBack.content).toBe(HELLO_CONTENT);
  });
}

function describeEditMutualExclusivity(): void {
  it('rejects both edits and fullContent', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    const p = ctx.editFile(HELLO_PATH, [{ old_text: 'hello', new_text: 'world' }], 'full');
    await expect(p).rejects.toThrow(VFSError);
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
    deps.sourceProvider.fetchFileContent.mockResolvedValue(BINARY_BYTES);
    const ctx = await initCtx(deps);
    try {
      await ctx.readFile(HELLO_PATH);
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.BINARY_FILE);
    }
  });
}

function describeTooLarge(): void {
  it('throws TOO_LARGE when file exceeds readLineCeiling', async () => {
    const deps = createMockDeps();
    const big = Array.from({ length: BIG_LINE_COUNT }, (_, i) => `line ${i}`).join('\n');
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(big));
    const ctx = new VFSContext({
      tenantSlug: TENANT,
      agentSlug: AGENT,
      userID: USER,
      sessionId: SESSION,
      commitSha: COMMIT,
      sourceProvider: deps.sourceProvider,
      supabase: deps.supabase,
      redis: deps.redis,
      readLineCeiling: LINE_CEILING_SMALL,
    });
    await ctx.initialize();
    try {
      await ctx.readFile(HELLO_PATH);
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.TOO_LARGE);
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
      assertVFSError(err, VFSErrorCode.RATE_LIMITED);
    }
  });
}

describe('VFSContext', () => {
  describe('readFile from source', describeReadFromSource);
  describe('readFile from memory', describeReadFromMemory);
  describe('readFile stale cache', describeReadStaleCache);
  describe('createFile + readFile', describeCreateAndRead);
  describe('editFile', describeEditFile);
  describe('editFile atomic failure', describeEditAtomicFailure);
  describe('editFile mutual exclusivity', describeEditMutualExclusivity);
  describe('deleteFile', describeDeleteFile);
  describe('renameFile', describeRenameFile);
  describe('binary file detection', describeBinaryFile);
  describe('TOO_LARGE error', describeTooLarge);
  describe('rate limit check', describeRateLimit);
});
