import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setTimeout as timerDelay } from 'node:timers/promises';

import { VFSError, VFSErrorCode } from '../../types.js';
import { githubFetch, githubFetchRaw, parseRateLimit } from '../githubHttp.js';
import type { GitHubRequestOptions } from '../githubTypes.js';
import { validateUnknown } from '../githubTypes.js';
import {
  CALL_COUNT_ONE,
  CALL_COUNT_TWO,
  FETCH_CALL_FIRST,
  MOCK_DELAY_MS,
  RL_LIMIT,
  RL_REMAINING,
  RL_REMAINING_NONZERO,
  RL_REMAINING_ZERO,
  RL_RESET_EPOCH,
  RL_RESET_EPOCH_MS,
  SMALL_BYTES,
  STATUS_BAD_GATEWAY,
  STATUS_BAD_REQUEST,
  STATUS_FORBIDDEN,
  STATUS_NOT_FOUND,
  STATUS_OK,
  STATUS_TOO_MANY,
  STATUS_UNAUTHORIZED,
  STATUS_UNPROCESSABLE,
  TIMEOUT_MEDIUM,
  TIMEOUT_SHORT,
  TIMEOUT_TEST,
  mockBlobResponse,
  mockResponse,
  rateLimitHeaders,
} from './fetchMock.js';

const COMMIT_SHA = 'abc123def456';
const TEST_URL = 'https://api.github.com/repos/owner/repo/git/trees/abc123';
const TOKEN = 'ghs_test_token';
const FUTURE_OFFSET_S = 600;
const RETRY_AFTER_60 = '60';
const RETRY_AFTER_30 = '30';

let fetchSpy = jest.spyOn(globalThis, 'fetch');
const rlHeaders = rateLimitHeaders(RL_REMAINING, RL_RESET_EPOCH, RL_LIMIT);

function opts(overrides?: Partial<GitHubRequestOptions>): GitHubRequestOptions {
  return { token: TOKEN, url: TEST_URL, commitSha: COMMIT_SHA, timeoutMs: TIMEOUT_MEDIUM, ...overrides };
}

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
});

// ─── Headers ─────────────────────────────────────────────────────────────────

function describeHeaders(): void {
  it('sets JSON Accept for tree requests', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, { ok: true }, rlHeaders));
    await githubFetch(opts(), validateUnknown);
    expect(fetchSpy).toHaveBeenCalledWith(
      TEST_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
      })
    );
  });

  it('sets raw Accept for blob requests', async () => {
    fetchSpy.mockResolvedValueOnce(mockBlobResponse(STATUS_OK, SMALL_BYTES, rlHeaders));
    await githubFetchRaw(opts({ acceptRaw: true }));
    expect(fetchSpy).toHaveBeenCalledWith(
      TEST_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github.raw+json' }),
      })
    );
  });
}

// ─── Rate limit parsing ──────────────────────────────────────────────────────

function describeRateLimit(): void {
  it('parses rate limit headers', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, {}, rlHeaders));
    const result = await githubFetch(opts(), validateUnknown);
    expect(result.rateLimit.remaining).toBe(RL_REMAINING);
    expect(result.rateLimit.resetAt).toEqual(new Date(RL_RESET_EPOCH_MS));
    expect(result.rateLimit.limit).toBe(RL_LIMIT);
  });

  it('defaults when headers are missing', () => {
    const parsed = parseRateLimit(new Headers());
    expect(parsed.remaining).toBe(Infinity);
    expect(parsed.resetAt).toEqual(new Date(FETCH_CALL_FIRST));
    expect(parsed.limit).toBe(Infinity);
  });
}

// ─── Error mapping ───────────────────────────────────────────────────────────

function describe401(): void {
  it('maps 401 to PERMISSION_DENIED', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_UNAUTHORIZED, { message: 'Bad credentials' }));
    await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(
      expect.objectContaining({
        code: VFSErrorCode.PERMISSION_DENIED,
        message: expect.stringContaining('revoked'),
      })
    );
  });
}

