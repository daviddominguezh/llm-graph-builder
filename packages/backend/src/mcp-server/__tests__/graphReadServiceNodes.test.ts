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

const { listNodes, searchNodes, getSubgraph } = await import('../services/graphReadService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const TOTAL_NODES = 5;
const SINGLE = 1;
const SEARCH_LIMIT = 2;
const TEXT_TRUNCATE_LENGTH = 80;
const LONG_TEXT_LENGTH = 100;
const ZERO = 0;
const DEPTH_ZERO = 0;
const DEPTH_ONE = 1;

const testGraph: Graph = {
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
/*  listNodes                                                          */
/* ------------------------------------------------------------------ */

function buildLongTextGraph(): Graph {
  const longText = 'a'.repeat(LONG_TEXT_LENGTH);
  return {
    ...testGraph,
    nodes: [{ id: 'LongNode', text: longText, kind: 'agent', global: false, description: '' }],
    edges: [],
  };
}

describe('listNodes', () => {
  it('returns all nodes with no filters', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await listNodes(buildCtx(), 'agent-1', {});

    expect(result).toHaveLength(TOTAL_NODES);
  });

  it('filters by kind', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await listNodes(buildCtx(), 'agent-1', { kind: 'agent_decision' });
    const [firstNode] = result;

    expect(result).toHaveLength(SINGLE);
    expect(firstNode?.id).toBe('Decision');
  });

  it('filters by agentDomain', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await listNodes(buildCtx(), 'agent-1', { agentDomain: 'checkout' });
    const [firstNode] = result;

    expect(result).toHaveLength(SINGLE);
    expect(firstNode?.id).toBe('CartView');
  });

  it('filters by global flag', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await listNodes(buildCtx(), 'agent-1', { global: true });
    const [firstNode] = result;

    expect(result).toHaveLength(SINGLE);
    expect(firstNode?.id).toBe('GlobalFAQ');
  });

  it('truncates text and reports hasOutputSchema correctly', async () => {
    mockAssembleGraph.mockResolvedValue(buildLongTextGraph());
    const result = await listNodes(buildCtx(), 'agent-1', {});
    const [firstNode] = result;

    expect(firstNode?.text).toHaveLength(TEXT_TRUNCATE_LENGTH);
    expect(firstNode?.hasOutputSchema).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  searchNodes                                                        */
/* ------------------------------------------------------------------ */

describe('searchNodes', () => {
  it('finds nodes by exact id match first', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await searchNodes(buildCtx(), 'agent-1', 'Start');
    const [firstResult] = result;

    expect(firstResult?.id).toBe('Start');
  });

  it('finds nodes by text substring', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await searchNodes(buildCtx(), 'agent-1', 'cart');

    expect(result.some((n) => n.id === 'CartView')).toBe(true);
  });

  it('finds nodes by description substring', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await searchNodes(buildCtx(), 'agent-1', 'FAQ handler');

    expect(result.some((n) => n.id === 'GlobalFAQ')).toBe(true);
  });

  it('respects limit parameter', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await searchNodes(buildCtx(), 'agent-1', 'a', SEARCH_LIMIT);

    expect(result.length).toBeLessThanOrEqual(SEARCH_LIMIT);
  });

  it('returns empty array when no nodes match', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await searchNodes(buildCtx(), 'agent-1', 'zzznomatch');

    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  getSubgraph helpers                                                */
/* ------------------------------------------------------------------ */

interface NodeIdItem {
  id: string;
}

interface EdgeItem {
  from: string;
  to: string;
}

function assertEdgesWithinNodes(nodes: NodeIdItem[], edges: EdgeItem[]): void {
  const nodeIds = nodes.map((n) => n.id);
  edges.forEach((e) => {
    expect(nodeIds).toContain(e.from);
    expect(nodeIds).toContain(e.to);
  });
}

/* ------------------------------------------------------------------ */
/*  getSubgraph                                                        */
/* ------------------------------------------------------------------ */

describe('getSubgraph', () => {
  it('returns only root node at depth 0', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getSubgraph(buildCtx(), 'agent-1', 'Decision', DEPTH_ZERO);
    const { nodes, edges } = result;
    const [firstNode] = nodes;

    expect(nodes).toHaveLength(SINGLE);
    expect(firstNode?.id).toBe('Decision');
    expect(edges).toHaveLength(ZERO);
  });

  it('returns adjacent nodes at depth 1', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getSubgraph(buildCtx(), 'agent-1', 'Decision', DEPTH_ONE);

    const nodeIds = result.nodes.map((n) => n.id);
    expect(nodeIds).toContain('Decision');
    expect(nodeIds).toContain('CartView');
    expect(nodeIds).toContain('AskName');
    expect(nodeIds).toContain('Start');
  });

  it('returns edges between discovered nodes', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    const result = await getSubgraph(buildCtx(), 'agent-1', 'Decision', DEPTH_ONE);

    expect(result.edges.length).toBeGreaterThan(ZERO);
    assertEdgesWithinNodes(result.nodes, result.edges);
  });

  it('throws when root node not found', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);

    await expect(getSubgraph(buildCtx(), 'agent-1', 'Ghost', DEPTH_ONE)).rejects.toThrow(
      'Node not found: Ghost'
    );
  });
});
