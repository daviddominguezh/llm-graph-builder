import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createConnectionPool, startKeepalive } from '../connectionPool.js';
import type { PoolEntry } from '../poolKey.js';
import { buildPoolKey } from '../poolKey.js';

const NOW = 1;
const INTERVAL_MS = 1_000;
const NO_JITTER = 0;
const LONG_MS = 5_000;
const EXPECT_ONE_TICK = 1;
const EXPECT_TWO_TICKS = 2;
const NO_TICKS = 0;

const INIT: McpClientHandle['initialized'] = {
  protocolVersion: '2024-11-05',
  serverInfo: { name: 'x', version: '1' },
  capabilities: {},
};

function fakeHandle(): McpClientHandle {
  return {
    initialized: INIT,
    sessionId: null,
    listTools: async () => await Promise.resolve([]),
    callTool: async () => await Promise.resolve({ content: [] }),
    close: async () => {
      await Promise.resolve();
    },
  };
}

function okPing(): jest.Mock<(entry: PoolEntry) => Promise<void>> {
  return jest.fn<(entry: PoolEntry) => Promise<void>>(async () => {
    await Promise.resolve();
  });
}

const KEY = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });

describe('startKeepalive', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pings idle warm entries on each interval and stops on the returned fn', async () => {
    const pool = createConnectionPool({ now: () => NOW });
    await pool.borrow(KEY, async () => await Promise.resolve(fakeHandle()));
    pool.release(KEY);
    const ping = okPing();
    const stop = startKeepalive(pool, ping, { intervalMs: INTERVAL_MS, jitterMs: NO_JITTER });

    await jest.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(ping).toHaveBeenCalledTimes(EXPECT_ONE_TICK);
    await jest.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(ping).toHaveBeenCalledTimes(EXPECT_TWO_TICKS);

    stop();
    await jest.advanceTimersByTimeAsync(LONG_MS);
    expect(ping).toHaveBeenCalledTimes(EXPECT_TWO_TICKS);
  });

  it('skips borrowed (in-flight) entries', async () => {
    const pool = createConnectionPool({ now: () => NOW });
    await pool.borrow(KEY, async () => await Promise.resolve(fakeHandle())); // borrowed, not released
    const ping = okPing();
    const stop = startKeepalive(pool, ping, { intervalMs: INTERVAL_MS, jitterMs: NO_JITTER });

    await jest.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(ping).toHaveBeenCalledTimes(NO_TICKS);
    stop();
  });
});

describe('startKeepalive resilience', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('swallows ping failures so the loop keeps running', async () => {
    const pool = createConnectionPool({ now: () => NOW });
    await pool.borrow(KEY, async () => await Promise.resolve(fakeHandle()));
    pool.release(KEY);
    const ping = jest
      .fn<(entry: PoolEntry) => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    const stop = startKeepalive(pool, ping, { intervalMs: INTERVAL_MS, jitterMs: NO_JITTER });

    await jest.advanceTimersByTimeAsync(INTERVAL_MS);
    await jest.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(ping).toHaveBeenCalledTimes(EXPECT_TWO_TICKS);
    stop();
  });
});
