import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { Graph, McpServerConfig, McpTransport } from '@daviddh/graph-types';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock types                                                         */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;

interface MockTool {
  execute: (args: Record<string, unknown>, ctx: { toolCallId: string; messages: [] }) => Promise<unknown>;
}

interface MockClient {
  tools: () => Promise<Record<string, MockTool>>;
  listTools: () => Promise<{
    tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>;
  }>;
  close: () => Promise<void>;
}

type ConnectMcpClientFn = (transport: McpTransport) => Promise<MockClient>;

type GetDecryptedEnvVariablesFn = (
  supabase: SupabaseClient,
  orgId: string
) => Promise<Record<string, string>>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockConnectMcpClient = jest.fn<ConnectMcpClientFn>();
const mockGetDecryptedEnvVariables = jest.fn<GetDecryptedEnvVariablesFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('../../mcp/client.js', () => ({
  connectMcpClient: mockConnectMcpClient,
}));

jest.unstable_mockModule('../../db/queries/executionAuthQueries.js', () => ({
  getDecryptedEnvVariables: mockGetDecryptedEnvVariables,
}));

const { discoverTools, callTool } = await import('../services/mcpToolService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const stdioTransport: McpTransport = { type: 'stdio', command: 'npx', args: ['-y', 'test-mcp'] };

const mcpServer: McpServerConfig = {
  id: 'server-1',
  name: 'Test MCP Server',
  transport: stdioTransport,
  enabled: true,
};

const testGraph: Graph = {
  startNode: 'Start',
  agents: [{ id: 'main', description: 'Main' }],
  nodes: [{ id: 'Start', text: 'Hello', kind: 'agent', agent: 'main', global: false, description: '' }],
  edges: [],
  mcpServers: [mcpServer],
};

const toolList = [
  {
    name: 'search',
    description: 'Search for results',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
  },
  {
    name: 'fetch',
    description: 'Fetch a URL',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
  },
];

const TOOL_COUNT = 2;

function buildMockClient(): MockClient {
  return {
    listTools: jest.fn<MockClient['listTools']>().mockResolvedValue({ tools: toolList }),
    tools: jest.fn<MockClient['tools']>().mockResolvedValue({
      search: {
        execute: jest.fn<MockTool['execute']>().mockResolvedValue({ results: ['result1'] }),
      },
    }),
    close: jest.fn<MockClient['close']>().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDecryptedEnvVariables.mockResolvedValue({});
});

/* ------------------------------------------------------------------ */
/*  discoverTools                                                      */
/* ------------------------------------------------------------------ */

describe('discoverTools', () => {
  it('returns tool list with name/description/inputSchema', async () => {
    const ctx = buildCtx();
    const mockClient = buildMockClient();
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockConnectMcpClient.mockResolvedValue(mockClient);

    const result = await discoverTools(ctx, 'agent-1', 'server-1');

    expect(result).toHaveLength(TOOL_COUNT);
    expect(result[0]).toEqual({
      name: 'search',
      description: 'Search for results',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    });
    expect(mockClient.close).toHaveBeenCalled();
  });

  it('closes client even after error in listTools', async () => {
    const ctx = buildCtx();
    const mockClient = buildMockClient();
    mockClient.listTools = jest.fn<MockClient['listTools']>().mockRejectedValue(new Error('list failed'));
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockConnectMcpClient.mockResolvedValue(mockClient);

    await expect(discoverTools(ctx, 'agent-1', 'server-1')).rejects.toThrow('list failed');
    expect(mockClient.close).toHaveBeenCalled();
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(discoverTools(buildCtx(), 'agent-1', 'server-1')).rejects.toThrow('Graph not found');
  });

  it('throws when server not found in graph', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);

    await expect(discoverTools(buildCtx(), 'agent-1', 'missing-server')).rejects.toThrow(
      'MCP server not found: missing-server'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  callTool                                                           */
/* ------------------------------------------------------------------ */

describe('callTool', () => {
  it('calls the tool with args and returns result', async () => {
    const ctx = buildCtx();
    const mockClient = buildMockClient();
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockConnectMcpClient.mockResolvedValue(mockClient);

    const result = await callTool(ctx, 'agent-1', 'server-1', 'search', { q: 'test' });

    expect(result).toEqual({ results: ['result1'] });
    expect(mockClient.close).toHaveBeenCalled();
  });

  it('throws when tool not found in toolset', async () => {
    const ctx = buildCtx();
    const mockClient = buildMockClient();
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockConnectMcpClient.mockResolvedValue(mockClient);

    await expect(callTool(ctx, 'agent-1', 'server-1', 'missing-tool', {})).rejects.toThrow(
      'Tool not found: missing-tool'
    );
    expect(mockClient.close).toHaveBeenCalled();
  });

  it('closes client after tool execution error', async () => {
    const ctx = buildCtx();
    const mockClient = buildMockClient();
    const failingTool = { execute: jest.fn<MockTool['execute']>().mockRejectedValue(new Error('exec fail')) };
    mockClient.tools = jest.fn<MockClient['tools']>().mockResolvedValue({ search: failingTool });
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockConnectMcpClient.mockResolvedValue(mockClient);

    await expect(callTool(ctx, 'agent-1', 'server-1', 'search', {})).rejects.toThrow('exec fail');
    expect(mockClient.close).toHaveBeenCalled();
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(callTool(buildCtx(), 'agent-1', 'server-1', 'search', {})).rejects.toThrow('Graph not found');
  });
});
