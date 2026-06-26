import { describe, expect, it, jest } from '@jest/globals';

import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import { SessionExpiredError } from '@daviddh/llm-graph-runner';

import { type ConnectEntryDeps, connectEntry } from '../connectEntry.js';

const EXPECT_TWO_ATTEMPTS = 2;
const EXPECT_TWO_RESOLVES = 2;

const httpServer: McpServerConfig = {
  id: 'b',
  name: 'srv',
  enabled: true,
  transport: { type: 'http', url: 'https://srv.test/mcp' },
};

function isHandle(value: unknown): value is McpClientHandle {
  return typeof value === 'object' && value !== null && 'close' in value;
}

function handle(): McpClientHandle {
  const stub = {
    close: async (): Promise<void> => {
      await Promise.resolve();
    },
  };
  if (!isHandle(stub)) throw new Error('stub is not an McpClientHandle');
  return stub;
}

async function noop(): Promise<void> {
  await Promise.resolve();
}

/** deps whose `connect` fails with SessionExpiredError on the first call, succeeds after. */
function expireOnceDeps(attempts: string[], resolveToken: ConnectEntryDeps['resolveToken']): ConnectEntryDeps {
  return {
    assertEgress: noop,
    resolveToken,
    connect: async () => {
      attempts.push('try');
      if (attempts.length === EXPECT_TWO_ATTEMPTS) return await Promise.resolve(handle());
      throw new SessionExpiredError();
    },
  };
}

describe('connectEntry', () => {
  it('runs egress guard before connecting', async () => {
    const order: string[] = [];
    const deps: ConnectEntryDeps = {
      assertEgress: async () => {
        order.push('egress');
        await Promise.resolve();
      },
      resolveToken: async () => await Promise.resolve(null),
      connect: async () => {
        order.push('connect');
        return await Promise.resolve(handle());
      },
    };
    await connectEntry(httpServer, deps);
    expect(order).toEqual(['egress', 'connect']);
  });

  it('on SessionExpiredError during connect, refreshes token and reconnects once', async () => {
    const attempts: string[] = [];
    const resolveToken = jest.fn<() => Promise<string | null>>(
      async () => await Promise.resolve(`tok${attempts.length}`)
    );
    const h = await connectEntry(httpServer, expireOnceDeps(attempts, resolveToken));
    expect(h).toBeDefined();
    expect(attempts).toHaveLength(EXPECT_TWO_ATTEMPTS);
    expect(resolveToken).toHaveBeenCalledTimes(EXPECT_TWO_RESOLVES);
  });

  it('does not retry more than once (re-throws a second failure)', async () => {
    const deps: ConnectEntryDeps = {
      assertEgress: noop,
      resolveToken: async () => await Promise.resolve('tok'),
      connect: async () => {
        await Promise.resolve();
        throw new SessionExpiredError();
      },
    };
    await expect(connectEntry(httpServer, deps)).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
