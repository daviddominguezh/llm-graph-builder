import type { OAuthTokenBundle } from '@daviddh/llm-graph-runner';
import { describe, expect, it, jest } from '@jest/globals';

import { refreshWithSingleFlight } from '../refreshSingleFlight.js';

/* ─── Constants ─── */

const TEN_SECONDS_MS = 10_000;
const NOW_PLUS_10S = Date.now() + TEN_SECONDS_MS;
const RETRY_DELAY_FAST = 1;
const RETRY_LIMIT_SMALL = 3;
const RETRY_LIMIT_MEDIUM = 5;
const SECOND_CALL = 2;
const DEL_RESULT = 1;
const INCREMENT = 1;

/* ─── Types ─── */

interface FakeRedis {
  set: jest.Mock<(key: string, value: string, opts?: object) => Promise<unknown>>;
  del: jest.Mock<(key: string) => Promise<number>>;
  get: jest.Mock<(key: string) => Promise<string | null>>;
  setex: jest.Mock<(key: string, ttl: number, value: string) => Promise<unknown>>;
}

/* ─── Helpers ─── */

function makeRedis(setReturn: unknown): FakeRedis {
  const set: FakeRedis['set'] = jest.fn();
  const del: FakeRedis['del'] = jest.fn();
  const get: FakeRedis['get'] = jest.fn();
  const setex: FakeRedis['setex'] = jest.fn();
  set.mockResolvedValue(setReturn);
  del.mockResolvedValue(DEL_RESULT);
  return { set, del, get, setex };
}

/* ─── lock acquired ─── */

describe('refreshWithSingleFlight — lock acquired', () => {
  it('runs refresh inside the lock when SETNX succeeds', async () => {
    const fresh: OAuthTokenBundle = {
      accessToken: 'new',
      expiresAt: NOW_PLUS_10S,
      tokenIssuedAt: Date.now(),
    };
    const refresh: jest.Mock<() => Promise<OAuthTokenBundle>> = jest.fn();
    const reread: jest.Mock<() => Promise<OAuthTokenBundle | null>> = jest.fn();
    refresh.mockResolvedValue(fresh);
    reread.mockResolvedValue(null);
    const fakeRedis = makeRedis('OK');
    const result = await refreshWithSingleFlight({
      redis: fakeRedis,
      lockKey: 'oauth:lock:v1:org:calendar',
      reread,
      doRefresh: refresh,
    });
    expect(refresh).toHaveBeenCalled();
    expect(fakeRedis.del).toHaveBeenCalledWith('oauth:lock:v1:org:calendar');
    expect(result.accessToken).toBe('new');
  });
});

/* ─── lock contended — happy path ─── */

describe('refreshWithSingleFlight — lock contended (happy)', () => {
  it('waits + re-reads when SETNX returns null', async () => {
    const fresh: OAuthTokenBundle = {
      accessToken: 'fresh',
      expiresAt: NOW_PLUS_10S,
      tokenIssuedAt: Date.now(),
    };
    let calls = 0;
    const reread: jest.Mock<() => Promise<OAuthTokenBundle | null>> = jest.fn();
    reread.mockImplementation(async () => {
      calls += INCREMENT;
      return await Promise.resolve(calls < SECOND_CALL ? null : fresh);
    });
    const doRefresh: jest.Mock<() => Promise<OAuthTokenBundle>> = jest.fn();
    doRefresh.mockRejectedValue(new Error('should not refresh'));
    const fakeRedis = makeRedis(null);
    const result = await refreshWithSingleFlight({
      redis: fakeRedis,
      lockKey: 'k',
      reread,
      doRefresh,
      retryDelayMs: RETRY_DELAY_FAST,
      retryLimit: RETRY_LIMIT_MEDIUM,
    });
    expect(result.accessToken).toBe('fresh');
  });
});

/* ─── lock contended — exhausted ─── */

describe('refreshWithSingleFlight — lock contended (exhausted)', () => {
  it('throws after retryLimit exhausted', async () => {
    const reread: jest.Mock<() => Promise<OAuthTokenBundle | null>> = jest.fn();
    const doRefresh: jest.Mock<() => Promise<OAuthTokenBundle>> = jest.fn();
    reread.mockResolvedValue(null);
    doRefresh.mockRejectedValue(new Error('should not refresh'));
    const fakeRedis = makeRedis(null);
    await expect(
      refreshWithSingleFlight({
        redis: fakeRedis,
        lockKey: 'k',
        reread,
        doRefresh,
        retryDelayMs: RETRY_DELAY_FAST,
        retryLimit: RETRY_LIMIT_SMALL,
      })
    ).rejects.toThrow();
  });
});
