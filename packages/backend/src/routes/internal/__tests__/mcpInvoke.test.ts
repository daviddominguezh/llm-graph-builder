import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import { describe, expect, it } from '@jest/globals';

import { createConnectionPool } from '../../../mcp/pool/connectionPool.js';
import { type InvokeDeps, type InvokeOutcome, invokeMcp } from '../mcpInvoke.js';

const INIT: McpClientHandle['initialized'] = {
  protocolVersion: '2024-11-05',
  serverInfo: { name: 'x', version: '1' },
  capabilities: {},
};

const server: McpServerConfig = {
  id: 'srv1',
  name: 'srv',
  enabled: true,
  transport: { type: 'http', url: 'https://srv.test/mcp' },
};

function handle(callTool: McpClientHandle['callTool']): McpClientHandle {
  return {
    initialized: INIT,
    sessionId: null,
    listTools: async () => await Promise.resolve([]),
    callTool,
    close: async () => {
      await Promise.resolve();
    },
  };
}

function baseDeps(over: Partial<InvokeDeps> = {}): InvokeDeps {
  return {
    pool: createConnectionPool(),
    resolveBinding: async () => await Promise.resolve({ orgId: 'org1', server }),
    revalidateEgress: async () => {
      await Promise.resolve();
    },
    isHealthy: async () => await Promise.resolve(true),
    connect: async () => await Promise.resolve(handle(async () => await Promise.resolve({ content: [] }))),
    ...over,
  };
}

const baseArgs = { agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', toolName: 'do', args: {} };

const FIRST_CONNECT = 1;
const NONE = 0;

async function run(over: Partial<InvokeDeps> = {}): Promise<InvokeOutcome> {
  return await invokeMcp({ ...baseArgs, deps: baseDeps(over) });
}

async function reject(message: string): Promise<never> {
  await Promise.resolve();
  throw new Error(message);
}

describe('invokeMcp — success path', () => {
  it('borrows, calls the tool, and returns the result', async () => {
    const out = await run({
      connect: async () =>
        await Promise.resolve(handle(async () => await Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }))),
    });
    expect(out).toEqual({ kind: 'result', result: { content: [{ type: 'text', text: 'ok' }] } });
  });

  it('re-validates egress on borrow before calling the tool', async () => {
    const order: string[] = [];
    const out = await run({
      revalidateEgress: async () => {
        order.push('egress');
        await Promise.resolve();
      },
      connect: async () =>
        await Promise.resolve(
          handle(async () => {
            order.push('call');
            return await Promise.resolve({ content: [] });
          })
        ),
    });
    expect(out.kind).toBe('result');
    expect(order).toEqual(['egress', 'call']);
  });
});

describe('invokeMcp — failure boundary', () => {
  it('returns uncertain_outcome when callTool fails AFTER the request was sent', async () => {
    const out = await run({
      connect: async () => await Promise.resolve(handle(async () => await reject('socket hang up mid-exec'))),
    });
    expect(out).toEqual({ kind: 'tool_error', category: 'uncertain_outcome' });
  });

  it('does NOT mark uncertain_outcome when connect fails before the tool runs (pre-exec)', async () => {
    const out = await run({ connect: async () => await reject('connection refused') });
    expect(out).toEqual({ kind: 'tool_error', category: 'transport' });
  });

  it('rejects with transport when egress re-validation blocks the server', async () => {
    const out = await run({ revalidateEgress: async () => await reject('EgressBlocked') });
    expect(out).toEqual({ kind: 'tool_error', category: 'transport' });
  });

  it('maps a binding resolution failure to category binding', async () => {
    const out = await run({ resolveBinding: async () => await reject('binding not found') });
    expect(out).toEqual({ kind: 'tool_error', category: 'binding' });
  });

  it('releases the borrow when the on-borrow reconnect fails (no leaked refcount)', async () => {
    const pool = createConnectionPool();
    let connects = 0;
    const connect = async (): Promise<McpClientHandle> => {
      connects += FIRST_CONNECT;
      if (connects === FIRST_CONNECT) {
        return await Promise.resolve(handle(async () => await Promise.resolve({ content: [] })));
      }
      return await reject('reconnect refused');
    };
    const out = await invokeMcp({
      ...baseArgs,
      deps: baseDeps({ pool, isHealthy: async () => await Promise.resolve(false), connect }),
    });
    expect(out).toEqual({ kind: 'tool_error', category: 'transport' });
    const leaked = [...pool.entries().values()].filter((e) => e.borrows > NONE);
    expect(leaked).toHaveLength(NONE);
  });
});
