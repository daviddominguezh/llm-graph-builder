import type { Graph } from '@daviddh/graph-types';
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

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockExecuteOperationsBatch = jest.fn<ExecuteOperationsBatchFn>();
const mockGetLibraryItemById = jest.fn<GetLibraryItemByIdFn>();
const mockIncrementInstallations = jest.fn<IncrementInstallationsFn>();

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

const { installFromLibrary } = await import('../services/mcpManagementService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const INSTALL_COUNT = 5;

const libraryItem: McpLibraryRow = {
  id: 'lib-item-1',
  org_id: 'org-1',
  name: 'Awesome MCP',
  description: 'A great MCP server',
  category: 'productivity',
  image_url: null,
  transport_type: 'stdio',
  transport_config: { command: 'npx', args: ['-y', 'awesome-mcp'] },
  variables: [],
  installations_count: INSTALL_COUNT,
  published_by: 'user-1',
  created_at: '2024-01-01T00:00:00Z',
  auth_type: 'none',
};

function setupLibraryMocks(item: McpLibraryRow): void {
  mockGetLibraryItemById.mockResolvedValue({ result: item, error: null });
  mockExecuteOperationsBatch.mockResolvedValue(undefined);
  mockIncrementInstallations.mockResolvedValue({ error: null });
}

function assertInsertMcpServerCalled(supabase: SupabaseClient, data: Record<string, unknown>): void {
  expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(
    supabase,
    'agent-1',
    expect.arrayContaining([
      expect.objectContaining({
        type: 'insertMcpServer',
        data: expect.objectContaining(data),
      }),
    ])
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  installFromLibrary                                                 */
/* ------------------------------------------------------------------ */

describe('installFromLibrary — success cases', () => {
  it('inserts server config and increments installations', async () => {
    const ctx = buildCtx();
    setupLibraryMocks(libraryItem);

    const result = await installFromLibrary(ctx, 'agent-1', 'lib-item-1');

    expect(result.serverId).toBeDefined();
    assertInsertMcpServerCalled(ctx.supabase, {
      name: 'Awesome MCP',
      libraryItemId: 'lib-item-1',
      enabled: true,
      transport: { type: 'stdio', command: 'npx', args: ['-y', 'awesome-mcp'] },
    });
    expect(mockIncrementInstallations).toHaveBeenCalledWith(ctx.supabase, 'lib-item-1');
  });

  it('passes variableValues to the insert operation', async () => {
    const ctx = buildCtx();
    setupLibraryMocks(libraryItem);

    const vars = { TOKEN: { type: 'direct' as const, value: 'my-token' } };
    await installFromLibrary(ctx, 'agent-1', 'lib-item-1', vars);

    assertInsertMcpServerCalled(ctx.supabase, { variableValues: vars });
  });
});

describe('installFromLibrary — transport and error cases', () => {
  it('throws when library item not found', async () => {
    mockGetLibraryItemById.mockResolvedValue({ result: null, error: 'Not found' });

    await expect(installFromLibrary(buildCtx(), 'agent-1', 'bad-id')).rejects.toThrow(
      'Library item not found: bad-id'
    );
    expect(mockExecuteOperationsBatch).not.toHaveBeenCalled();
  });

  it('builds sse transport correctly from library item', async () => {
    const sseItem: McpLibraryRow = {
      ...libraryItem,
      transport_type: 'sse',
      transport_config: { url: 'https://sse.example.com', headers: { Authorization: 'Bearer x' } },
    };
    const ctx = buildCtx();
    setupLibraryMocks(sseItem);

    await installFromLibrary(ctx, 'agent-1', 'lib-item-1');

    assertInsertMcpServerCalled(ctx.supabase, {
      transport: { type: 'sse', url: 'https://sse.example.com', headers: { Authorization: 'Bearer x' } },
    });
  });
});
