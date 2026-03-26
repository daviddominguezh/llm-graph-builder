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

const { getGraphSummary, getNode, getEdgesFrom, getEdgesTo } =
  await import('../services/graphReadService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const TOTAL_NODES = 5;
const TOTAL_EDGES = 4;
const GREET_NODE_COUNT = 3;
const SINGLE = 1;
const OUTBOUND_FROM_DECISION = 2;
const AGENT_NODE_COUNT = 4;
const ZERO = 0;

export const testGraph: Graph = {
  startNode: 'Start',
  agents: [
    { id: 'greet', description: 'Greeting' },
    { id: 'checkout', description: 'Checkout' },
  ],
  nodes: [
    { id: 'Start', text: 'Welcome message', kind: 'agent', agent: 'greet', global: false, description: '' },
    {
      id: 'AskName',
      text: 'Ask for name',
      kind: 'agent',
      agent: 'greet',
      global: false,
      description: 'Asks the user name',
    },
    { id: 'Decision', text: 'Route', kind: 'agent_decision', agent: 'greet', global: false, description: '' },
    { id: 'CartView', text: 'Show cart', kind: 'agent', agent: 'checkout', global: false, description: '' },
    {
      id: 'GlobalFAQ',
      text: 'Answer FAQ',
      kind: 'agent',
      global: true,
      description: 'FAQ handler',
      defaultFallback: true,
    },
  ],
  edges: [
    { from: 'Start', to: 'AskName', preconditions: [{ type: 'user_said', value: 'hi' }] },
    { from: 'AskName', to: 'Decision' },
    { from: 'Decision', to: 'CartView', preconditions: [{ type: 'agent_decision', value: 'wants_cart' }] },
    {
      from: 'Decision',
      to: 'Start',
      contextPreconditions: { preconditions: ['USER_HAS_NAME'], jumpTo: 'AskName' },
    },
  ],
  mcpServers: [
    { id: 'mcp-1', name: 'TestMCP', enabled: true, transport: { type: 'http', url: 'http://test' } },
  ],
  outputSchemas: [{ id: 'schema-1', name: 'NameSchema', fields: [] }],
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  getGraphSummary                                                    */
/* ------------------------------------------------------------------ */

describe('getGraphSummary', () => {
  it('returns summary with correct counts and groupings', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getGraphSummary(buildCtx(), 'agent-1');

    expect(result.startNode).toBe('Start');
    expect(result.totalNodes).toBe(TOTAL_NODES);
    expect(result.totalEdges).toBe(TOTAL_EDGES);
    expect(result.agents).toEqual(['greet', 'checkout']);
    expect(result.globalNodes).toEqual(['GlobalFAQ']);
    expect(result.fallbackNodes).toEqual(['GlobalFAQ']);
  });

  it('collects context flags from edges', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getGraphSummary(buildCtx(), 'agent-1');

    expect(result.contextFlags).toEqual(['USER_HAS_NAME']);
  });

  it('maps mcp servers and output schemas to lightweight summaries', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getGraphSummary(buildCtx(), 'agent-1');

    expect(result.mcpServers).toEqual([{ id: 'mcp-1', name: 'TestMCP', enabled: true }]);
    expect(result.outputSchemas).toEqual([{ id: 'schema-1', name: 'NameSchema' }]);
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(getGraphSummary(buildCtx(), 'missing')).rejects.toThrow('Graph not found: missing');
  });

  it('groups node counts by agent and kind', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getGraphSummary(buildCtx(), 'agent-1');

    expect(result.nodeCountByAgent).toEqual({ greet: GREET_NODE_COUNT, checkout: SINGLE, undefined: SINGLE });
    expect(result.nodeCountByKind).toEqual({ agent: AGENT_NODE_COUNT, agent_decision: SINGLE });
  });
});

/* ------------------------------------------------------------------ */
/*  getNode                                                            */
/* ------------------------------------------------------------------ */

describe('getNode', () => {
  it('returns node details with edge counts', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getNode(buildCtx(), 'agent-1', 'Decision');

    expect(result.node.id).toBe('Decision');
    expect(result.outboundEdgeCount).toBe(OUTBOUND_FROM_DECISION);
    expect(result.inboundEdgeCount).toBe(SINGLE);
    expect(result.inboundFrom).toContain('AskName');
    expect(result.outboundTo).toContain('CartView');
    expect(result.outboundTo).toContain('Start');
  });

  it('returns zero edge counts for isolated node', async () => {
    const isolatedGraph: Graph = { ...testGraph, edges: [] };
    mockAssembleGraph.mockResolvedValue(isolatedGraph);
    const result = await getNode(buildCtx(), 'agent-1', 'Start');

    expect(result.inboundEdgeCount).toBe(ZERO);
    expect(result.outboundEdgeCount).toBe(ZERO);
  });

  it('throws when node not found', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);

    await expect(getNode(buildCtx(), 'agent-1', 'NonExistent')).rejects.toThrow(
      'Node not found: NonExistent'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  getEdgesFrom                                                       */
/* ------------------------------------------------------------------ */

describe('getEdgesFrom', () => {
  it('returns all edges originating from a node', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getEdgesFrom(buildCtx(), 'agent-1', 'Decision');

    expect(result).toHaveLength(OUTBOUND_FROM_DECISION);
    expect(result.every((e) => e.from === 'Decision')).toBe(true);
  });

  it('returns empty array when node has no outgoing edges', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getEdgesFrom(buildCtx(), 'agent-1', 'GlobalFAQ');

    expect(result).toEqual([]);
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(getEdgesFrom(buildCtx(), 'missing', 'Start')).rejects.toThrow('Graph not found: missing');
  });
});

/* ------------------------------------------------------------------ */
/*  getEdgesTo                                                         */
/* ------------------------------------------------------------------ */

describe('getEdgesTo', () => {
  it('returns all edges pointing to a node', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getEdgesTo(buildCtx(), 'agent-1', 'Decision');
    const [firstEdge] = result;

    expect(result).toHaveLength(SINGLE);
    expect(firstEdge?.from).toBe('AskName');
  });

  it('returns single edge from Decision to Start', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getEdgesTo(buildCtx(), 'agent-1', 'Start');
    const [firstEdge] = result;

    expect(result).toHaveLength(SINGLE);
    expect(firstEdge?.from).toBe('Decision');
  });

  it('returns single edge pointing to CartView', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getEdgesTo(buildCtx(), 'agent-1', 'CartView');
    const [firstEdge] = result;

    expect(result).toHaveLength(SINGLE);
    expect(firstEdge?.from).toBe('Decision');
  });
});
