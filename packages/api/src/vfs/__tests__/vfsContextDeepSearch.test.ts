// vfsContextDeepSearch.test.ts — searchText/searchSymbol/readFile range tests
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
const HELLO_SIZE = 100;
const EXPECTED_ZERO = 0;
const EXPECTED_ONE = 1;
const EXPECTED_TWO = 2;
const EXPECTED_FOUR = 4;
const LINE_CEILING_OVER = 15000;

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

function setupMultiFileTree(deps: MockDeps): void {
  deps.sourceProvider.fetchTree.mockResolvedValue([
    { path: 'src', type: 'directory' },
    { path: 'src/hello.ts', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha1' },
    { path: 'src/utils', type: 'directory' },
    { path: 'src/utils/math.ts', type: 'file', sizeBytes: HELLO_SIZE, sha: 'sha2' },
  ]);
}

async function initCtx(
  deps: MockDeps,
  overrides?: Partial<{ readLineCeiling: number; searchCandidateLimit: number }>
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

function assertVFSError(err: unknown, expectedCode: VFSErrorCode): void {
  expect(err).toBeInstanceOf(VFSError);
  if (err instanceof VFSError) {
    expect(err.code).toBe(expectedCode);
  }
}

// ─── searchText ─────────────────────────────────────────────────────────────

function describeSearchTextLiteral(): void {
  it('finds literal text matches', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    const result = await ctx.searchText({ pattern: 'hello' });
    expect(result.matches.length).toBeGreaterThanOrEqual(EXPECTED_ONE);
    expect(result.matches[EXPECTED_ZERO]?.content).toContain('hello');
  });
}

function describeSearchTextIgnoreCase(): void {
  it('finds matches case-insensitively', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    const result = await ctx.searchText({ pattern: 'HELLO', ignoreCase: true });
    expect(result.matches.length).toBeGreaterThanOrEqual(EXPECTED_ONE);
  });
}

function describeSearchTextMaxResults(): void {
  it('truncates results when exceeding maxResults', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const multiMatch = 'log log log\nlog log';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(multiMatch));
    const ctx = await initCtx(deps);
    const result = await ctx.searchText({ pattern: 'log', maxResults: EXPECTED_TWO });
    expect(result.matches.length).toBe(EXPECTED_TWO);
    expect(result.truncated).toBe(true);
  });
}

function describeSearchTextContext(): void {
  it('returns context lines around matches', async () => {
    const deps = createMockDeps();
    const lines = 'aaa\nbbb\nccc\nddd\neee';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(lines));
    const ctx = await initCtx(deps);
    const { matches } = await ctx.searchText({ pattern: 'ccc' });
    expect(matches[EXPECTED_ZERO]?.contextBefore).toContain('aaa');
    expect(matches[EXPECTED_ZERO]?.contextBefore).toContain('bbb');
    expect(matches[EXPECTED_ZERO]?.contextAfter).toContain('ddd');
    expect(matches[EXPECTED_ZERO]?.contextAfter).toContain('eee');
  });
}

function describeSearchTextRegex(): void {
  it('finds matches using regex pattern', async () => {
    const deps = createMockDeps();
    const content = 'foo bar\nbaz 123\nqux 456';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(content));
    const ctx = await initCtx(deps);
    const result = await ctx.searchText({ pattern: '\\d+', isRegex: true });
    expect(result.matches.length).toBe(EXPECTED_TWO);
  });
}

function describeSearchTextIncludeGlob(): void {
  it('filters candidates by includeGlob', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps);
    const result = await ctx.searchText({ pattern: 'hello', includeGlob: '**/utils/**' });
    const paths = result.matches.map((m) => m.path);
    expect(paths.every((p) => p.includes('utils'))).toBe(true);
  });
}

function describeSearchTextTooManyCandidates(): void {
  it('throws TOO_LARGE when candidates exceed limit', async () => {
    const deps = createMockDeps();
    setupMultiFileTree(deps);
    const ctx = await initCtx(deps, { searchCandidateLimit: EXPECTED_ONE });
    try {
      await ctx.searchText({ pattern: 'hello' });
      expect(true).toBe(false);
    } catch (err) {
      assertVFSError(err, VFSErrorCode.TOO_LARGE);
    }
  });
}

// ─── searchSymbol ───────────────────────────────────────────────────────────

function describeSearchSymbol(): void {
  it('returns empty matches without crashing', async () => {
    const deps = createMockDeps();
    const ctx = await initCtx(deps);
    const result = ctx.searchSymbol('MyClass');
    expect(result.name).toBe('MyClass');
    expect(result.matches).toEqual([]);
  });
}

// ─── readFile with start/end ────────────────────────────────────────────────

function describeReadFileRange(): void {
  it('returns a specific line range', async () => {
    const deps = createMockDeps();
    const lines = 'one\ntwo\nthree\nfour\nfive';
    deps.sourceProvider.fetchFileContent.mockResolvedValue(new TextEncoder().encode(lines));
    const ctx = await initCtx(deps, { readLineCeiling: LINE_CEILING_OVER });
    const result = await ctx.readFile(HELLO_PATH, EXPECTED_TWO, EXPECTED_FOUR);
    expect(result.startLine).toBe(EXPECTED_TWO);
    expect(result.content).toBe('two\nthree\nfour');
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('VFSContext search and range', () => {
  describe('searchText literal', describeSearchTextLiteral);
  describe('searchText ignoreCase', describeSearchTextIgnoreCase);
  describe('searchText maxResults', describeSearchTextMaxResults);
  describe('searchText context lines', describeSearchTextContext);
  describe('searchText regex', describeSearchTextRegex);
  describe('searchText includeGlob', describeSearchTextIncludeGlob);
  describe('searchText too many candidates', describeSearchTextTooManyCandidates);
  describe('searchSymbol stub', describeSearchSymbol);
  describe('readFile line range', describeReadFileRange);
});
