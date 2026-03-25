import type { Graph } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { VersionSummary } from '../../db/queries/versionQueries.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type PublishVersionFn = (supabase: SupabaseClient, agentId: string) => Promise<number>;

type ListVersionsQueryFn = (supabase: SupabaseClient, agentId: string) => Promise<VersionSummary[]>;

type GetVersionSnapshotFn = (
  supabase: SupabaseClient,
  agentId: string,
  version: number
) => Promise<Graph | null>;

type RestoreVersionQueryFn = (supabase: SupabaseClient, agentId: string, version: number) => Promise<Graph>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockPublishVersion = jest.fn<PublishVersionFn>();
const mockListVersionsQuery = jest.fn<ListVersionsQueryFn>();
const mockGetVersionSnapshot = jest.fn<GetVersionSnapshotFn>();
const mockRestoreVersionQuery = jest.fn<RestoreVersionQueryFn>();

jest.unstable_mockModule('../../db/queries/versionQueries.js', () => ({
  publishVersion: mockPublishVersion,
  listVersions: mockListVersionsQuery,
  getVersionSnapshot: mockGetVersionSnapshot,
}));

jest.unstable_mockModule('../../db/queries/versionRestore.js', () => ({
  restoreVersion: mockRestoreVersionQuery,
}));

const { publishAgent, listVersions, getVersion, restoreVersion } =
  await import('../services/publishService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const PUBLISHED_VERSION = 2;
const NEW_VERSION = 3;
const MISSING_VERSION = 99;

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const versionSummary: VersionSummary = {
  version: PUBLISHED_VERSION,
  publishedAt: '2024-01-01T00:00:00Z',
  publishedBy: 'user-1',
};

const mockGraph: Graph = {
  startNode: 'node-1',
  agents: [],
  nodes: [],
  edges: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  publishAgent                                                       */
/* ------------------------------------------------------------------ */

describe('publishAgent', () => {
  it('publishes agent and returns version number', async () => {
    const ctx = buildCtx();
    mockPublishVersion.mockResolvedValue(NEW_VERSION);

    const result = await publishAgent(ctx, 'agent-1');

    expect(result).toEqual({ version: NEW_VERSION });
    expect(mockPublishVersion).toHaveBeenCalledWith(ctx.supabase, 'agent-1');
  });

  it('propagates error from publishVersion', async () => {
    mockPublishVersion.mockRejectedValue(new Error('Publish failed'));

    await expect(publishAgent(buildCtx(), 'agent-1')).rejects.toThrow('Publish failed');
  });
});

/* ------------------------------------------------------------------ */
/*  listVersions                                                       */
/* ------------------------------------------------------------------ */

describe('listVersions', () => {
  it('returns version summaries', async () => {
    const ctx = buildCtx();
    mockListVersionsQuery.mockResolvedValue([versionSummary]);

    const result = await listVersions(ctx, 'agent-1');

    expect(result).toEqual([versionSummary]);
    expect(mockListVersionsQuery).toHaveBeenCalledWith(ctx.supabase, 'agent-1');
  });

  it('returns empty array when no versions exist', async () => {
    mockListVersionsQuery.mockResolvedValue([]);

    const result = await listVersions(buildCtx(), 'agent-1');

    expect(result).toEqual([]);
  });

  it('propagates error from listVersions query', async () => {
    mockListVersionsQuery.mockRejectedValue(new Error('DB error'));

    await expect(listVersions(buildCtx(), 'agent-1')).rejects.toThrow('DB error');
  });
});

/* ------------------------------------------------------------------ */
/*  getVersion                                                         */
/* ------------------------------------------------------------------ */

describe('getVersion', () => {
  it('returns graph snapshot for version', async () => {
    const ctx = buildCtx();
    mockGetVersionSnapshot.mockResolvedValue(mockGraph);

    const result = await getVersion(ctx, 'agent-1', PUBLISHED_VERSION);

    expect(result).toEqual(mockGraph);
    expect(mockGetVersionSnapshot).toHaveBeenCalledWith(ctx.supabase, 'agent-1', PUBLISHED_VERSION);
  });

  it('throws when version not found', async () => {
    mockGetVersionSnapshot.mockResolvedValue(null);

    await expect(getVersion(buildCtx(), 'agent-1', MISSING_VERSION)).rejects.toThrow(
      `Version ${String(MISSING_VERSION)} not found`
    );
  });

  it('propagates error from getVersionSnapshot', async () => {
    mockGetVersionSnapshot.mockRejectedValue(new Error('DB error'));

    await expect(getVersion(buildCtx(), 'agent-1', PUBLISHED_VERSION)).rejects.toThrow('DB error');
  });
});

/* ------------------------------------------------------------------ */
/*  restoreVersion                                                     */
/* ------------------------------------------------------------------ */

describe('restoreVersion', () => {
  it('restores version and returns graph', async () => {
    const ctx = buildCtx();
    mockRestoreVersionQuery.mockResolvedValue(mockGraph);

    const result = await restoreVersion(ctx, 'agent-1', PUBLISHED_VERSION);

    expect(result).toEqual(mockGraph);
    expect(mockRestoreVersionQuery).toHaveBeenCalledWith(ctx.supabase, 'agent-1', PUBLISHED_VERSION);
  });

  it('propagates error from restoreVersion query', async () => {
    mockRestoreVersionQuery.mockRejectedValue(new Error(`Version ${String(MISSING_VERSION)} not found`));

    await expect(restoreVersion(buildCtx(), 'agent-1', MISSING_VERSION)).rejects.toThrow(
      `Version ${String(MISSING_VERSION)} not found`
    );
  });
});
