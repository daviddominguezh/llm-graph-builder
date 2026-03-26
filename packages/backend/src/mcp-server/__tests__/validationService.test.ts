import type { Graph } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

const { validateGraph, getReachability, findPath, getDeadEnds, getOrphans } =
  await import('../services/validationService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

const MAX_DEPTH_ZERO = 0;

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const CLEAN_GRAPH: Graph = {
  startNode: 'A',
  agents: [{ id: 'bot', description: '' }],
  nodes: [
    { id: 'A', text: 'Start', kind: 'agent', description: '', global: false, agent: 'bot' },
    {
      id: 'B',
      text: 'Middle',
      kind: 'agent',
      description: '',
      global: false,
      agent: 'bot',
      nextNodeIsUser: true,
    },
  ],
  edges: [{ from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'hi' }] }],
};

const GRAPH_WITH_ORPHAN: Graph = {
  startNode: 'A',
  agents: [],
  nodes: [
    { id: 'A', text: 'Start', kind: 'agent', description: '', global: false },
    { id: 'B', text: 'Orphan', kind: 'agent', description: '', global: false },
  ],
  edges: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  validateGraph                                                      */
/* ------------------------------------------------------------------ */

describe('validateGraph', () => {
  it('returns empty violations for a clean graph', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);
    const violations = await validateGraph(buildCtx(), 'agent-1');

    expect(violations).toEqual([]);
  });

  it('returns violations when graph has problems', async () => {
    mockAssembleGraph.mockResolvedValue(GRAPH_WITH_ORPHAN);
    const violations = await validateGraph(buildCtx(), 'agent-1');

    const orphanViolation = violations.find((v) => v.code === 'ORPHAN_NODE');
    const deadEndViolation = violations.find((v) => v.code === 'DEAD_END');

    expect(orphanViolation).toBeDefined();
    expect(deadEndViolation).toBeDefined();
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(validateGraph(buildCtx(), 'missing')).rejects.toThrow('Graph not found: missing');
  });
});

/* ------------------------------------------------------------------ */
/*  getReachability                                                    */
/* ------------------------------------------------------------------ */

describe('getReachability', () => {
  it('returns reachability info from a given node', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);
    const result = await getReachability(buildCtx(), 'agent-1', 'A');

    expect(result.reachable).toContain('A');
    expect(result.reachable).toContain('B');
  });

  it('passes maxDepth through to BFS', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);
    const result = await getReachability(buildCtx(), 'agent-1', 'A', MAX_DEPTH_ZERO);

    expect(result.reachable).toContain('A');
    expect(result.unreachable).toContain('B');
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(getReachability(buildCtx(), 'missing', 'A')).rejects.toThrow('Graph not found: missing');
  });
});

/* ------------------------------------------------------------------ */
/*  findPath                                                           */
/* ------------------------------------------------------------------ */

describe('findPath', () => {
  it('finds the path between two connected nodes', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);
    const result = await findPath(buildCtx(), 'agent-1', 'A', 'B');

    expect(result.found).toBe(true);
    expect(result.path).toContain('A');
    expect(result.path).toContain('B');
  });

  it('returns not found for disconnected nodes', async () => {
    mockAssembleGraph.mockResolvedValue(GRAPH_WITH_ORPHAN);
    const result = await findPath(buildCtx(), 'agent-1', 'A', 'B');

    expect(result.found).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  getDeadEnds                                                        */
/* ------------------------------------------------------------------ */

describe('getDeadEnds', () => {
  it('returns IDs of dead-end nodes', async () => {
    mockAssembleGraph.mockResolvedValue(GRAPH_WITH_ORPHAN);
    const result = await getDeadEnds(buildCtx(), 'agent-1');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  it('returns empty array for graph with no dead ends', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);
    const result = await getDeadEnds(buildCtx(), 'agent-1');

    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  getOrphans                                                         */
/* ------------------------------------------------------------------ */

describe('getOrphans', () => {
  it('returns orphan node IDs', async () => {
    mockAssembleGraph.mockResolvedValue(GRAPH_WITH_ORPHAN);
    const result = await getOrphans(buildCtx(), 'agent-1');

    expect(result).toContain('B');
  });

  it('returns empty array for fully connected graph', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);
    const result = await getOrphans(buildCtx(), 'agent-1');

    expect(result).toEqual([]);
  });
});