function describe403(): void {
  it('maps 403 + ratelimit-remaining 0 to RATE_LIMITED', async () => {
    const futureEpoch = Math.floor((Date.now() / RL_RESET_EPOCH_MS) * RL_RESET_EPOCH) + FUTURE_OFFSET_S;
    const hdrs = rateLimitHeaders(RL_REMAINING_ZERO, futureEpoch, RL_LIMIT);
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_FORBIDDEN, { message: 'limit' }, hdrs));
    await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(
      expect.objectContaining({ code: VFSErrorCode.RATE_LIMITED })
    );
  });

  it('maps 403 + retry-after to RATE_LIMITED (secondary)', async () => {
    const hdrs = {
      'retry-after': RETRY_AFTER_60,
      ...rateLimitHeaders(RL_REMAINING_NONZERO, RL_RESET_EPOCH, RL_LIMIT),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_FORBIDDEN, { message: 'secondary' }, hdrs));
    await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(
      expect.objectContaining({
        code: VFSErrorCode.RATE_LIMITED,
        message: expect.stringContaining('secondary'),
      })
    );
  });

  it('maps 403 + too_large to TOO_LARGE', async () => {
    const body = { message: 'too large', errors: [{ code: 'too_large' }] };
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_FORBIDDEN, body));
    await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(
      expect.objectContaining({ code: VFSErrorCode.TOO_LARGE })
    );
  });

  it('maps 403 generic to PERMISSION_DENIED', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_FORBIDDEN, { message: 'forbidden' }));
    await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(
      expect.objectContaining({
        code: VFSErrorCode.PERMISSION_DENIED,
        message: expect.stringContaining('permissions'),
      })
    );
  });
}

function describe4xx(): void {
  it('maps 404 to FILE_NOT_FOUND', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_NOT_FOUND, { message: 'Not Found' }));
    await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(
      expect.objectContaining({
        code: VFSErrorCode.FILE_NOT_FOUND,
        message: expect.stringContaining(COMMIT_SHA),
      })
    );
  });

  it('maps 422 to INVALID_PARAMETER', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_UNPROCESSABLE, { message: 'Unprocessable' }));
    await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(
      expect.objectContaining({
        code: VFSErrorCode.INVALID_PARAMETER,
        message: expect.stringContaining('commit SHA'),
      })
    );
  });

  it('maps 429 to RATE_LIMITED', async () => {
    const hdrs = { 'retry-after': RETRY_AFTER_30 };
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_TOO_MANY, { message: 'limit' }, hdrs));
    await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(
      expect.objectContaining({
        code: VFSErrorCode.RATE_LIMITED,
        message: expect.stringContaining(RETRY_AFTER_30),
      })
    );
  });
}

// ─── Retry logic ─────────────────────────────────────────────────────────────

function describeRetry(): void {
  it(
    'retries 5xx once then throws PROVIDER_ERROR',
    async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_BAD_GATEWAY, { message: 'Bad Gateway' }));
      fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_BAD_GATEWAY, { message: 'Bad Gateway' }));
      await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(
        expect.objectContaining({ code: VFSErrorCode.PROVIDER_ERROR })
      );
      expect(fetchSpy).toHaveBeenCalledTimes(CALL_COUNT_TWO);
    },
    TIMEOUT_TEST
  );

  it(
    'retries network error then succeeds',
    async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
      fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_OK, { ok: true }, rlHeaders));
      const result = await githubFetch(opts(), validateUnknown);
      expect(result.data).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(CALL_COUNT_TWO);
    },
    TIMEOUT_TEST
  );

  it('does not retry 4xx', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(STATUS_BAD_REQUEST, { message: 'Bad Request' }));
    await expect(githubFetch(opts(), validateUnknown)).rejects.toThrow(VFSError);
    expect(fetchSpy).toHaveBeenCalledTimes(CALL_COUNT_ONE);
  });
}

// ─── Timeout ─────────────────────────────────────────────────────────────────

async function hangingFetch(): Promise<Response> {
  await timerDelay(MOCK_DELAY_MS);
  throw new DOMException('The operation was aborted', 'AbortError');
}

function describeTimeout(): void {
  it(
    'throws PROVIDER_ERROR on timeout',
    async () => {
      fetchSpy.mockImplementation(hangingFetch);
      await expect(githubFetch(opts({ timeoutMs: TIMEOUT_SHORT }), validateUnknown)).rejects.toThrow(
        expect.objectContaining({ code: VFSErrorCode.PROVIDER_ERROR })
      );
    },
    TIMEOUT_TEST
  );
}

// ─── Describe blocks ─────────────────────────────────────────────────────────

describe('githubHttp', () => {
  describe('headers', describeHeaders);
  describe('rate limit parsing', describeRateLimit);
  describe('401', describe401);
  describe('403', describe403);
  describe('4xx', describe4xx);
  describe('retry', describeRetry);
  describe('timeout', describeTimeout);
});
