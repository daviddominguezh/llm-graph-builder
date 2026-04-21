import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { RateLimitInfo } from '../../types.js';
import { VFSErrorCode } from '../../types.js';
import type { GitHubTreeItem, GitHubTreeResponse } from '../githubTypes.js';
import {
  BFS_OVERFLOW_DEPTH,
  CALL_COUNT_ONE,
  CALL_COUNT_THREE,
  RL_LIMIT,
  RL_REMAINING,
  RL_RESET_EPOCH,
  STATUS_OK,
  mockResponse,
  rateLimitHeaders,
} from './fetchMock.js';

const TOKEN = 'ghs_test_token';
const OWNER = 'test-owner';
const REPO = 'test-repo';
const COMMIT_SHA = 'abc123';
const RL_HEADERS = rateLimitHeaders(RL_REMAINING, RL_RESET_EPOCH, RL_LIMIT);
const SIZE_SMALL = 10;
const SIZE_MEDIUM = 50;
const SIZE_FILE = 100;
const SIZE_LARGE = 200;
const ENTRY_COUNT_TWO = 2;
const ENTRY_COUNT_THREE = 3;
const INITIAL_REMAINING = Infinity;
const INITIAL_EPOCH = 0;
const BFS_LOOP_INCREMENT = 1;

let fetchSpy = jest.spyOn(globalThis, 'fetch');

function makeConfig(): { token: string; owner: string; repo: string; commitSha: string } {
  return { token: TOKEN, owner: OWNER, repo: REPO, commitSha: COMMIT_SHA };
}

function makeRateLimit(): RateLimitInfo {
  return { remaining: INITIAL_REMAINING, resetAt: new Date(INITIAL_EPOCH), limit: INITIAL_REMAINING };
}

function treeResponse(items: GitHubTreeItem[], truncated = false): GitHubTreeResponse {
  return { sha: COMMIT_SHA, url: 'https://api.github.com/test', tree: items, truncated };
}

function blobItem(path: string, sha: string, size: number): GitHubTreeItem {
  return { path, mode: '100644', type: 'blob', sha, size, url: '' };
}

function treeItem(path: string, sha: string): GitHubTreeItem {
  return { path, mode: '040000', type: 'tree', sha, url: '' };
}

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
});

// ─── Recursive success ───────────────────────────────────────────────────────

function describeRecursive(): void {
  it('returns entries when not truncated', async () => {
    const items = [blobItem('src/app.ts', 'sha1', SIZE_LARGE), treeItem('src', 'sha2')];
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse(items, false), RL_HEADERS));
    const { fetchGitHubTree } = await import('../githubTree.js');
    const result = await fetchGitHubTree(makeConfig(), makeRateLimit());
    expect(result.entries).toHaveLength(ENTRY_COUNT_TWO);
    const file = result.entries.find((e) => e.path === 'src/app.ts');
    expect(file?.type).toBe('file');
    expect(file?.sizeBytes).toBe(SIZE_LARGE);
    expect(fetchSpy).toHaveBeenCalledTimes(CALL_COUNT_ONE);
  });
}

// ─── BFS fallback ────────────────────────────────────────────────────────────

function describeBfsFallback(): void {
  it('falls back to BFS on truncation', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(STATUS_OK, treeResponse([blobItem('src/app.ts', 'sha1', SIZE_FILE)], true), RL_HEADERS)
    );
    const rootItems = [treeItem('src', 'dir-sha'), blobItem('readme.md', 'sha-readme', SIZE_MEDIUM)];
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse(rootItems, false), RL_HEADERS));
    fetchSpy.mockResolvedValueOnce(
      mockResponse(STATUS_OK, treeResponse([blobItem('app.ts', 'sha-app', SIZE_LARGE)], false), RL_HEADERS)
    );
    const { fetchGitHubTree } = await import('../githubTree.js');
    const result = await fetchGitHubTree(makeConfig(), makeRateLimit());
    expect(result.entries).toHaveLength(ENTRY_COUNT_THREE);
    expect(result.entries.find((e) => e.path === 'src/app.ts')?.type).toBe('file');
    expect(fetchSpy).toHaveBeenCalledTimes(CALL_COUNT_THREE);
  });
}

