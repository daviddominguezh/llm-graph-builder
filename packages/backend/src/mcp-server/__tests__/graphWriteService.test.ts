import type { Graph, Node, Operation } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type ExecuteOperationsBatchFn = (
  supabase: SupabaseClient,
  agentId: string,
  operations: Operation[]
) => Promise<void>;

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockExecuteOperationsBatch = jest.fn<ExecuteOperationsBatchFn>();
const mockAssembleGraph = jest.fn<AssembleGraphFn>();

jest.unstable_mockModule('../../db/queries/operationExecutor.js', () => ({
  executeOperationsBatch: mockExecuteOperationsBatch,
}));

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

const { addNode, updateNode, deleteNode } = await import('../services/graphWriteService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const AFFECTED_EDGES_COUNT = 1;

const baseNode: Node = {
  id: 'node-1',
  text: 'Hello world',
  kind: 'agent',
  description: 'A greeting node',
  agent: 'greet',
  global: false,
};

const testGraph: Graph = {
  startNode: 'node-1',
  agents: [{ id: 'greet', description: 'Greeting' }],
  nodes: [baseNode, { id: 'node-2', text: 'Response', kind: 'agent', description: '', global: false }],
  edges: [{ from: 'node-1', to: 'node-2', preconditions: [{ type: 'user_said', value: 'hi' }] }],
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  addNode                                                            */
/* ------------------------------------------------------------------ */

describe('addNode — success cases', () => {
  it('calls executeOperationsBatch with insertNode operation', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);
    mockAssembleGraph.mockResolvedValue(testGraph);

    await addNode(ctx, 'agent-1', {
      id: 'node-1',
      text: 'Hello world',
      kind: 'agent',
      description: 'A greeting node',
      agent: 'greet',
    });

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      {
        type: 'insertNode',
        data: {
          nodeId: 'node-1',
          text: 'Hello world',
          kind: 'agent',
          description: 'A greeting node',
          agent: 'greet',
        },
      },
    ]);
  });

  it('reads back the node from assembleGraph after insert', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);
    mockAssembleGraph.mockResolvedValue(testGraph);

    const result = await addNode(ctx, 'agent-1', { id: 'node-1', text: 'Hello world', kind: 'agent' });

    expect(mockAssembleGraph).toHaveBeenCalledWith(ctx.supabase, 'agent-1');
    expect(result.id).toBe('node-1');
  });
});

describe('addNode — error cases', () => {
  it('throws when node not found after insert', async () => {
    mockExecuteOperationsBatch.mockResolvedValue(undefined);
    mockAssembleGraph.mockResolvedValue({ ...testGraph, nodes: [] });

    await expect(addNode(buildCtx(), 'agent-1', { id: 'node-1', text: 'X', kind: 'agent' })).rejects.toThrow(
      'Node not found after insert: node-1'
    );
  });

  it('throws when graph not found after insert', async () => {
    mockExecuteOperationsBatch.mockResolvedValue(undefined);
    mockAssembleGraph.mockResolvedValue(null);

    await expect(addNode(buildCtx(), 'agent-1', { id: 'node-1', text: 'X', kind: 'agent' })).rejects.toThrow(
      'Graph not found: agent-1'
    );
  });

  it('propagates errors from executeOperationsBatch', async () => {
    mockExecuteOperationsBatch.mockRejectedValue(new Error('DB error'));

    await expect(addNode(buildCtx(), 'agent-1', { id: 'node-1', text: 'X', kind: 'agent' })).rejects.toThrow(
      'DB error'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  updateNode                                                         */
/* ------------------------------------------------------------------ */

describe('updateNode', () => {
  it('reads existing node, merges fields, sends updateNode operation', async () => {
    const ctx = buildCtx();
    mockAssembleGraph
      .mockResolvedValueOnce(testGraph) // first call: read current node
      .mockResolvedValueOnce(testGraph); // second call: read back after update
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await updateNode(ctx, 'agent-1', 'node-1', { text: 'Updated text' });

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      {
        type: 'updateNode',
        data: {
          nodeId: 'node-1',
          text: 'Updated text',
          kind: 'agent',
          description: 'A greeting node',
          agent: 'greet',
          global: false,
        },
      },
    ]);
  });

  it('throws when node not found before update', async () => {
    mockAssembleGraph.mockResolvedValue({ ...testGraph, nodes: [] });

    await expect(updateNode(buildCtx(), 'agent-1', 'node-1', { text: 'X' })).rejects.toThrow(
      'Node not found: node-1'
    );
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(updateNode(buildCtx(), 'agent-1', 'node-1', { text: 'X' })).rejects.toThrow(
      'Graph not found: agent-1'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  deleteNode                                                         */
/* ------------------------------------------------------------------ */

describe('deleteNode', () => {
  it('reads graph first, then calls deleteNode operation', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await deleteNode(ctx, 'agent-1', 'node-1');

    expect(mockAssembleGraph).toHaveBeenCalledWith(ctx.supabase, 'agent-1');
    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'deleteNode', nodeId: 'node-1' },
    ]);
  });

  it('returns deleted node and affected edges', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    const { deletedNode, affectedEdges } = await deleteNode(buildCtx(), 'agent-1', 'node-1');
    const [firstEdge] = affectedEdges;

    expect(deletedNode.id).toBe('node-1');
    expect(affectedEdges).toHaveLength(AFFECTED_EDGES_COUNT);
    expect(firstEdge?.from).toBe('node-1');
  });

  it('throws when node not found', async () => {
    mockAssembleGraph.mockResolvedValue({ ...testGraph, nodes: [] });

    await expect(deleteNode(buildCtx(), 'agent-1', 'node-1')).rejects.toThrow('Node not found: node-1');
  });
});
