import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import { describe, expect, it, jest } from '@jest/globals';

import { createConnectionPool } from '../connectionPool.js';
import { buildPoolKey } from '../poolKey.js';

const EXPECT_ONE_CONNECT = 1;
const EXPECT_TWO_CONNECTS = 2;
const EXPECT_ONE_ENTRY = 1;

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

describe('buildPoolKey', () => {
  it('joins parts with ::', () => {
    expect(buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' })).toBe('a::t::b');
  });
});

describe('connectionPool borrow/return', () => {
  it('connects once for the same key across concurrent borrows (shared connecting promise)', async () => {
    const pool = createConnectionPool();
    const connect = jest.fn<() => Promise<McpClientHandle>>(async () => await Promise.resolve(fakeHandle()));
    const key = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });
    const [h1, h2] = await Promise.all([pool.borrow(key, connect), pool.borrow(key, connect)]);
    expect(connect).toHaveBeenCalledTimes(EXPECT_ONE_CONNECT);
    expect(h1).toBe(h2);
    expect(pool.size()).toBe(EXPECT_ONE_ENTRY);
    pool.release(key);
    pool.release(key);
  });

  it('clears the connecting promise on failure so a later borrow retries', async () => {
    const pool = createConnectionPool();
    const connect = jest
      .fn<() => Promise<McpClientHandle>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(fakeHandle());
    const key = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });
    await expect(pool.borrow(key, connect)).rejects.toThrow('boom');
    pool.release(key);
    await expect(pool.borrow(key, connect)).resolves.toBeDefined();
    pool.release(key);
    expect(connect).toHaveBeenCalledTimes(EXPECT_TWO_CONNECTS);
  });

  it('reuses the warm handle on a second borrow without reconnecting', async () => {
    const pool = createConnectionPool();
    const connect = jest.fn<() => Promise<McpClientHandle>>(async () => await Promise.resolve(fakeHandle()));
    const key = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });
    await pool.borrow(key, connect);
    pool.release(key);
    await pool.borrow(key, connect);
    pool.release(key);
    expect(connect).toHaveBeenCalledTimes(EXPECT_ONE_CONNECT);
  });
});
