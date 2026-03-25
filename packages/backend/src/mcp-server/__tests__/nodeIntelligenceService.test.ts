import type { Graph } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                 */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                  */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

const { getNodeFullContext, explainEdge } = await import('../services/nodeIntelligenceService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                            */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const BASE_GRAPH: Graph = {
  startNode: 'A',
  agents: [{ id: 'bot', description: '' }],
  nodes: [
    { id: 'A', text: 'Start node. Enter your query.', kind: 'agent', description: '', global: false, agent: 'bot' },
    { id: 'B', text: 'End node.', kind: 'agent', description: '', global: false, agent: 'bot', nextNodeIsUser: true },
  ],
  edges: [
    {
      from: 'A',
      to: 'B',
      preconditions: [{ type: 'user_said', value: 'hello', description: 'user greeting' }],
    },
  ],
};

const MULTI_PRECONDITION_GRAPH: Graph = {
  startNode: 'A',
  agents: [{ id: 'bot', description: '' }],
  nodes: [
    { id: 'A', text: 'Decision node', kind: 'agent_decision', description: '', global: false, agent: 'bot' },
    { id: 'B', text: 'Path B', kind: 'agent', description: '', global: false, agent: 'bot', nextNodeIsUser: true },
    { id: 'C', text: 'Path C', kind: 'agent', description: '', global: false, agent: 'bot', nextNodeIsUser: true },
  ],
  edges: [
    {
      from: 'A',
      to: 'B',
      preconditions: [{ type: 'agent_decision', value: 'option_b' }],
    },
    {
      from: 'A',
      to: 'C',
      preconditions: [{ type: 'agent_decision', value: 'option_c' }],
      contextPreconditions: { preconditions: ['flag_premium'], jumpTo: undefined },
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  getNodeFullContext                                                   */
/* ------------------------------------------------------------------ */

describe('getNodeFullContext', () => {
  it('returns node details, prompt, and reachability', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    const result = await getNodeFullContext(buildCtx(), 'agent-1', 'A');

    expect(result.details).toBeDefined();
    expect(result.details.node.id).toBe('A');
    expect(result.prompt).toBeDefined();
    expect(result.prompt.nodeId).toBe('A');
    expect(result.reachability).toBeDefined();
  });

  it('throws when node does not exist', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await expect(getNodeFullContext(buildCtx(), 'agent-1', 'MISSING')).rejects.toThrow('Node not found');
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(getNodeFullContext(buildCtx(), 'agent-1', 'A')).rejects.toThrow('Graph not found');
  });

  it('includes reachability from start node', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    const result = await getNodeFullContext(buildCtx(), 'agent-1', 'B');

    expect(result.reachability.reachable).toContain('A');
    expect(result.reachability.reachable).toContain('B');
  });
});

/* ------------------------------------------------------------------ */
/*  explainEdge                                                         */
/* ------------------------------------------------------------------ */

describe('explainEdge', () => {
  it('returns edge explanation with preconditions', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    const result = await explainEdge(buildCtx(), 'agent-1', 'A', 'B');

    expect(result.from).toBe('A');
    expect(result.to).toBe('B');
    expect(result.preconditions).toHaveLength(1);
    expect(result.preconditions[0]?.type).toBe('user_said');
    expect(result.preconditions[0]?.value).toBe('hello');
  });

  it('includes context flags when present', async () => {
    mockAssembleGraph.mockResolvedValue(MULTI_PRECONDITION_GRAPH);

    const result = await explainEdge(buildCtx(), 'agent-1', 'A', 'C');

    expect(result.contextFlags).toContain('flag_premium');
  });

  it('produces human-readable summary', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    const result = await explainEdge(buildCtx(), 'agent-1', 'A', 'B');

    expect(result.summary).toContain('A');
    expect(result.summary).toContain('B');
    expect(result.summary).toContain('hello');
  });

  it('throws when edge does not exist', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await expect(explainEdge(buildCtx(), 'agent-1', 'A', 'MISSING')).rejects.toThrow('Edge not found');
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(explainEdge(buildCtx(), 'agent-1', 'A', 'B')).rejects.toThrow('Graph not found');
  });

  it('returns empty context flags when none present', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    const result = await explainEdge(buildCtx(), 'agent-1', 'A', 'B');

    expect(result.contextFlags).toEqual([]);
  });
});
