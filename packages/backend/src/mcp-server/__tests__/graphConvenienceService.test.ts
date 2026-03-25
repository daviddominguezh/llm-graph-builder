import type { Graph } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                 */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;
type ExecuteOpsBatchFn = (supabase: SupabaseClient, agentId: string, ops: unknown[]) => Promise<void>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                  */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockExecuteOps = jest.fn<ExecuteOpsBatchFn>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('../../db/queries/operationExecutor.js', () => ({
  executeOperationsBatch: mockExecuteOps,
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
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const CONTEXT_FLAGS_COUNT = 1;
const TOOL_USAGE_COUNT = 1;
const FIRST_ITEM = 0;

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
    { id: 'B', text: 'Node B', kind: 'agent', description: '', global: false, agent: 'bot' },
    { id: 'C', text: 'Node C', kind: 'agent', description: '', global: false, agent: 'bot' },
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

const OP_INSERT_NODE = expect.objectContaining({ type: 'insertNode' });
const OP_INSERT_EDGE = expect.objectContaining({ type: 'insertEdge' });
const OP_DELETE_EDGE = expect.objectContaining({ type: 'deleteEdge' });
const OP_INSERT_AGENT = expect.objectContaining({ type: 'insertAgent' });

beforeEach(() => {
  jest.clearAllMocks();
  mockExecuteOps.mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------ */
/*  cloneNode                                                           */
/* ------------------------------------------------------------------ */

describe('cloneNode', () => {
  it('clones a node with a new ID', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await cloneNode(ctx, { agentId: 'agent-1', nodeId: 'A', newId: 'A_clone' });
    expect(mockExecuteOps).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([OP_INSERT_NODE])
    );
  });

  it('clones outbound edges when cloneEdges is true', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await cloneNode(ctx, { agentId: 'agent-1', nodeId: 'A', newId: 'A_clone', cloneEdges: true });
    expect(mockExecuteOps).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([OP_INSERT_EDGE])
    );
  });

  it('does not clone edges when cloneEdges is false', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await cloneNode(ctx, { agentId: 'agent-1', nodeId: 'A', newId: 'A_clone', cloneEdges: false });
    expect(mockExecuteOps).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.not.arrayContaining([OP_INSERT_EDGE])
    );
  });

  it('throws when source node not found', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await expect(
      cloneNode(buildCtx(), { agentId: 'agent-1', nodeId: 'MISSING', newId: 'new-id' })
    ).rejects.toThrow('Node not found');
  });
});

const INSERT_BETWEEN_INPUT = {
  agentId: 'agent-1',
  from: 'A',
  to: 'B',
  newNode: { id: 'M', text: 'Middle', kind: 'agent' as const },
};

/* ------------------------------------------------------------------ */
/*  insertNodeBetween                                                   */
/* ------------------------------------------------------------------ */

describe('insertNodeBetween', () => {
  it('inserts a new node between two existing nodes', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await insertNodeBetween(ctx, INSERT_BETWEEN_INPUT);
    expect(mockExecuteOps).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([OP_DELETE_EDGE, OP_INSERT_NODE])
    );
  });

  it('creates two edges after insertion', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await insertNodeBetween(ctx, INSERT_BETWEEN_INPUT);
    expect(mockExecuteOps).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([OP_INSERT_EDGE, OP_INSERT_EDGE])
    );
  });

  it('throws when edge not found', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    const missingInput = {
      agentId: 'agent-1',
      from: 'A',
      to: 'MISSING',
      newNode: { id: 'M', text: 'M', kind: 'agent' as const },
    };
    await expect(insertNodeBetween(buildCtx(), missingInput)).rejects.toThrow('Edge not found');
  });
});

/* ------------------------------------------------------------------ */
/*  swapEdgeTarget                                                      */
/* ------------------------------------------------------------------ */

describe('swapEdgeTarget', () => {
  it('swaps edge target to a new node', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await swapEdgeTarget(ctx, { agentId: 'agent-1', from: 'A', oldTo: 'B', newTo: 'C' });
    expect(mockExecuteOps).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([OP_DELETE_EDGE, OP_INSERT_EDGE])
    );
  });

  it('throws when edge not found', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await expect(
      swapEdgeTarget(buildCtx(), { agentId: 'agent-1', from: 'A', oldTo: 'MISSING', newTo: 'C' })
    ).rejects.toThrow('Edge not found');
  });
});

/* ------------------------------------------------------------------ */
/*  listContextFlags                                                    */
/* ------------------------------------------------------------------ */

describe('listContextFlags', () => {
  it('returns context flags used in the graph', async () => {
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    const result = await listContextFlags(buildCtx(), 'agent-1');
    expect(result).toHaveLength(CONTEXT_FLAGS_COUNT);
    expect(result[FIRST_ITEM]?.flag).toBe('premium_user');
    expect(result[FIRST_ITEM]?.edges.at(FIRST_ITEM)?.jumpTo).toBe('C');
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
    expect(result).toHaveLength(TOOL_USAGE_COUNT);
    expect(result[FIRST_ITEM]?.toolName).toBe('search_tool');
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
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await scaffoldAgentDomain(ctx, 'agent-1', 'Sales', 'linear');
    expect(mockExecuteOps).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([OP_INSERT_AGENT, OP_INSERT_NODE, OP_INSERT_EDGE])
    );
  });

  it('scaffolds a decision_tree domain', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await scaffoldAgentDomain(ctx, 'agent-1', 'Support', 'decision_tree');
    expect(mockExecuteOps).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([OP_INSERT_NODE])
    );
  });

  it('scaffolds a tool_loop domain', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(BASE_GRAPH);
    await scaffoldAgentDomain(ctx, 'agent-1', 'Tools', 'tool_loop');
    expect(mockExecuteOps).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([OP_INSERT_EDGE])
    );
  });
});
