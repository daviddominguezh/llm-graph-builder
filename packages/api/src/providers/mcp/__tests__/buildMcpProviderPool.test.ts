import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import type { ProviderCtx } from '../../provider.js';
import { logger } from '../../../utils/logger.js';
import { buildMcpProvider } from '../buildMcpProvider.js';
import { type MockTransport, createMockTransport } from '../client/__tests__/mockTransport.js';
import { MCP_PROTOCOL_VERSION } from '../client/types.js';
import type { McpInvokeArgs, McpInvoker } from '../poolClient.js';

const TOOL_NAME = 'create_deal';
const ONE = 1;
const TWO = 2;
const SECOND_INDEX = 1;

const VALID_INIT_RESPONSE = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  serverInfo: { name: 'srv', version: '1.0.0' },
  capabilities: { tools: { listChanged: false } },
};

const SAMPLE_TOOL = {
  name: TOOL_NAME,
  description: 'Create a deal',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
};

const STDIO_SERVER: McpServerConfig = {
  id: 'mcp-1',
  name: 'fake',
  transport: { type: 'stdio', command: 'echo' },
  enabled: true,
};

function makeCtx(): ProviderCtx {
  return {
    orgId: 'o',
    tenantId: 'test-tenant-id',
    agentId: 'a',
    isChildAgent: false,
    logger,
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

interface FactoryRecorder {
  factory: (server: McpServerConfig) => Promise<MockTransport>;
  transports: MockTransport[];
}

function makeFactory(): FactoryRecorder {
  const transports: MockTransport[] = [];
  const factory = async (_server: McpServerConfig): Promise<MockTransport> => {
    const t = createMockTransport();
    t.responses.set('initialize', VALID_INIT_RESPONSE);
    t.responses.set('tools/list', { tools: [SAMPLE_TOOL] });
    t.responses.set('tools/call', { content: [{ type: 'text', text: 'session' }] });
    transports.push(t);
    return await Promise.resolve(t);
  };
  return { factory, transports };
}

function recordingPool(): { mcpPool: McpInvoker; calls: McpInvokeArgs[] } {
  const calls: McpInvokeArgs[] = [];
  const mcpPool: McpInvoker = {
    invoke: async (a) => {
      calls.push(a);
      return await Promise.resolve({ content: [{ type: 'text', text: 'pooled' }] });
    },
  };
  return { mcpPool, calls };
}

describe('buildMcpProvider seam — mcpPool present', () => {
  it('routes execute through mcpPool.invoke and skips the per-call transport', async () => {
    const { factory, transports } = makeFactory();
    const { mcpPool, calls } = recordingPool();
    const provider = buildMcpProvider(STDIO_SERVER, { createTransport: factory, mcpPool });

    const out = await provider.buildTools({ toolNames: [TOOL_NAME], ctx: makeCtx() });
    const result = await out[TOOL_NAME]?.execute({ name: 'acme' });

    expect(result).toEqual({ content: [{ type: 'text', text: 'pooled' }] });
    expect(calls).toEqual([
      {
        agentId: 'a',
        tenantId: 'test-tenant-id',
        mcpBindingId: STDIO_SERVER.id,
        toolName: TOOL_NAME,
        args: { name: 'acme' },
      },
    ]);
    // Only the listTools transport opened; execute did NOT open a second one.
    expect(transports).toHaveLength(ONE);
  });
});

describe('buildMcpProvider seam — mcpPool absent (default)', () => {
  it('falls back to withSession + callTool, opening a per-call transport', async () => {
    const { factory, transports } = makeFactory();
    const provider = buildMcpProvider(STDIO_SERVER, { createTransport: factory });

    const out = await provider.buildTools({ toolNames: [TOOL_NAME], ctx: makeCtx() });
    const result = await out[TOOL_NAME]?.execute({ name: 'acme' });

    expect(result).toEqual({ content: [{ type: 'text', text: 'session' }] });
    expect(transports).toHaveLength(TWO);
    expect(transports[SECOND_INDEX]?.requests.find((r) => r.method === 'tools/call')?.params).toEqual({
      name: TOOL_NAME,
      arguments: { name: 'acme' },
    });
  });
});
