import type { Graph, Operation } from '@daviddh/graph-types';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

interface MutationResult {
  error: { message: string } | null;
}

interface UpdateBuilder {
  eq: (col: string, val: string) => TouchChain;
}
interface FromBuilder {
  update: (vals: Record<string, unknown>) => UpdateBuilder;
}
interface TouchChain {
  error: MutationResult['error'];
}

const touchChain: TouchChain = { error: null };
const mockEq = jest.fn<(col: string, val: string) => TouchChain>();
const mockUpdate = jest.fn<(vals: Record<string, unknown>) => UpdateBuilder>();
const mockFrom = jest.fn<(table: string) => FromBuilder>();
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<MutationResult>>();

mockEq.mockReturnValue(touchChain);
mockUpdate.mockReturnValue({ eq: mockEq });
mockFrom.mockReturnValue({ update: mockUpdate });

const mockAssembleGraph = jest.fn<(sb: unknown, agentId: string) => Promise<Graph | null>>();
const mockExecuteSingleOperation = jest.fn<(sb: unknown, agentId: string, op: Operation) => Promise<void>>();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ from: mockFrom, rpc: mockRpc }),
}));
jest.unstable_mockModule('../graphQueries.js', () => ({ assembleGraph: mockAssembleGraph }));
jest.unstable_mockModule('../operationDispatch.js', () => ({
  executeSingleOperation: mockExecuteSingleOperation,
}));

const { createClient } = await import('@supabase/supabase-js');
const { executeOperationsBatch } = await import('../operationExecutor.js');

const URL = 'https://fake.supabase.co';
const KEY = 'fake-key';
const makeClient = (): ReturnType<typeof createClient> => createClient(URL, KEY);
const emptyGraph = (): Graph => ({ startNode: '', agents: [], nodes: [], edges: [] });
const del = (nodeId: string): Operation => ({ type: 'deleteNode', nodeId });

interface Signal {
  promise: Promise<void>;
  fire: () => void;
}
function signal(): Signal {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  return {
    promise,
    fire: (): void => {
      resolve(undefined);
    },
  };
}

let stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

beforeEach(() => {
  jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  mockAssembleGraph.mockReset();
  mockExecuteSingleOperation.mockReset();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ error: null });
  mockFrom.mockClear();
  mockUpdate.mockClear();
  mockEq.mockClear();
  touchChain.error = null;
});

afterEach(() => {
  jest.restoreAllMocks();
});

function stderrText(): string {
  return stderrSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
}

describe('executeOperationsBatch', () => {
  it('executes operations sequentially in order', async () => {
    mockAssembleGraph.mockResolvedValue(emptyGraph());
    const order: string[] = [];
    const started1 = signal();
    const release1 = signal();
    mockExecuteSingleOperation.mockImplementation(async (_sb, _id, op) => {
      const id = op.type === 'deleteNode' ? op.nodeId : '';
      order.push(`start:${id}`);
      if (id === 'n1') {
        started1.fire();
        await release1.promise;
      }
      order.push(`end:${id}`);
    });

    const p = executeOperationsBatch(makeClient(), 'agent-seq', [del('n1'), del('n2')]);
    await started1.promise;
    expect(order).toEqual(['start:n1']);

    release1.fire();
    await p;
    expect(order).toEqual(['start:n1', 'end:n1', 'start:n2', 'end:n2']);
  });

});

describe('executeOperationsBatch rollback', () => {
  it('rolls back to the pre-batch snapshot and rethrows when an op fails', async () => {
    const snapshot = emptyGraph();
    mockAssembleGraph.mockResolvedValue(snapshot);
    mockExecuteSingleOperation
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('op-failed'));

    await expect(
      executeOperationsBatch(makeClient(), 'agent-b', [del('ok'), del('bad')])
    ).rejects.toThrow('op-failed');
    expect(mockRpc).toHaveBeenCalledWith('rollback_to_snapshot_tx', {
      p_agent_id: 'agent-b',
      p_snapshot: snapshot,
    });
  });

  it('swallows a rollback RPC error but still rethrows the original error', async () => {
    mockAssembleGraph.mockResolvedValue(emptyGraph());
    mockExecuteSingleOperation.mockRejectedValue(new Error('op-failed'));
    mockRpc.mockResolvedValue({ error: { message: 'rollback-boom' } });

    await expect(executeOperationsBatch(makeClient(), 'agent-c', [del('x')])).rejects.toThrow(
      'op-failed'
    );
    expect(stderrText()).toContain('rollback FAILED');
  });

  it('does not attempt rollback when assembleGraph returned null', async () => {
    mockAssembleGraph.mockResolvedValue(null);
    mockExecuteSingleOperation.mockRejectedValue(new Error('op-failed'));

    await expect(executeOperationsBatch(makeClient(), 'agent-d', [del('x')])).rejects.toThrow(
      'op-failed'
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

});

describe('executeOperationsBatch post-batch and serialization', () => {
  it('swallows a touchAgentUpdatedAt failure (batch still succeeds)', async () => {
    mockAssembleGraph.mockResolvedValue(emptyGraph());
    mockExecuteSingleOperation.mockResolvedValue(undefined);
    touchChain.error = { message: 'touch-fail' };

    await expect(
      executeOperationsBatch(makeClient(), 'agent-e', [del('x')])
    ).resolves.toBeUndefined();
  });

  it('does not interleave two batches for the same agent', async () => {
    mockAssembleGraph.mockResolvedValue(emptyGraph());
    const order: string[] = [];
    const started1 = signal();
    const release1 = signal();
    mockExecuteSingleOperation.mockImplementation(async (_sb, _id, op) => {
      const id = op.type === 'deleteNode' ? op.nodeId : '';
      order.push(`op:${id}`);
      if (id === 'b1') {
        started1.fire();
        await release1.promise;
      }
    });

    const client = makeClient();
    const p1 = executeOperationsBatch(client, 'agent-f', [del('b1')]);
    const p2 = executeOperationsBatch(client, 'agent-f', [del('b2')]);
    await started1.promise;
    expect(order).toEqual(['op:b1']);

    release1.fire();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['op:b1', 'op:b2']);
  });
});
