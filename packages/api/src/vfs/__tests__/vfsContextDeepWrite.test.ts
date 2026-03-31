// vfsContextDeepWrite.test.ts — write-path integration tests for VFSContext
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
const HELLO_CONTENT = 'console.log("hello");';
const HELLO_BYTES = new TextEncoder().encode(HELLO_CONTENT);
const EXPECTED_ONE = 1;
const SMALL_FILE_SIZE = 50;

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

function assertVFSError(err: unknown, expectedCode: VFSErrorCode): void {
  expect(err).toBeInstanceOf(VFSError);
  if (err instanceof VFSError) {
    expect(err.code).toBe(expectedCode);
  }
}

// ─── createFile parent directories ──────────────────────────────────────────

function describeCreateFileParentDirs(): void {
  it('creates parent directories in tree', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.createFile('src/deep/nested/file.ts', 'content');
    const dirResult = await ctx.listDirectory('src/deep');
    const names = dirResult.entries.map((e) => e.name);
    expect(names).toContain('nested');
  });
}

// ─── createFile protected path ──────────────────────────────────────────────

function describeCreateFileProtectedEnv(): void {
  it('blocks writing to .env', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    try {
      await ctx.createFile('.env', 'SECRET=123');
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.PERMISSION_DENIED);
    }
  });
}

function describeCreateFileProtectedGit(): void {
  it('blocks writing to .git paths', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await expect(ctx.createFile('.git/config', 'bad')).rejects.toThrow(VFSError);
  });
}

// ─── editFile with full_content ─────────────────────────────────────────────

function describeEditFileFullContent(): void {
  it('replaces entire file content', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    const newContent = 'completely new content';
    const result = await ctx.editFile(HELLO_PATH, undefined, newContent);
    expect(result.editsApplied).toBe(EXPECTED_ONE);
    const readBack = await ctx.readFile(HELLO_PATH);
    expect(readBack.content).toBe(newContent);
  });
}

// ─── editFile ambiguous match ───────────────────────────────────────────────

function describeEditFileAmbiguous(): void {
  it('throws AMBIGUOUS_MATCH when old_text matches multiple times', async () => {
    const deps = createMockDeps();
    const repeated = 'aaa bbb aaa';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(repeated));
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    try {
      await ctx.editFile(HELLO_PATH, [{ old_text: 'aaa', new_text: 'zzz' }]);
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.AMBIGUOUS_MATCH);
    }
  });
}

// ─── editFile no params ─────────────────────────────────────────────────────

function describeEditFileNoParams(): void {
  it('throws INVALID_PARAMETER when neither edits nor fullContent given', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    try {
      await ctx.editFile(HELLO_PATH);
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.INVALID_PARAMETER);
    }
  });
}

// ─── deleteFile FILE_NOT_FOUND ──────────────────────────────────────────────

function describeDeleteFileNotFound(): void {
  it('throws FILE_NOT_FOUND for non-existent file', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    try {
      await ctx.deleteFile('no/such/file.ts');
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.FILE_NOT_FOUND);
    }
  });
}

// ─── renameFile target exists ───────────────────────────────────────────────

function describeRenameFileTargetExists(): void {
  it('throws ALREADY_EXISTS when target path already exists', async () => {
    const deps = createMockDeps();
    deps.sourceProvider.fetchTree.mockResolvedValue([
      { path: 'src', type: 'directory' },
      { path: 'src/a.ts', type: 'file', sizeBytes: SMALL_FILE_SIZE, sha: 's1' },
      { path: 'src/b.ts', type: 'file', sizeBytes: SMALL_FILE_SIZE, sha: 's2' },
    ]);
    const ctx = await initCtx(deps);
    try {
      await ctx.renameFile('src/a.ts', 'src/b.ts');
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.ALREADY_EXISTS);
    }
  });
}

// ─── renameFile source not found ────────────────────────────────────────────

function describeRenameFileSourceNotFound(): void {
  it('throws FILE_NOT_FOUND when source does not exist', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    try {
      await ctx.renameFile('no/exist.ts', 'src/target.ts');
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.FILE_NOT_FOUND);
    }
  });
}

// ─── renameFile validates both paths ────────────────────────────────────────

function describeRenameFileBothPathsValidated(): void {
  it('rejects absolute newPath', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    try {
      await ctx.renameFile(HELLO_PATH, '/absolute/bad.ts');
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.INVALID_PATH);
    }
  });
}

// ─── createFile already exists ──────────────────────────────────────────────

function describeCreateFileAlreadyExists(): void {
  it('throws ALREADY_EXISTS for existing path', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    try {
      await ctx.createFile(HELLO_PATH, 'new content');
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.ALREADY_EXISTS);
    }
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('VFSContext write operations', () => {
  describe('createFile parent dirs', describeCreateFileParentDirs);
  describe('createFile .env blocked', describeCreateFileProtectedEnv);
  describe('createFile .git blocked', describeCreateFileProtectedGit);
  describe('createFile already exists', describeCreateFileAlreadyExists);
  describe('editFile full_content', describeEditFileFullContent);
  describe('editFile ambiguous match', describeEditFileAmbiguous);
  describe('editFile no params', describeEditFileNoParams);
  describe('deleteFile not found', describeDeleteFileNotFound);
  describe('renameFile target exists', describeRenameFileTargetExists);
  describe('renameFile source not found', describeRenameFileSourceNotFound);
  describe('renameFile validates both paths', describeRenameFileBothPathsValidated);
});
