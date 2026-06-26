import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import { describe, expect, it, jest } from '@jest/globals';

import { createConnectionPool } from '../connectionPool.js';
import { newEntry, validateOrReconnect } from '../poolEntry.js';
import { buildPoolKey } from '../poolKey.js';

const IDLE_TTL_MS = 100;
const T_INITIAL = 1_000;
const T_EXPIRED = 2_000;
const T_FAR = 9_999;
const T_ONE = 1;
const T_TEN = 10;
const T_TWENTY = 20;
const MAX_ONE = 1;
const EXPECT_ONE_CALL = 1;
const NO_CALLS = 0;

const INIT: McpClientHandle['initialized'] = {
  protocolVersion: '2024-11-05',
  serverInfo: { name: 'x', version: '1' },
  capabilities: {},
};

function fakeHandle(closeSpy?: () => Promise<void>): McpClientHandle {
  return {
    initialized: INIT,
    sessionId: null,
    listTools: async () => await Promise.resolve([]),
    callTool: async () => await Promise.resolve({ content: [] }),
    close:
      closeSpy ??
      (async () => {
        await Promise.resolve();
      }),
  };
}

function resolvedClose(): jest.Mock<() => Promise<void>> {
  return jest.fn<() => Promise<void>>(async () => {
    await Promise.resolve();
  });
}

describe('eviction TTL', () => {
  it('evicts the idle-expired entry and closes its handle', async () => {
    let clock = T_INITIAL;
    const pool = createConnectionPool({ idleTtlMs: IDLE_TTL_MS, now: () => clock });
    const closed = resolvedClose();
    const key = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });
    await pool.borrow(key, async () => await Promise.resolve(fakeHandle(closed)));
    pool.release(key);
    clock = T_EXPIRED; // > idleTtlMs past lastUsed
    await pool.evict();
    expect(pool.has(key)).toBe(false);
    expect(closed).toHaveBeenCalledTimes(EXPECT_ONE_CALL);
  });

  it('never evicts a borrowed (in-flight) entry even when idle-expired', async () => {
    let clock = T_INITIAL;
    const pool = createConnectionPool({ idleTtlMs: IDLE_TTL_MS, now: () => clock });
    const key = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });
    await pool.borrow(key, async () => await Promise.resolve(fakeHandle())); // borrowed, not released
    clock = T_FAR;
    await pool.evict();
    expect(pool.has(key)).toBe(true);
  });
});

describe('eviction LRU caps', () => {
  it('caps stdio entries tighter than http', async () => {
    const pool = createConnectionPool({ maxStdioEntries: MAX_ONE, now: () => T_ONE });
    const k1 = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 's1' });
    const k2 = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 's2' });
    await pool.borrowStdio(k1, async () => await Promise.resolve(fakeHandle()));
    pool.release(k1);
    await pool.borrowStdio(k2, async () => await Promise.resolve(fakeHandle()));
    pool.release(k2);
    await pool.evict();
    expect(pool.entries().size).toBeLessThanOrEqual(MAX_ONE);
  });

  it('evicts the LRU http entry first when over the http cap', async () => {
    let clock = T_ONE;
    const pool = createConnectionPool({ maxEntries: MAX_ONE, idleTtlMs: T_FAR, now: () => clock });
    const k1 = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'h1' });
    const k2 = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'h2' });
    clock = T_TEN;
    await pool.borrow(k1, async () => await Promise.resolve(fakeHandle()));
    pool.release(k1);
    clock = T_TWENTY;
    await pool.borrow(k2, async () => await Promise.resolve(fakeHandle()));
    pool.release(k2);
    await pool.evict();
    expect(pool.has(k1)).toBe(false); // older lastUsed → LRU victim
    expect(pool.has(k2)).toBe(true);
  });
});

describe('validateOrReconnect', () => {
  it('returns the existing handle when healthy without reconnecting', async () => {
    const entry = newEntry(false);
    const existing = fakeHandle();
    entry.handle = existing;
    const connect = jest.fn<() => Promise<McpClientHandle>>(
      async () => await Promise.resolve(fakeHandle())
    );
    const handle = await validateOrReconnect(entry, connect, async () => await Promise.resolve(true));
    expect(handle).toBe(existing);
    expect(connect).toHaveBeenCalledTimes(NO_CALLS);
  });

  it('closes the stale handle and reconnects once when unhealthy', async () => {
    const entry = newEntry(false);
    const closed = resolvedClose();
    entry.handle = fakeHandle(closed);
    const fresh = fakeHandle();
    const connect = jest.fn<() => Promise<McpClientHandle>>(async () => await Promise.resolve(fresh));
    const handle = await validateOrReconnect(entry, connect, async () => await Promise.resolve(false));
    expect(closed).toHaveBeenCalledTimes(EXPECT_ONE_CALL);
    expect(connect).toHaveBeenCalledTimes(EXPECT_ONE_CALL);
    expect(handle).toBe(fresh);
    expect(entry.handle).toBe(fresh);
  });

  it('connects when there is no handle yet', async () => {
    const entry = newEntry(false);
    const fresh = fakeHandle();
    const connect = jest.fn<() => Promise<McpClientHandle>>(async () => await Promise.resolve(fresh));
    const isHealthy = jest.fn<(h: McpClientHandle) => Promise<boolean>>(
      async () => await Promise.resolve(true)
    );
    const handle = await validateOrReconnect(entry, connect, isHealthy);
    expect(isHealthy).toHaveBeenCalledTimes(NO_CALLS);
    expect(connect).toHaveBeenCalledTimes(EXPECT_ONE_CALL);
    expect(handle).toBe(fresh);
  });
});
