// vfsContextDeepRead.test.ts — read-path integration tests for VFSContext
import { describe, expect, it } from '@jest/globals';
import type { jest } from '@jest/globals';

import type { RedisClient, StorageBucketApi, SupabaseVFSClient } from '../types.js';
import { VFSError } from '../types.js';
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
const HELLO_SIZE = 100;
const EXPECTED_ONE = 1;
const EXPECTED_TWO = 2;
const EXPECTED_THREE = 3;
const LINE_CEILING_OVER = 15000;
const MAX_DEPTH_THREE = 3;

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

async function initCtx(
  deps: MockDeps,
  overrides?: Partial<{ readLineCeiling: number }>
): Promise<VFSContext> {
  const ctx = new VFSContext({
    tenantSlug: TENANT,
    agentSlug: AGENT,
    userID: USER,
    sessionId: SESSION,
    commitSha: COMMIT,
    sourceProvider: deps.sourceProvider,
    supabase: deps.supabase,
    redis: deps.redis,
    ...overrides,
  });
  await ctx.initialize();
  return ctx;
}

function setupMultiFileTree(deps: MockDeps): void {
  deps.sourceProvider.fetchTree.mockResolvedValue([
    { path: 'src', type: 'directory' },
    { path: 'src/hello.ts', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
    { path: 'src/utils', type: 'directory' },
    { path: 'src/utils/math.ts', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha2' },
    { path: 'src/utils/string.ts', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha3' },
    { path: 'lib', type: 'directory' },
    { path: 'lib/index.js', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha4' },
    { path: 'README.md', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha5' },
  ]);
}

// ─── listDirectory ──────────────────────────────────────────────────────────

function describeListDirectoryRoot(): void {
  it('rejects empty path for root listing', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps);
    await expect(ctx.listDirectory('')).rejects.toThrow(VFSError);
  });
}

function describeListDirectorySubdir(): void {
  it('lists direct children of a subdirectory', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps);
    const result = await ctx.listDirectory('src');
    const names = result.entries.map((e) => e.name);
    expect(names).toContain('hello.ts');
    expect(names).toContain('utils');
  });
}

function describeListDirectoryRecursive(): void {
  it('lists entries recursively with maxDepth', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps);
    const result = await ctx.listDirectory('src', true, MAX_DEPTH_THREE);
    const names = result.entries.map((e) => e.name);
    expect(names).toContain('math.ts');
    expect(names).toContain('string.ts');
  });
}

// ─── findFiles ──────────────────────────────────────────────────────────────

function describeFindFilesGlob(): void {
  it('finds files matching glob pattern', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps);
    const result = await ctx.findFiles('**/*.ts');
    expect(result.matches).toContain('src/hello.ts');
    expect(result.matches).toContain('src/utils/math.ts');
    expect(result.truncated).toBe(false);
  });
}

function describeFindFilesPathScope(): void {
  it('scopes search to given path', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps);
    const result = await ctx.findFiles('**/*.ts', 'src/utils');
    expect(result.matches).toContain('src/utils/math.ts');
    expect(result.matches).not.toContain('src/hello.ts');
  });
}

function describeFindFilesExclude(): void {
  it('excludes paths matching exclude patterns', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps);
    const result = await ctx.findFiles('**/*.ts', undefined, ['**/utils/**']);
    expect(result.matches).toContain('src/hello.ts');
    expect(result.matches).not.toContain('src/utils/math.ts');
  });
}

function describeFindFilesMaxResults(): void {
  it('truncates results beyond maxResults', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps);
    const result = await ctx.findFiles('**/*', undefined, undefined, EXPECTED_TWO);
    expect(result.matches.length).toBe(EXPECTED_TWO);
    expect(result.truncated).toBe(true);
  });
}

// ─── getFileMetadata ────────────────────────────────────────────────────────

function describeMetadataReadFile(): void {
  it('returns lineCount after file has been read', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await ctx.readFile(HELLO_PATH);
    const meta = await ctx.getFileMetadata(HELLO_PATH);
    expect(meta.lineCount).toBe(EXPECTED_ONE);
    expect(meta.language).toBe('typescript');
    expect(meta.sizeBytes).toBe(HELLO_SIZE);
  });
}

function describeMetadataUnreadFile(): void {
  it('returns lineCount null for unread file', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    const meta = await ctx.getFileMetadata(HELLO_PATH);
    expect(meta.lineCount).toBeNull();
  });
}

function describeMetadataMissing(): void {
  it('throws FILE_NOT_FOUND for missing path', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    await expect(ctx.getFileMetadata('no/such/file.ts')).rejects.toThrow(VFSError);
  });
}

// ─── getFileTree ────────────────────────────────────────────────────────────

function describeFileTree(): void {
  it('returns nested tree structure', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps);
    const result = await ctx.getFileTree();
    expect(result.tree.children).toBeDefined();
    expect(result.tree.type).toBe('directory');
  });
}

// ─── countLines ─────────────────────────────────────────────────────────────

function describeCountLinesTotal(): void {
  it('counts total lines without pattern', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    const result = await ctx.countLines(HELLO_PATH);
    expect(result.totalLines).toBe(EXPECTED_ONE);
    expect(result.matchingLines).toBeUndefined();
  });
}

function describeCountLinesPattern(): void {
  it('counts matching lines with literal pattern', async () => {
    const deps = createMockDeps();
    const multiLine = 'line one\nline two\nother three';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(multiLine));
    const ctx = await initCtx(deps);
    const result = await ctx.countLines(HELLO_PATH, 'line');
    expect(result.totalLines).toBe(EXPECTED_THREE);
    expect(result.matchingLines).toBe(EXPECTED_TWO);
  });
}

function describeCountLinesRegex(): void {
  it('counts matching lines with regex pattern', async () => {
    const deps = createMockDeps();
    const multiLine = 'foo 123\nbar 456\nbaz';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(multiLine));
    const ctx = await initCtx(deps);
    const result = await ctx.countLines(HELLO_PATH, '\\d+', true);
    expect(result.matchingLines).toBe(EXPECTED_TWO);
  });
}

function describeCountLinesBypassesCeiling(): void {
  it('does NOT throw TOO_LARGE for large files', async () => {
    const deps = createMockDeps();
    const big = Array.from({ length: LINE_CEILING_OVER }, (_, i) => `line ${i}`).join('\n');
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(big));
    const ctx = await initCtx(deps);
    const result = await ctx.countLines(HELLO_PATH);
    expect(result.totalLines).toBe(LINE_CEILING_OVER);
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('VFSContext read operations', () => {
  describe('listDirectory root', describeListDirectoryRoot);
  describe('listDirectory subdir', describeListDirectorySubdir);
  describe('listDirectory recursive', describeListDirectoryRecursive);
  describe('findFiles glob', describeFindFilesGlob);
  describe('findFiles path scope', describeFindFilesPathScope);
  describe('findFiles exclude', describeFindFilesExclude);
  describe('findFiles maxResults', describeFindFilesMaxResults);
  describe('getFileMetadata read file', describeMetadataReadFile);
  describe('getFileMetadata unread file', describeMetadataUnreadFile);
  describe('getFileMetadata missing', describeMetadataMissing);
  describe('getFileTree', describeFileTree);
  describe('countLines total', describeCountLinesTotal);
  describe('countLines literal pattern', describeCountLinesPattern);
  describe('countLines regex', describeCountLinesRegex);
  describe('countLines bypasses ceiling', describeCountLinesBypassesCeiling);
});
