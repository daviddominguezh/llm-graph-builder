// vfsContextDeepEdge.test.ts — edge cases, coherence, error propagation
import { describe, expect, it } from '@jest/globals';
import type { jest } from '@jest/globals';

import type { RedisClient, StorageBucketApi, SupabaseVFSClient } from '../types.js';
import { VFSError, VFSErrorCode } from '../types.js';
import { VFSContext } from '../vfsContext.js';
import type { MockSourceProvider } from './vfsContextMocks.js';
import { makeBucket, makeRedis, makeSourceProvider, makeSupabase } from './vfsContextMocks.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT = 'acme';
const AGENT = 'bot';
const USER = 'user-1';
const SESSION = 'sess-1';
const COMMIT = 'abc123';
const HELLO_PATH = 'src/hello.ts';
const HELLO_BYTES = new TextEncoder().encode('console.log("hello");');
const HELLO_SIZE = 100;
const STALE_OFFSET = 100000;
const EXPECTED_ZERO = 0;

// ─── Shared Setup ───────────────────────────────────────────────────────────

interface MockDeps {
  sourceProvider: MockSourceProvider;
  redis: jest.Mocked<RedisClient>;
  supabase: SupabaseVFSClient;
  bucket: jest.Mocked<StorageBucketApi>;
}

function createMockDeps(): MockDeps {
  const bucket = makeBucket();
  const supabase = makeSupabase(bucket);
  return {
    sourceProvider: makeSourceProvider(HELLO_BYTES, COMMIT),
    redis: makeRedis(),
    supabase,
    bucket,
  };
}

async function initCtx(deps: MockDeps): Promise<VFSContext> {
  const ctx = new VFSContext({
    tenantSlug: TENANT,
    agentSlug: AGENT,
    userID: USER,
    sessionId: SESSION,
    commitSha: COMMIT,
    sourceProvider: deps.sourceProvider,
    supabase: deps.supabase,
    redis: deps.redis,
  });
  await ctx.initialize();
  return ctx;
}

function buildTreeJson(): string {
  return JSON.stringify({
    entries: [
      { path: 'src', type: 'directory' },
      { path: HELLO_PATH, type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
    ],
  });
}

function assertVFSError(err: unknown, expectedCode: VFSErrorCode): void {
  expect(err).toBeInstanceOf(VFSError);
  if (err instanceof VFSError) {
    expect(err.code).toBe(expectedCode);
  }
}

function makeStorageBlob(fullPath: string, content: string): { data: Blob; error: null } {
  const treeJson = buildTreeJson();
  const isTree = fullPath.endsWith('__tree_index.json');
  return { data: new Blob([isTree ? treeJson : content]), error: null };
}

// ─── Dirty set coherence ────────────────────────────────────────────────────

function describeDirtySetCoherence(): void {
  it('detects stale memory after dirty set update', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    const futureTs = String(Date.now() + STALE_OFFSET);
    deps.redis.hget.mockResolvedValue(futureTs);
    deps.bucket.download.mockImplementation(
      async (p: string) => await Promise.resolve(makeStorageBlob(p, 'UPDATED'))
    );
    const result = await ctx.readFile(HELLO_PATH);
    expect(result.content).toBe('UPDATED');
  });
}

// ─── Tree mutations persist ─────────────────────────────────────────────────

function describeTreeMutationsPersist(): void {
  it('uploads tree to storage after createFile', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.createFile('src/new.ts', 'content');
    const treeUploaded = deps.bucket.upload.mock.calls.some(
      ([pathArg]) => typeof pathArg === 'string' && pathArg.includes('__tree_index')
    );
    expect(treeUploaded).toBe(true);
  });
}

// ─── readFile from storage layer ────────────────────────────────────────────

function describeReadFromStorage(): void {
  it('reads from storage on memory miss', async () => {
    const deps = createMockDeps();
    deps.bucket.download.mockImplementation(
      async (p: string) => await Promise.resolve(makeStorageBlob(p, 'from-storage'))
    );
    const ctx = await initCtx(deps);
    const result = await ctx.readFile(HELLO_PATH);
    expect(result.content).toBe('from-storage');
    expect(deps.sourceProvider.fetchFileContent).not.toHaveBeenCalled();
  });
}

// ─── Tree loads from storage ────────────────────────────────────────────────

