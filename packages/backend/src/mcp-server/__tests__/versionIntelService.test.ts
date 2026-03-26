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
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const V1 = 1;
const V2 = 2;
const V99 = 99;
const COUNT_ONE = 1;
const COUNT_ZERO = 0;
const MIN_SUMMARY_LENGTH = 0;
const FIRST_ITEM = 0;

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
    { id: 'B', text: 'Node B', kind: 'agent', description: '', global: false, agent: 'bot' },
  ],
  edges: [{ from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'hi' }] }],
};

const VERSION_2: Graph = {
  startNode: 'A',
  agents: [
    { id: 'bot', description: '' },
    { id: 'support', description: '' },
  ],
  nodes: [
    { id: 'A', text: 'Node A updated', kind: 'agent', description: '', global: false, agent: 'bot' },
    { id: 'B', text: 'Node B', kind: 'agent', description: '', global: false, agent: 'bot' },
    { id: 'C', text: 'Node C', kind: 'agent', description: '', global: false, agent: 'support' },
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
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function mockV1toV2(): void {
  mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1).mockResolvedValueOnce(VERSION_2);
}

/* ------------------------------------------------------------------ */
/*  diffVersions                                                        */
/* ------------------------------------------------------------------ */

describe('diffVersions — structural changes', () => {
  it('detects added nodes when comparing two versions', async () => {
    mockV1toV2();
    const result = await diffVersions(buildCtx(), 'agent-1', V1, V2);
    expect(result.nodes.added).toHaveLength(COUNT_ONE);
    expect(result.nodes.added[FIRST_ITEM]?.id).toBe('C');
  });

  it('detects modified nodes', async () => {
    mockV1toV2();
    const result = await diffVersions(buildCtx(), 'agent-1', V1, V2);
    expect(result.nodes.modified).toHaveLength(COUNT_ONE);
    expect(result.nodes.modified[FIRST_ITEM]?.id).toBe('A');
  });

  it('detects added edges', async () => {
    mockV1toV2();
    const result = await diffVersions(buildCtx(), 'agent-1', V1, V2);
    expect(result.edges.added).toHaveLength(COUNT_ONE);
    expect(result.edges.added[FIRST_ITEM]?.from).toBe('B');
  });

  it('detects added agent domains', async () => {
    mockV1toV2();
    const result = await diffVersions(buildCtx(), 'agent-1', V1, V2);
    expect(result.agentDomainsAdded).toContain('support');
  });
});

describe('diffVersions — draft and edge cases', () => {
  it('loads draft graph via assembleGraph', async () => {
    mockAssembleGraph.mockResolvedValue(DRAFT_GRAPH);
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1);
    const result = await diffVersions(buildCtx(), 'agent-1', V1, 'draft');
    expect(result.startNodeChanged).toBe(true);
    expect(result.toStartNode).toBe('NEW_START');
  });

  it('returns no changes when comparing identical graphs', async () => {
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1).mockResolvedValueOnce(VERSION_1);
    const result = await diffVersions(buildCtx(), 'agent-1', V1, V1);
    expect(result.nodes.added).toHaveLength(COUNT_ZERO);
    expect(result.nodes.removed).toHaveLength(COUNT_ZERO);
    expect(result.nodes.modified).toHaveLength(COUNT_ZERO);
    expect(result.edges.added).toHaveLength(COUNT_ZERO);
    expect(result.edges.removed).toHaveLength(COUNT_ZERO);
    expect(result.summary).toContain('no changes');
  });

  it('includes a readable summary', async () => {
    mockV1toV2();
    const result = await diffVersions(buildCtx(), 'agent-1', V1, V2);
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(MIN_SUMMARY_LENGTH);
  });

  it('throws when version snapshot not found', async () => {
    mockGetVersionSnapshot.mockResolvedValueOnce(null);
    await expect(diffVersions(buildCtx(), 'agent-1', V99, V1)).rejects.toThrow(
      `Version ${String(V99)} not found`
    );
  });

  it('throws when draft graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);
    mockGetVersionSnapshot.mockResolvedValueOnce(VERSION_1);
    await expect(diffVersions(buildCtx(), 'agent-1', 'draft', V1)).rejects.toThrow('Graph not found');
  });
});
