import type { Graph } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                 */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;
type GetVersionSnapshotFn = (
  supabase: SupabaseClient,
  agentId: string,
  version: number
) => Promise<Graph | null>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                  */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockGetVersionSnapshot = jest.fn<GetVersionSnapshotFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('../../db/queries/versionQueries.js', () => ({
  getVersionSnapshot: mockGetVersionSnapshot,
}));

const { diffVersions } = await import('../services/versionIntelService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                            */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const VERSION_1: Graph = {
  startNode: 'A',
  agents: [{ id: 'bot', description: '' }],
  nodes: [
    { id: 'A', text: 'Node A', kind: 'agent', description: '', global: false, agent: 'bot' },
    { id: 'B', text: 'Node B', kind: 'agent', description: '', global: false, agent: 'bot', nextNodeIsUser: true },
  ],
  edges: [{ from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'hi' }] }],
};

const VERSION_2: Graph = {
  startNode: 'A',
  agents: [{ id: 'bot', description: '' }, { id: 'support', description: '' }],
  nodes: [
    { id: 'A', text: 'Node A updated', kind: 'agent', description: '', global: false, agent: 'bot' },
    { id: 'B', text: 'Node B', kind: 'agent', description: '', global: false, agent: 'bot', nextNodeIsUser: true },
    { id: 'C', text: 'Node C', kind: 'agent', description: '', global: false, agent: 'support', nextNodeIsUser: true },
  ],
  edges: [
    { from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'hi' }] },
    { from: 'B', to: 'C', preconditions: [{ type: 'agent_decision', value: 'escalate' }] },
  ],
};

const DRAFT_GRAPH: Graph = {
  startNode: 'NEW_START',
  agents: [{ id: 'bot', description: '' }],
  nodes: [
    { id: 'NEW_START', text: 'Draft start', kind: 'agent', description: '', global: false, agent: 'bot' },
  ],
  edges: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  diffVersions                                                        */
/* ------------------------------------------------------------------ */

describe('diffVersions', () => {
  it('detects added nodes when comparing two versions', async () => {
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1).mockResolvedValueOnce(VERSION_2);

    const result = await diffVersions(buildCtx(), 'agent-1', 1, 2);

    expect(result.nodes.added).toHaveLength(1);
    expect(result.nodes.added[0]?.id).toBe('C');
  });

  it('detects modified nodes', async () => {
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1).mockResolvedValueOnce(VERSION_2);

    const result = await diffVersions(buildCtx(), 'agent-1', 1, 2);

    expect(result.nodes.modified).toHaveLength(1);
    expect(result.nodes.modified[0]?.id).toBe('A');
  });

  it('detects added edges', async () => {
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1).mockResolvedValueOnce(VERSION_2);

    const result = await diffVersions(buildCtx(), 'agent-1', 1, 2);

    expect(result.edges.added).toHaveLength(1);
    expect(result.edges.added[0]?.from).toBe('B');
  });

  it('detects added agent domains', async () => {
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1).mockResolvedValueOnce(VERSION_2);

    const result = await diffVersions(buildCtx(), 'agent-1', 1, 2);

    expect(result.agentDomainsAdded).toContain('support');
  });

  it('loads draft graph via assembleGraph', async () => {
    mockAssembleGraph.mockResolvedValue(DRAFT_GRAPH);
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1);

    const result = await diffVersions(buildCtx(), 'agent-1', 1, 'draft');

    expect(result.startNodeChanged).toBe(true);
    expect(result.toStartNode).toBe('NEW_START');
  });

  it('returns no changes when comparing identical graphs', async () => {
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1).mockResolvedValueOnce(VERSION_1);

    const result = await diffVersions(buildCtx(), 'agent-1', 1, 1);

    expect(result.nodes.added).toHaveLength(0);
    expect(result.nodes.removed).toHaveLength(0);
    expect(result.nodes.modified).toHaveLength(0);
    expect(result.edges.added).toHaveLength(0);
    expect(result.edges.removed).toHaveLength(0);
    expect(result.summary).toContain('no changes');
  });

  it('includes a readable summary', async () => {
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1).mockResolvedValueOnce(VERSION_2);

    const result = await diffVersions(buildCtx(), 'agent-1', 1, 2);

    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('throws when version snapshot not found', async () => {
    mockGetVersionSnapshot.mockResolvedValueOnce(null);

    await expect(diffVersions(buildCtx(), 'agent-1', 99, 1)).rejects.toThrow('Version 99 not found');
  });

  it('throws when draft graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1);

    await expect(diffVersions(buildCtx(), 'agent-1', 'draft', 1)).rejects.toThrow('Graph not found');
  });
});
