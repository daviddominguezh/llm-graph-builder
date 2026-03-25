import type { Graph, Operation } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                 */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;
type ExecuteOperationsBatchFn = (
  supabase: SupabaseClient,
  agentId: string,
  ops: Operation[]
) => Promise<void>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                  */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockExecuteOperationsBatch = jest.fn<ExecuteOperationsBatchFn>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('../../db/queries/operationExecutor.js', () => ({
  executeOperationsBatch: mockExecuteOperationsBatch,
}));

const {
  cloneNode,
  insertNodeBetween,
  swapEdgeTarget,
  listContextFlags,
  getMcpToolUsage,
  scaffoldAgentDomain,
} = await import('../services/graphConvenienceService.js');

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
    { id: 'A', text: 'Node A', kind: 'agent', description: '', global: false, agent: 'bot' },
    { id: 'B', text: 'Node B', kind: 'agent', description: '', global: false, agent: 'bot', nextNodeIsUser: true },
    { id: 'C', text: 'Node C', kind: 'agent', description: '', global: false, agent: 'bot', nextNodeIsUser: true },
  ],
  edges: [
    {
      from: 'A',
      to: 'B',
      preconditions: [{ type: 'user_said', value: 'hello' }],
      contextPreconditions: { preconditions: ['premium_user'], jumpTo: 'C' },
    },
    { from: 'A', to: 'C', preconditions: [{ type: 'tool_call', value: 'search_tool' }] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockExecuteOperationsBatch.mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------ */
/*  cloneNode                                                           */
/* ------------------------------------------------------------------ */

describe('cloneNode', () => {
  it('clones a node with a new ID', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await cloneNode(buildCtx(), 'agent-1', 'A', 'A_clone');

    expect(mockExecuteOperationsBatch).toHaveBeenCalled();
    const [, , ops] = mockExecuteOperationsBatch.mock.calls[0] ?? [];
    const insertOp = (ops as Operation[]).find((o) => o.type === 'insertNode');
    expect(insertOp).toBeDefined();
  });

  it('clones outbound edges when cloneEdges is true', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await cloneNode(buildCtx(), 'agent-1', 'A', 'A_clone', true);

    const [, , ops] = mockExecuteOperationsBatch.mock.calls[0] ?? [];
    const edgeOps = (ops as Operation[]).filter((o) => o.type === 'insertEdge');
    expect(edgeOps.length).toBeGreaterThan(0);
  });

  it('does not clone edges when cloneEdges is false', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await cloneNode(buildCtx(), 'agent-1', 'A', 'A_clone', false);

    const [, , ops] = mockExecuteOperationsBatch.mock.calls[0] ?? [];
    const edgeOps = (ops as Operation[]).filter((o) => o.type === 'insertEdge');
    expect(edgeOps).toHaveLength(0);
  });

  it('throws when source node not found', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await expect(cloneNode(buildCtx(), 'agent-1', 'MISSING', 'new-id')).rejects.toThrow('Node not found');
  });
});

/* ------------------------------------------------------------------ */
/*  insertNodeBetween                                                   */
/* ------------------------------------------------------------------ */

describe('insertNodeBetween', () => {
  it('inserts a new node between two existing nodes', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await insertNodeBetween(buildCtx(), 'agent-1', 'A', 'B', {
      id: 'M',
      text: 'Middle',
      kind: 'agent',
    });

    const [, , ops] = mockExecuteOperationsBatch.mock.calls[0] ?? [];
    const typedOps = ops as Operation[];
    expect(typedOps.some((o) => o.type === 'deleteEdge')).toBe(true);
    expect(typedOps.some((o) => o.type === 'insertNode')).toBe(true);
  });

  it('inherits preconditions from original edge', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await insertNodeBetween(buildCtx(), 'agent-1', 'A', 'B', {
      id: 'M',
      text: 'Middle',
      kind: 'agent',
    });

    const [, , ops] = mockExecuteOperationsBatch.mock.calls[0] ?? [];
    const insertEdgeOps = (ops as Operation[]).filter((o) => o.type === 'insertEdge');
    expect(insertEdgeOps.length).toBe(2);
  });

  it('throws when edge not found', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await expect(
      insertNodeBetween(buildCtx(), 'agent-1', 'A', 'MISSING', { id: 'M', text: 'M', kind: 'agent' })
    ).rejects.toThrow('Edge not found');
  });
});