// ─── BFS depth limit ─────────────────────────────────────────────────────────

function describeBfsDepthLimit(): void {
  it('throws TOO_LARGE when BFS depth exceeds 20', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse([], true), RL_HEADERS));
    for (let i = INITIAL_EPOCH; i < BFS_OVERFLOW_DEPTH; i += BFS_LOOP_INCREMENT) {
      const item = treeItem(`dir${String(i)}`, `sha-${String(i)}`);
      fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse([item], false), RL_HEADERS));
    }
    const { fetchGitHubTree } = await import('../githubTree.js');
    await expect(fetchGitHubTree(makeConfig(), makeRateLimit())).rejects.toThrow(
      expect.objectContaining({ code: VFSErrorCode.TOO_LARGE })
    );
  });
}

// ─── BFS full paths ──────────────────────────────────────────────────────────

function describeBfsPaths(): void {
  it('builds full paths during BFS', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse([], true), RL_HEADERS));
    const rootItems = [treeItem('dir-a', 'sha-dir-a'), blobItem('file-b', 'sha-file-b', SIZE_SMALL)];
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse(rootItems, false), RL_HEADERS));
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        STATUS_OK,
        treeResponse([blobItem('nested.ts', 'sha-nested', SIZE_MEDIUM)], false),
        RL_HEADERS
      )
    );
    const { fetchGitHubTree } = await import('../githubTree.js');
    const result = await fetchGitHubTree(makeConfig(), makeRateLimit());
    const nested = result.entries.find((e) => e.path === 'dir-a/nested.ts');
    expect(nested?.type).toBe('file');
    expect(nested?.sha).toBe('sha-nested');
  });
}

// ─── Rate limit + empty + pathToSha ──────────────────────────────────────────

function describeRateLimitAndMap(): void {
  it('updates rateLimit from API response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(STATUS_OK, treeResponse([blobItem('a.ts', 'sha1', SIZE_SMALL)], false), RL_HEADERS)
    );
    const rateLimit = makeRateLimit();
    const { fetchGitHubTree } = await import('../githubTree.js');
    await fetchGitHubTree(makeConfig(), rateLimit);
    expect(rateLimit.remaining).toBe(RL_REMAINING);
    expect(rateLimit.limit).toBe(RL_LIMIT);
  });

  it('returns empty entries for empty repository', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse([], false), RL_HEADERS));
    const { fetchGitHubTree } = await import('../githubTree.js');
    const result = await fetchGitHubTree(makeConfig(), makeRateLimit());
    expect(result.entries).toHaveLength(INITIAL_EPOCH);
    expect(result.pathToSha.size).toBe(INITIAL_EPOCH);
  });

  it('populates pathToSha for blob entries only', async () => {
    const items = [blobItem('src/app.ts', 'sha-app', SIZE_LARGE), treeItem('src', 'sha-src')];
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse(items, false), RL_HEADERS));
    const { fetchGitHubTree } = await import('../githubTree.js');
    const result = await fetchGitHubTree(makeConfig(), makeRateLimit());
    expect(result.pathToSha.get('src/app.ts')).toBe('sha-app');
    expect(result.pathToSha.has('src')).toBe(false);
  });
}

// ─── Describe blocks ─────────────────────────────────────────────────────────

describe('githubTree', () => {
  describe('recursive success', describeRecursive);
  describe('BFS fallback', describeBfsFallback);
  describe('BFS depth limit', describeBfsDepthLimit);
  describe('BFS full paths', describeBfsPaths);
  describe('rate limit and pathToSha', describeRateLimitAndMap);
});
