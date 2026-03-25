import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { McpLibraryRow } from '../../db/queries/mcpLibraryQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type BrowseLibraryFn = (
  supabase: SupabaseClient,
  options?: { query?: string; category?: string; limit?: number; offset?: number }
) => Promise<{ result: McpLibraryRow[]; error: string | null }>;

type GetLibraryItemByIdFn = (
  supabase: SupabaseClient,
  id: string
) => Promise<{ result: McpLibraryRow | null; error: string | null }>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockBrowseLibrary = jest.fn<BrowseLibraryFn>();
const mockGetLibraryItemById = jest.fn<GetLibraryItemByIdFn>();

jest.unstable_mockModule('../../db/queries/mcpLibraryQueries.js', () => ({
  browseLibrary: mockBrowseLibrary,
  getLibraryItemById: mockGetLibraryItemById,
}));

const { browseLibrary, getLibraryItem } = await import('../services/mcpLibraryService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const INSTALLATIONS_COUNT = 5;
const BROWSE_LIMIT = 10;
const BROWSE_OFFSET = 5;

const libraryRow: McpLibraryRow = {
  id: 'lib-1',
  org_id: 'org-1',
  name: 'Test MCP Server',
  description: 'A test MCP server',
  category: 'utilities',
  image_url: null,
  transport_type: 'stdio',
  transport_config: { command: 'npx', args: ['-y', 'test-mcp'] },
  variables: [],
  installations_count: INSTALLATIONS_COUNT,
  published_by: 'user-1',
  created_at: '2024-01-01T00:00:00Z',
  auth_type: 'none',
};

const libraryRow2: McpLibraryRow = {
  ...libraryRow,
  id: 'lib-2',
  name: 'Another Server',
  category: 'analytics',
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  browseLibrary helpers                                              */
/* ------------------------------------------------------------------ */

function expectBrowseCalledWith(
  supabase: SupabaseClient,
  opts: { query?: string; category?: string; limit?: number; offset?: number }
): void {
  expect(mockBrowseLibrary).toHaveBeenCalledWith(supabase, {
    query: opts.query,
    category: opts.category,
    limit: opts.limit,
    offset: opts.offset,
  });
}

/* ------------------------------------------------------------------ */
/*  browseLibrary                                                      */
/* ------------------------------------------------------------------ */

describe('browseLibrary', () => {
  it('returns all items when no filters provided', async () => {
    const ctx = buildCtx();
    mockBrowseLibrary.mockResolvedValue({ result: [libraryRow, libraryRow2], error: null });

    const result = await browseLibrary(ctx);

    expect(result).toEqual([libraryRow, libraryRow2]);
    expectBrowseCalledWith(ctx.supabase, {});
  });

  it('passes query filter to the query function', async () => {
    const ctx = buildCtx();
    mockBrowseLibrary.mockResolvedValue({ result: [libraryRow], error: null });

    const result = await browseLibrary(ctx, { query: 'Test' });

    expect(result).toEqual([libraryRow]);
    expectBrowseCalledWith(ctx.supabase, { query: 'Test' });
  });

  it('passes all filters', async () => {
    const ctx = buildCtx();
    mockBrowseLibrary.mockResolvedValue({ result: [libraryRow], error: null });

    await browseLibrary(ctx, { query: 'Test', category: 'utilities', limit: BROWSE_LIMIT, offset: BROWSE_OFFSET });

    expectBrowseCalledWith(ctx.supabase, { query: 'Test', category: 'utilities', limit: BROWSE_LIMIT, offset: BROWSE_OFFSET });
  });

  it('returns empty array when no items found', async () => {
    mockBrowseLibrary.mockResolvedValue({ result: [], error: null });

    const result = await browseLibrary(buildCtx());

    expect(result).toEqual([]);
  });

  it('throws when query returns an error', async () => {
    mockBrowseLibrary.mockResolvedValue({ result: [], error: 'DB error' });

    await expect(browseLibrary(buildCtx())).rejects.toThrow('DB error');
  });
});

/* ------------------------------------------------------------------ */
/*  getLibraryItem                                                     */
/* ------------------------------------------------------------------ */

describe('getLibraryItem', () => {
  it('returns the library item when found', async () => {
    const ctx = buildCtx();
    mockGetLibraryItemById.mockResolvedValue({ result: libraryRow, error: null });

    const result = await getLibraryItem(ctx, 'lib-1');

    expect(result).toEqual(libraryRow);
    expect(mockGetLibraryItemById).toHaveBeenCalledWith(ctx.supabase, 'lib-1');
  });

  it('throws when item not found', async () => {
    mockGetLibraryItemById.mockResolvedValue({ result: null, error: null });

    await expect(getLibraryItem(buildCtx(), 'missing-id')).rejects.toThrow(
      'Library item not found: missing-id'
    );
  });

  it('throws when query returns an error', async () => {
    mockGetLibraryItemById.mockResolvedValue({ result: null, error: 'DB error' });

    await expect(getLibraryItem(buildCtx(), 'lib-1')).rejects.toThrow('Library item not found: lib-1');
  });
});