/* ------------------------------------------------------------------ */
/*  swapEdgeTarget                                                      */
/* ------------------------------------------------------------------ */

describe('swapEdgeTarget', () => {
  it('swaps edge target to a new node', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await swapEdgeTarget(buildCtx(), 'agent-1', 'A', 'B', 'C');

    const [, , ops] = mockExecuteOperationsBatch.mock.calls[0] ?? [];
    const typedOps = ops as Operation[];
    expect(typedOps.some((o) => o.type === 'deleteEdge')).toBe(true);
    expect(typedOps.some((o) => o.type === 'insertEdge')).toBe(true);
  });

  it('throws when edge not found', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await expect(swapEdgeTarget(buildCtx(), 'agent-1', 'A', 'MISSING', 'C')).rejects.toThrow('Edge not found');
  });
});

/* ------------------------------------------------------------------ */
/*  listContextFlags                                                    */
/* ------------------------------------------------------------------ */

describe('listContextFlags', () => {
  it('returns context flags used in the graph', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    const result = await listContextFlags(buildCtx(), 'agent-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.flag).toBe('premium_user');
    expect(result[0]?.edges[0]?.jumpTo).toBe('C');
  });

  it('returns empty array when no context flags exist', async () => {
    const noFlagGraph: Graph = { ...BASE_GRAPH, edges: [{ from: 'A', to: 'B' }] };
    mockAssembleGraph.mockResolvedValue(noFlagGraph);

    const result = await listContextFlags(buildCtx(), 'agent-1');

    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  getMcpToolUsage                                                     */
/* ------------------------------------------------------------------ */

describe('getMcpToolUsage', () => {
  it('returns MCP tool usage from tool_call edges', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    const result = await getMcpToolUsage(buildCtx(), 'agent-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.toolName).toBe('search_tool');
  });

  it('returns empty array when no tool_call edges exist', async () => {
    const noToolGraph: Graph = {
      ...BASE_GRAPH,
      edges: [{ from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'hi' }] }],
    };
    mockAssembleGraph.mockResolvedValue(noToolGraph);

    const result = await getMcpToolUsage(buildCtx(), 'agent-1');

    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  scaffoldAgentDomain                                                 */
/* ------------------------------------------------------------------ */

describe('scaffoldAgentDomain', () => {
  it('scaffolds a linear domain with nodes and edges', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await scaffoldAgentDomain(buildCtx(), 'agent-1', 'Sales', 'linear');

    const [, , ops] = mockExecuteOperationsBatch.mock.calls[0] ?? [];
    const typedOps = ops as Operation[];
    expect(typedOps.some((o) => o.type === 'insertAgent')).toBe(true);
    expect(typedOps.some((o) => o.type === 'insertNode')).toBe(true);
    expect(typedOps.some((o) => o.type === 'insertEdge')).toBe(true);
  });

  it('scaffolds a decision_tree domain', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await scaffoldAgentDomain(buildCtx(), 'agent-1', 'Support', 'decision_tree');

    const [, , ops] = mockExecuteOperationsBatch.mock.calls[0] ?? [];
    const typedOps = ops as Operation[];
    const nodeOps = typedOps.filter((o) => o.type === 'insertNode');
    expect(nodeOps.length).toBe(3);
  });

  it('scaffolds a tool_loop domain', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);

    await scaffoldAgentDomain(buildCtx(), 'agent-1', 'Tools', 'tool_loop');

    const [, , ops] = mockExecuteOperationsBatch.mock.calls[0] ?? [];
    const typedOps = ops as Operation[];
    const edgeOps = typedOps.filter((o) => o.type === 'insertEdge');
    expect(edgeOps.length).toBeGreaterThan(2);
  });
});
