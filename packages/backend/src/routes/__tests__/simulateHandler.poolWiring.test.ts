import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import { describe, expect, it } from '@jest/globals';

import { createConnectionPool } from '../../mcp/pool/connectionPool.js';
import { buildSimulationMcpInvoker } from '../simulateHandler.js';

const EXPECT_ONE_CONNECT = 1;

const server: McpServerConfig = {
  id: 'srv1',
  name: 'srv',
  enabled: true,
  transport: { type: 'http', url: 'https://srv.test/mcp' },
};

const TOOL_RESULT = { content: [{ type: 'text', text: 'ok' }] };

const INIT: McpClientHandle['initialized'] = {
  protocolVersion: '2024-11-05',
  serverInfo: { name: 'srv', version: '1' },
  capabilities: {},
};

function fakeHandle(): McpClientHandle {
  return {
    initialized: INIT,
    sessionId: null,
    listTools: async () => await Promise.resolve([]),
    callTool: async () => await Promise.resolve(TOOL_RESULT),
    close: async () => {
      await Promise.resolve();
    },
  };
}

describe('buildSimulationMcpInvoker', () => {
  it('routes a tool call through the warm pool (one connect, reused on second call)', async () => {
    const pool = createConnectionPool();
    let connects = 0;
    const handle = fakeHandle();
    const invoker = buildSimulationMcpInvoker({
      pool,
      servers: [server],
      orgId: 'org1',
      connect: async () => {
        connects += EXPECT_ONE_CONNECT;
        return await Promise.resolve(handle);
      },
      revalidateEgress: async () => {
        await Promise.resolve();
      },
    });
    const r1 = await invoker.invoke({
      agentId: 'ag1',
      tenantId: 't1',
      mcpBindingId: 'srv1',
      toolName: 'do',
      args: {},
    });
    const r2 = await invoker.invoke({
      agentId: 'ag1',
      tenantId: 't1',
      mcpBindingId: 'srv1',
      toolName: 'do',
      args: {},
    });
    expect(r1).toEqual(TOOL_RESULT);
    expect(r2).toEqual(r1);
    expect(connects).toBe(EXPECT_ONE_CONNECT);
  });
});
