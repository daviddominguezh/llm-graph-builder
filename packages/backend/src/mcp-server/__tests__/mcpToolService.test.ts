import type { Graph, McpServerConfig, McpTransport } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock types                                                         */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;

interface MockHandle {
  listTools: () => Promise<Array<{ name: string; description?: string; inputSchema: unknown }>>;
  callTool: (name: string, args: unknown) => Promise<unknown>;
  close: () => Promise<void>;
}

type ConnectMcpFn = (args: { transport: unknown }) => Promise<MockHandle>;
type CreateTransportFn = (server: McpServerConfig) => unknown;

type GetDecryptedEnvVariablesFn = (
  supabase: SupabaseClient,
  orgId: string
) => Promise<{ byName: Record<string, string>; byId: Record<string, string> }>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockConnectMcp = jest.fn<ConnectMcpFn>();
const mockCreateTransport = jest.fn<CreateTransportFn>();
const mockGetDecryptedEnvVariables = jest.fn<GetDecryptedEnvVariablesFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('@daviddh/llm-graph-runner', () => ({
  connectMcp: mockConnectMcp,
  createTransport: mockCreateTransport,
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
const FIRST = 0;

function buildMockHandle(): MockHandle {
  return {
    listTools: jest.fn<MockHandle['listTools']>().mockResolvedValue(toolList),
    callTool: jest.fn<MockHandle['callTool']>().mockResolvedValue({ results: ['result1'] }),
    close: jest.fn<MockHandle['close']>().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDecryptedEnvVariables.mockResolvedValue({ byName: {}, byId: {} });
  mockCreateTransport.mockReturnValue({ wire: 'transport' });
});

/* ------------------------------------------------------------------ */
/*  discoverTools                                                      */
/* ------------------------------------------------------------------ */

describe('discoverTools', () => {
  it('returns tool list with name/description/inputSchema', async () => {
    const ctx = buildCtx();
    const handle = buildMockHandle();
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockConnectMcp.mockResolvedValue(handle);

    const result = await discoverTools(ctx, 'agent-1', 'server-1');

    expect(result).toHaveLength(TOOL_COUNT);
    expect(result[FIRST]).toEqual({
      name: 'search',
      description: 'Search for results',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    });
    expect(handle.close).toHaveBeenCalled();
  });

  it('closes client even after error in listTools', async () => {
    const ctx = buildCtx();
    const handle = buildMockHandle();
    handle.listTools = jest.fn<MockHandle['listTools']>().mockRejectedValue(new Error('list failed'));
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockConnectMcp.mockResolvedValue(handle);

    await expect(discoverTools(ctx, 'agent-1', 'server-1')).rejects.toThrow('list failed');
    expect(handle.close).toHaveBeenCalled();
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
/*  callTool helpers                                                   */
/* ------------------------------------------------------------------ */

const EMPTY_ARGS: Record<string, unknown> = {};
const SEARCH_INPUT = { agentId: 'agent-1', serverId: 'server-1', toolName: 'search', args: EMPTY_ARGS };

function setupCallToolHandle(): { ctx: ServiceContext; handle: MockHandle } {
  const ctx = buildCtx();
  const handle = buildMockHandle();
  mockAssembleGraph.mockResolvedValue(testGraph);
  mockConnectMcp.mockResolvedValue(handle);
  return { ctx, handle };
}

/* ------------------------------------------------------------------ */
/*  callTool                                                           */
/* ------------------------------------------------------------------ */

describe('callTool', () => {
  it('calls the tool with args and returns result', async () => {
    const { ctx, handle } = setupCallToolHandle();

    const result = await callTool(ctx, {
      agentId: 'agent-1',
      serverId: 'server-1',
      toolName: 'search',
      args: { q: 'test' },
    });

    expect(handle.callTool).toHaveBeenCalledWith('search', { q: 'test' });
    expect(result).toEqual({ results: ['result1'] });
    expect(handle.close).toHaveBeenCalled();
  });

  it('closes client after tool execution error', async () => {
    const { ctx, handle } = setupCallToolHandle();
    handle.callTool = jest.fn<MockHandle['callTool']>().mockRejectedValue(new Error('exec fail'));

    await expect(callTool(ctx, SEARCH_INPUT)).rejects.toThrow('exec fail');
    expect(handle.close).toHaveBeenCalled();
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(callTool(buildCtx(), SEARCH_INPUT)).rejects.toThrow('Graph not found');
  });
});
