import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { RateLimitInfo } from '../../types.js';
import { VFSErrorCode } from '../../types.js';
import { fetchGitHubBlob } from '../githubBlob.js';
import type { GitHubSourceConfig } from '../githubTypes.js';
import {
  BINARY_BYTES,
  BYTE_INDEX_0,
  BYTE_INDEX_1,
  BYTE_INDEX_2,
  BYTE_INDEX_3,
  HELLO_BYTES,
  RL_LIMIT,
  RL_REMAINING_LOW,
  RL_RESET_EPOCH,
  SMALL_BYTES,
  STATUS_OK,
  mockBlobResponse,
  rateLimitHeaders,
} from './fetchMock.js';

const TOKEN = 'ghs_test_token';
const OWNER = 'test-owner';
const REPO = 'test-repo';
const COMMIT_SHA = 'abc123';
const RL_HEADERS = rateLimitHeaders(RL_REMAINING_LOW, RL_RESET_EPOCH, RL_LIMIT);
const INITIAL_REMAINING = Infinity;
const INITIAL_EPOCH = 0;

let fetchSpy = jest.spyOn(globalThis, 'fetch');

function makeConfig(): GitHubSourceConfig {
  return { token: TOKEN, owner: OWNER, repo: REPO, commitSha: COMMIT_SHA };
}

function makeRateLimit(): RateLimitInfo {
  return { remaining: INITIAL_REMAINING, resetAt: new Date(INITIAL_EPOCH), limit: INITIAL_REMAINING };
}

function makePathToSha(): Map<string, string> {
  const map = new Map<string, string>();
  map.set('src/app.ts', 'sha-app');
  map.set('readme.md', 'sha-readme');
  return map;
}

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
});

// ─── Happy path ──────────────────────────────────────────────────────────────

function describeHappyPath(): void {
  it('fetches blob content as Uint8Array', async () => {
    fetchSpy.mockResolvedValueOnce(mockBlobResponse(STATUS_OK, HELLO_BYTES, RL_HEADERS));
    const result = await fetchGitHubBlob(makeConfig(), makeRateLimit(), makePathToSha(), 'src/app.ts');
    expect(result).toEqual(HELLO_BYTES);
  });
}

// ─── Validation errors ───────────────────────────────────────────────────────

function describeValidation(): void {
  it('throws INVALID_PARAMETER if pathToSha is null', async () => {
    await expect(fetchGitHubBlob(makeConfig(), makeRateLimit(), null, 'src/app.ts')).rejects.toThrow(
      expect.objectContaining({
        code: VFSErrorCode.INVALID_PARAMETER,
        message: expect.stringContaining('fetchTree()'),
      })
    );
  });

  it('throws FILE_NOT_FOUND if path not in map', async () => {
    await expect(
      fetchGitHubBlob(makeConfig(), makeRateLimit(), makePathToSha(), 'nonexistent.ts')
    ).rejects.toThrow(expect.objectContaining({ code: VFSErrorCode.FILE_NOT_FOUND }));
  });
}

// ─── Rate limit update ───────────────────────────────────────────────────────

function describeRateLimitUpdate(): void {
  it('updates rateLimit from blob response', async () => {
    fetchSpy.mockResolvedValueOnce(mockBlobResponse(STATUS_OK, SMALL_BYTES, RL_HEADERS));
    const rateLimit = makeRateLimit();
    await fetchGitHubBlob(makeConfig(), rateLimit, makePathToSha(), 'src/app.ts');
    expect(rateLimit.remaining).toBe(RL_REMAINING_LOW);
    expect(rateLimit.limit).toBe(RL_LIMIT);
  });
}

// ─── Binary content ──────────────────────────────────────────────────────────

function describeBinaryContent(): void {
  it('handles binary content correctly', async () => {
    fetchSpy.mockResolvedValueOnce(mockBlobResponse(STATUS_OK, BINARY_BYTES, RL_HEADERS));
    const result = await fetchGitHubBlob(makeConfig(), makeRateLimit(), makePathToSha(), 'src/app.ts');
    expect(result[BYTE_INDEX_0]).toBe(BINARY_BYTES[BYTE_INDEX_0]);
    expect(result[BYTE_INDEX_1]).toBe(BINARY_BYTES[BYTE_INDEX_1]);
    expect(result[BYTE_INDEX_2]).toBe(BINARY_BYTES[BYTE_INDEX_2]);
    expect(result[BYTE_INDEX_3]).toBe(BINARY_BYTES[BYTE_INDEX_3]);
  });
}

// ─── Describe blocks ─────────────────────────────────────────────────────────

describe('githubBlob', () => {
  describe('happy path', describeHappyPath);
  describe('validation', describeValidation);
  describe('rate limit update', describeRateLimitUpdate);
  describe('binary content', describeBinaryContent);
});
