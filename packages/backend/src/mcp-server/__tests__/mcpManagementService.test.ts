import type { Graph, McpServerConfig } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { McpLibraryRow } from '../../db/queries/mcpLibraryQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;

type ExecuteOperationsBatchFn = (
  supabase: SupabaseClient,
  agentId: string,
  operations: unknown[]
) => Promise<void>;

type GetLibraryItemByIdFn = (
  supabase: SupabaseClient,
  id: string
) => Promise<{ result: McpLibraryRow | null; error: string | null }>;

type IncrementInstallationsFn = (
  supabase: SupabaseClient,
  libraryItemId: string
) => Promise<{ error: string | null }>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

export const mockAssembleGraph = jest.fn<AssembleGraphFn>();
export const mockExecuteOperationsBatch = jest.fn<ExecuteOperationsBatchFn>();
export const mockGetLibraryItemById = jest.fn<GetLibraryItemByIdFn>();
export const mockIncrementInstallations = jest.fn<IncrementInstallationsFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('../../db/queries/operationExecutor.js', () => ({
  executeOperationsBatch: mockExecuteOperationsBatch,
}));

jest.unstable_mockModule('../../db/queries/mcpLibraryQueries.js', () => ({
  getLibraryItemById: mockGetLibraryItemById,
  incrementInstallations: mockIncrementInstallations,
}));

const { listMcpServers, getMcpServer, addMcpServer, updateMcpServer, removeMcpServer } =
  await import('../services/mcpManagementService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

export const stdioServer: McpServerConfig = {
  id: 'server-1',
  name: 'My Stdio Server',
  transport: { type: 'stdio', command: 'npx', args: ['-y', 'my-mcp'] },
  enabled: true,
  variableValues: { TOKEN: { type: 'direct', value: 'abc' } },
};

const sseServer: McpServerConfig = {
  id: 'server-2',
  name: 'My SSE Server',
  transport: { type: 'sse', url: 'https://example.com/sse' },
  enabled: false,
  libraryItemId: 'lib-item-1',
};

export const testGraph: Graph = {
  startNode: 'Start',
  agents: [{ id: 'main', description: 'Main' }],
  nodes: [{ id: 'Start', text: 'Hello', kind: 'agent', agent: 'main', global: false, description: '' }],
  edges: [],
  mcpServers: [stdioServer, sseServer],
};

const graphNoServers: Graph = { ...testGraph, mcpServers: [] };

const SERVER_COUNT = 2;
const VARIABLE_COUNT_ONE = 1;
const VARIABLE_COUNT_ZERO = 0;
const FIRST = 0;
const SECOND = 1;

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  listMcpServers                                                     */
/* ------------------------------------------------------------------ */

function assertListSummaries(): void {
  expect(mockAssembleGraph).toHaveBeenCalled();
}

describe('listMcpServers', () => {
  it('returns summaries with correct fields', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);

    const result = await listMcpServers(ctx, 'agent-1');

    expect(result).toHaveLength(SERVER_COUNT);
    expect(result[FIRST]).toEqual({
      id: 'server-1',
      name: 'My Stdio Server',
      enabled: true,
      transportType: 'stdio',
      libraryItemId: undefined,
      variableCount: VARIABLE_COUNT_ONE,
    });
    expect(result[SECOND]).toEqual({
      id: 'server-2',
      name: 'My SSE Server',
      enabled: false,
      transportType: 'sse',
      libraryItemId: 'lib-item-1',
      variableCount: VARIABLE_COUNT_ZERO,
    });
    assertListSummaries();
  });

  it('returns empty array when no servers configured', async () => {
    mockAssembleGraph.mockResolvedValue(graphNoServers);

    const result = await listMcpServers(buildCtx(), 'agent-1');

    expect(result).toEqual([]);
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(listMcpServers(buildCtx(), 'agent-1')).rejects.toThrow('Graph not found for agent: agent-1');
  });
});

/* ------------------------------------------------------------------ */
/*  getMcpServer                                                       */
/* ------------------------------------------------------------------ */

describe('getMcpServer', () => {
  it('returns the matching server', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);

    const result = await getMcpServer(ctx, 'agent-1', 'server-1');

    expect(result).toEqual(stdioServer);
  });

  it('throws when server not found', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);

    await expect(getMcpServer(buildCtx(), 'agent-1', 'missing-id')).rejects.toThrow(
      'MCP server not found: missing-id'
    );
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(getMcpServer(buildCtx(), 'agent-1', 'server-1')).rejects.toThrow(
      'Graph not found for agent: agent-1'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  addMcpServer                                                       */
/* ------------------------------------------------------------------ */

describe('addMcpServer', () => {
  it('calls executeOperationsBatch with insertMcpServer and returns serverId', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    const result = await addMcpServer(ctx, 'agent-1', {
      name: 'New Server',
      transport: { type: 'stdio', command: 'npx' },
    });

    expect(result.serverId).toBeDefined();
    expect(typeof result.serverId).toBe('string');
    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([
        expect.objectContaining({
          type: 'insertMcpServer',
          data: expect.objectContaining({ serverId: result.serverId, name: 'New Server', enabled: true }),
        }),
      ])
    );
  });

  it('uses provided enabled value', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await addMcpServer(ctx, 'agent-1', {
      name: 'Disabled Server',
      transport: { type: 'http', url: 'https://example.com' },
      enabled: false,
    });

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([expect.objectContaining({ data: expect.objectContaining({ enabled: false }) })])
    );
  });
});

/* ------------------------------------------------------------------ */
/*  updateMcpServer                                                    */
/* ------------------------------------------------------------------ */

describe('updateMcpServer', () => {
  it('merges fields and calls executeOperationsBatch with updateMcpServer', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await updateMcpServer(ctx, 'agent-1', 'server-1', { name: 'Renamed Server' });

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      {
        type: 'updateMcpServer',
        data: {
          serverId: 'server-1',
          name: 'Renamed Server',
          transport: stdioServer.transport,
          enabled: stdioServer.enabled,
          variableValues: stdioServer.variableValues,
        },
      },
    ]);
  });

  it('throws when server not found', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);

    await expect(updateMcpServer(buildCtx(), 'agent-1', 'missing', { name: 'X' })).rejects.toThrow(
      'MCP server not found: missing'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  removeMcpServer                                                    */
/* ------------------------------------------------------------------ */

describe('removeMcpServer', () => {
  it('calls executeOperationsBatch with deleteMcpServer', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await removeMcpServer(ctx, 'agent-1', 'server-1');

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'deleteMcpServer', serverId: 'server-1' },
    ]);
  });
});