function describeTreeFromStorage(): void {
  it('loads tree from storage when available', async () => {
    const deps = createMockDeps();
    const treeJson = buildTreeJson();
    deps.bucket.download.mockImplementation(async (fullPath: string) => {
      if (fullPath.endsWith('__tree_index.json')) {
        return await Promise.resolve({ data: new Blob([treeJson]), error: null });
      }
      return await Promise.resolve({ data: null, error: { message: 'not found', statusCode: '404' } });
    });
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    expect(deps.sourceProvider.fetchTree).not.toHaveBeenCalled();
  });
}

// ─── Storage upload failure ─────────────────────────────────────────────────

function describeStorageUploadFailure(): void {
  it('wraps storage error in VFSError', async () => {
    const deps = createMockDeps();
    deps.bucket.upload.mockResolvedValue({
      data: null,
      error: { message: 'upload failed', statusCode: '500' },
    });
    const ctx = await initCtx(deps);
    try {
      await ctx.readFile(HELLO_PATH);
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.PROVIDER_ERROR);
    }
  });
}

// ─── Source provider error ──────────────────────────────────────────────────

function describeSourceProviderError(): void {
  it('propagates source provider errors', async () => {
    const deps = createMockDeps();
    deps.sourceProvider.fetchFileContent.mockRejectedValue(new Error('network error'));
    const ctx = await initCtx(deps);
    await expect(ctx.readFile(HELLO_PATH)).rejects.toThrow('network error');
  });
}

// ─── Path validation ────────────────────────────────────────────────────────

function describePathValidationEmpty(): void {
  it('rejects empty path on readFile', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    try {
      await ctx.readFile('');
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.INVALID_PATH);
    }
  });
}

function describePathValidationAbsolute(): void {
  it('rejects absolute path on createFile', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await expect(ctx.createFile('/absolute/path.ts', 'content')).rejects.toThrow(VFSError);
  });
}

function describePathValidationGitOnRead(): void {
  it('rejects .git path on readFile', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    try {
      await ctx.readFile('.git/config');
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.PERMISSION_DENIED);
    }
  });
}

// ─── Empty file ─────────────────────────────────────────────────────────────

function describeEmptyFile(): void {
  it('handles empty file (0 bytes, 0 lines)', async () => {
    const deps = createMockDeps();
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new Uint8Array(EXPECTED_ZERO));
    const ctx = await initCtx(deps);
    const result = await ctx.readFile(HELLO_PATH);
    expect(result.content).toBe('');
    expect(result.totalLines).toBe(EXPECTED_ZERO);
  });
}

// ─── Whitespace-only file ───────────────────────────────────────────────────

function describeWhitespaceFile(): void {
  it('handles file with only whitespace/newlines', async () => {
    const deps = createMockDeps();
    const ws = '\n\n  \n';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(ws));
    const ctx = await initCtx(deps);
    const result = await ctx.readFile(HELLO_PATH);
    expect(result.content).toBe(ws);
  });
}

// ─── Unicode content ────────────────────────────────────────────────────────

function describeUnicodeContent(): void {
  it('handles emoji and CJK characters', async () => {
    const deps = createMockDeps();
    const unicode = 'const msg = "Hello \u4E16\u754C \uD83C\uDF0D";';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(unicode));
    const ctx = await initCtx(deps);
    const result = await ctx.readFile(HELLO_PATH);
    expect(result.content).toBe(unicode);
  });
}

// ─── File at repo root ──────────────────────────────────────────────────────

function describeRootFile(): void {
  it('reads file at repository root', async () => {
    const deps = createMockDeps();
    deps.sourceProvider.fetchTree.mockResolvedValue([
      { path: 'root.txt', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
    ]);
    const rootContent = 'root file content';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(rootContent));
    const ctx = await initCtx(deps);
    const result = await ctx.readFile('root.txt');
    expect(result.content).toBe(rootContent);
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('VFSContext edge cases', () => {
  describe('dirty set coherence', describeDirtySetCoherence);
  describe('tree mutations persist', describeTreeMutationsPersist);
  describe('readFile from storage', describeReadFromStorage);
  describe('tree loads from storage', describeTreeFromStorage);
  describe('storage upload failure', describeStorageUploadFailure);
  describe('source provider error', describeSourceProviderError);
  describe('path validation empty', describePathValidationEmpty);
  describe('path validation absolute', describePathValidationAbsolute);
  describe('path validation .git read', describePathValidationGitOnRead);
  describe('empty file', describeEmptyFile);
  describe('whitespace file', describeWhitespaceFile);
  describe('unicode content', describeUnicodeContent);
  describe('file at repo root', describeRootFile);
});
