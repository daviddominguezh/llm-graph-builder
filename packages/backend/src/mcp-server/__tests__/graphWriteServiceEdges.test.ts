import type { Graph, Operation } from '@daviddh/graph-types';
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

const { addEdge, updateEdge, deleteEdge, setStartNode, batchMutate } =
  await import('../services/graphWriteService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const BATCH_OPS_COUNT = 2;

const testGraph: Graph = {
  startNode: 'node-1',
  agents: [{ id: 'greet', description: 'Greeting' }],
  nodes: [
    { id: 'node-1', text: 'Hello', kind: 'agent', description: '', global: false },
    { id: 'node-2', text: 'Response', kind: 'agent', description: '', global: false },
  ],
  edges: [{ from: 'node-1', to: 'node-2', preconditions: [{ type: 'user_said', value: 'hi' }] }],
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  addEdge                                                            */
/* ------------------------------------------------------------------ */

describe('addEdge', () => {
  it('calls executeOperationsBatch with insertEdge operation', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);
    mockAssembleGraph.mockResolvedValue(testGraph);

    await addEdge(ctx, 'agent-1', {
      from: 'node-1',
      to: 'node-2',
      preconditions: [{ type: 'user_said', value: 'hi' }],
    });

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      {
        type: 'insertEdge',
        data: {
          from: 'node-1',
          to: 'node-2',
          preconditions: [{ type: 'user_said', value: 'hi' }],
          contextPreconditions: undefined,
        },
      },
    ]);
  });

  it('returns the inserted edge from the graph', async () => {
    mockExecuteOperationsBatch.mockResolvedValue(undefined);
    mockAssembleGraph.mockResolvedValue(testGraph);

    const result = await addEdge(buildCtx(), 'agent-1', { from: 'node-1', to: 'node-2' });

    expect(result.from).toBe('node-1');
    expect(result.to).toBe('node-2');
  });

  it('throws when edge not found after insert', async () => {
    mockExecuteOperationsBatch.mockResolvedValue(undefined);
    mockAssembleGraph.mockResolvedValue({ ...testGraph, edges: [] });

    await expect(addEdge(buildCtx(), 'agent-1', { from: 'node-1', to: 'node-2' })).rejects.toThrow(
      'Edge not found after insert: node-1 -> node-2'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  updateEdge                                                         */
/* ------------------------------------------------------------------ */

describe('updateEdge', () => {
  it('calls executeOperationsBatch with updateEdge operation', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await updateEdge(ctx, 'agent-1', {
      from: 'node-1',
      to: 'node-2',
      fields: { preconditions: [{ type: 'agent_decision', value: 'yes' }] },
    });

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      {
        type: 'updateEdge',
        data: { from: 'node-1', to: 'node-2', preconditions: [{ type: 'agent_decision', value: 'yes' }] },
      },
    ]);
  });

  it('propagates errors from executeOperationsBatch', async () => {
    mockExecuteOperationsBatch.mockRejectedValue(new Error('Edge update failed'));

    await expect(
      updateEdge(buildCtx(), 'agent-1', {
        from: 'node-1',
        to: 'node-2',
        fields: { preconditions: [{ type: 'user_said', value: 'ok' }] },
      })
    ).rejects.toThrow('Edge update failed');
  });
});

/* ------------------------------------------------------------------ */
/*  deleteEdge                                                         */
/* ------------------------------------------------------------------ */

describe('deleteEdge', () => {
  it('calls executeOperationsBatch with deleteEdge operation', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await deleteEdge(ctx, 'agent-1', 'node-1', 'node-2');

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'deleteEdge', from: 'node-1', to: 'node-2' },
    ]);
  });

  it('propagates errors from executeOperationsBatch', async () => {
    mockExecuteOperationsBatch.mockRejectedValue(new Error('Delete failed'));

    await expect(deleteEdge(buildCtx(), 'agent-1', 'node-1', 'node-2')).rejects.toThrow('Delete failed');
  });
});

/* ------------------------------------------------------------------ */
/*  setStartNode                                                       */
/* ------------------------------------------------------------------ */

describe('setStartNode', () => {
  it('calls executeOperationsBatch with updateStartNode operation', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await setStartNode(ctx, 'agent-1', 'node-2');

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'updateStartNode', startNode: 'node-2' },
    ]);
  });

  it('propagates errors from executeOperationsBatch', async () => {
    mockExecuteOperationsBatch.mockRejectedValue(new Error('Set start node failed'));

    await expect(setStartNode(buildCtx(), 'agent-1', 'node-2')).rejects.toThrow('Set start node failed');
  });
});

/* ------------------------------------------------------------------ */
/*  batchMutate                                                        */
/* ------------------------------------------------------------------ */

describe('batchMutate', () => {
  it('passes operations to executeOperationsBatch and returns applied count', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);
    mockAssembleGraph.mockResolvedValue(testGraph);

    const ops: Operation[] = [
      { type: 'insertNode', data: { nodeId: 'n1', text: 'Hello', kind: 'agent' } },
      { type: 'deleteEdge', from: 'node-1', to: 'node-2' },
    ];

    const result = await batchMutate(ctx, 'agent-1', ops);

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', ops);
    expect(result.applied).toBe(BATCH_OPS_COUNT);
  });

  it('skips graph validation when validateAfter is false', async () => {
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    const ops: Operation[] = [{ type: 'updateStartNode', startNode: 'node-1' }];

    await batchMutate(buildCtx(), 'agent-1', ops, false);

    expect(mockAssembleGraph).not.toHaveBeenCalled();
  });

  it('reads graph for validation when validateAfter is true', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);
    mockAssembleGraph.mockResolvedValue(testGraph);

    const ops: Operation[] = [{ type: 'updateStartNode', startNode: 'node-1' }];

    await batchMutate(ctx, 'agent-1', ops, true);

    expect(mockAssembleGraph).toHaveBeenCalledWith(ctx.supabase, 'agent-1');
  });

  it('propagates errors from executeOperationsBatch', async () => {
    mockExecuteOperationsBatch.mockRejectedValue(new Error('Batch failed'));

    await expect(
      batchMutate(buildCtx(), 'agent-1', [{ type: 'updateStartNode', startNode: 'node-1' }])
    ).rejects.toThrow('Batch failed');
  });
});
