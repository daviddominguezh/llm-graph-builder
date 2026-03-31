import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { VFSErrorCode } from '../../types.js';
import { GitHubSourceProvider } from '../githubSourceProvider.js';
import type { GitHubSourceConfig, GitHubTreeItem, GitHubTreeResponse } from '../githubTypes.js';
import {
  CALL_COUNT_TWO,
  HELLO_BYTES,
  RL_LIMIT,
  RL_REMAINING,
  RL_REMAINING_LOW,
  RL_RESET_EPOCH,
  SMALL_BYTES,
  STATUS_BAD_GATEWAY,
  STATUS_OK,
  STATUS_UNAUTHORIZED,
  TIMEOUT_TEST,
  mockBlobResponse,
  mockResponse,
  rateLimitHeaders,
} from './fetchMock.js';

const COMMIT_SHA = 'abc123def456';
const RL_HEADERS = rateLimitHeaders(RL_REMAINING, RL_RESET_EPOCH, RL_LIMIT);
const INITIAL_EPOCH = 0;
const RL_RESET_UPDATED = 1700000100;
const SIZE_FILE = 200;
const ENTRY_COUNT_TWO = 2;

let fetchSpy = jest.spyOn(globalThis, 'fetch');

function makeConfig(): GitHubSourceConfig {
  return { token: 'ghs_test', owner: 'test-owner', repo: 'test-repo', commitSha: COMMIT_SHA };
}

function blobItem(path: string, sha: string, size: number): GitHubTreeItem {
  return { path, mode: '100644', type: 'blob', sha, size, url: '' };
}

function treeItem(path: string, sha: string): GitHubTreeItem {
  return { path, mode: '040000', type: 'tree', sha, url: '' };
}

function treeResponse(truncated = false): GitHubTreeResponse {
  return {
    sha: COMMIT_SHA,
    url: 'https://api.github.com/test',
    tree: [blobItem('src/app.ts', 'sha-app', SIZE_FILE), treeItem('src', 'sha-src')],
    truncated,
  };
}

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
});

// ─── Constructor ─────────────────────────────────────────────────────────────

function describeConstructor(): void {
  it('sets commitSha and initializes rateLimit', () => {
    const provider = new GitHubSourceProvider(makeConfig());
    expect(provider.commitSha).toBe(COMMIT_SHA);
    expect(provider.rateLimit.remaining).toBe(Infinity);
    expect(provider.rateLimit.resetAt).toEqual(new Date(INITIAL_EPOCH));
    expect(provider.rateLimit.limit).toBe(Infinity);
  });
}

// ─── fetchTree ───────────────────────────────────────────────────────────────

function describeFetchTree(): void {
  it('returns TreeEntry[] and updates rateLimit', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse(false), RL_HEADERS));
    const provider = new GitHubSourceProvider(makeConfig());
    const entries = await provider.fetchTree();
    expect(entries).toHaveLength(ENTRY_COUNT_TWO);
    expect(entries.find((e) => e.path === 'src/app.ts')?.type).toBe('file');
    expect(provider.rateLimit.remaining).toBe(RL_REMAINING);
  });

  it('handles truncation with BFS fallback', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse(true), RL_HEADERS));
    const rootTree: GitHubTreeResponse = {
      sha: COMMIT_SHA,
      url: '',
      tree: [treeItem('src', 'sha-src')],
      truncated: false,
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, rootTree, RL_HEADERS));
    const srcTree: GitHubTreeResponse = {
      sha: 'sha-src',
      url: '',
      tree: [blobItem('app.ts', 'sha-app', SIZE_FILE)],
      truncated: false,
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, srcTree, RL_HEADERS));
    const provider = new GitHubSourceProvider(makeConfig());
    const entries = await provider.fetchTree();
    expect(entries).toHaveLength(ENTRY_COUNT_TWO);
    expect(entries.find((e) => e.path === 'src/app.ts')?.type).toBe('file');
  });
}

// ─── fetchFileContent ────────────────────────────────────────────────────────

function describeFetchFileContent(): void {
  it('returns Uint8Array for known path', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse(false), RL_HEADERS));
    const provider = new GitHubSourceProvider(makeConfig());
    await provider.fetchTree();
    fetchSpy.mockResolvedValueOnce(mockBlobResponse(STATUS_OK, HELLO_BYTES, RL_HEADERS));
    const result = await provider.fetchFileContent('src/app.ts');
    expect(result).toEqual(HELLO_BYTES);
  });

  it('throws INVALID_PARAMETER before fetchTree', async () => {
    const provider = new GitHubSourceProvider(makeConfig());
    await expect(provider.fetchFileContent('src/app.ts')).rejects.toThrow(
      expect.objectContaining({ code: VFSErrorCode.INVALID_PARAMETER })
    );
  });

  it('throws FILE_NOT_FOUND for unknown path', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse(false), RL_HEADERS));
    const provider = new GitHubSourceProvider(makeConfig());
    await provider.fetchTree();
    await expect(provider.fetchFileContent('nonexistent.ts')).rejects.toThrow(
      expect.objectContaining({ code: VFSErrorCode.FILE_NOT_FOUND })
    );
  });
}

// ─── rateLimit + errors ──────────────────────────────────────────────────────

function describeRateLimitAndErrors(): void {
  it('updates rateLimit after every call', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, treeResponse(false), RL_HEADERS));
    const provider = new GitHubSourceProvider(makeConfig());
    await provider.fetchTree();
    expect(provider.rateLimit.remaining).toBe(RL_REMAINING);
    const newRl = rateLimitHeaders(RL_REMAINING_LOW, RL_RESET_UPDATED, RL_LIMIT);
    fetchSpy.mockResolvedValueOnce(mockBlobResponse(STATUS_OK, SMALL_BYTES, newRl));
    await provider.fetchFileContent('src/app.ts');
    expect(provider.rateLimit.remaining).toBe(RL_REMAINING_LOW);
  });

  it('propagates 401 as PERMISSION_DENIED', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_UNAUTHORIZED, { message: 'Bad credentials' }));
    const provider = new GitHubSourceProvider(makeConfig());
    await expect(provider.fetchTree()).rejects.toThrow(
      expect.objectContaining({ code: VFSErrorCode.PERMISSION_DENIED })
    );
  });

  it(
    'retries 5xx once then throws PROVIDER_ERROR',
    async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_BAD_GATEWAY, { message: 'Bad Gateway' }));
      fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_BAD_GATEWAY, { message: 'Bad Gateway' }));
      const provider = new GitHubSourceProvider(makeConfig());
      await expect(provider.fetchTree()).rejects.toThrow(
        expect.objectContaining({ code: VFSErrorCode.PROVIDER_ERROR })
      );
      expect(fetchSpy).toHaveBeenCalledTimes(CALL_COUNT_TWO);
    },
    TIMEOUT_TEST
  );
}

// ─── Describe blocks ─────────────────────────────────────────────────────────

describe('GitHubSourceProvider', () => {
  describe('constructor', describeConstructor);
  describe('fetchTree', describeFetchTree);
  describe('fetchFileContent', describeFetchFileContent);
  describe('rateLimit and errors', describeRateLimitAndErrors);
});
