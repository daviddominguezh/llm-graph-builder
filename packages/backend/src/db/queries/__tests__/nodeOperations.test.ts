import type { Operation } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockUpsert = jest.fn<(row: Record<string, unknown>, opts: Record<string, string>) => Builder>();
const mockUpdate = jest.fn<(row: Record<string, unknown>) => Builder>();
const mockDelete = jest.fn<() => Builder>();
const mockEq = jest.fn<(col: string, val: string) => Builder>();
const mockFrom = jest.fn<(table: string) => Builder>();

interface Builder {
  upsert: typeof mockUpsert;
  update: typeof mockUpdate;
  delete: typeof mockDelete;
  eq: typeof mockEq;
  error: { message: string } | null;
}

const builder: Builder = {
  upsert: mockUpsert,
  update: mockUpdate,
  delete: mockDelete,
  eq: mockEq,
  error: null,
};

mockUpsert.mockReturnValue(builder);
mockUpdate.mockReturnValue(builder);
mockDelete.mockReturnValue(builder);
mockEq.mockReturnValue(builder);
mockFrom.mockReturnValue(builder);

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ from: mockFrom }),
}));

const { createClient } = await import('@supabase/supabase-js');
const { insertNode, updateNode, deleteNode } = await import('../nodeOperations.js');

const URL = 'https://fake.supabase.co';
const KEY = 'fake-key';
const AGENT = 'agent-1';
const POS_X = 1;
const POS_Y = 2;
const makeClient = (): ReturnType<typeof createClient> => createClient(URL, KEY);

const nodeData = (): Extract<Operation, { type: 'insertNode' }>['data'] => ({
  nodeId: 'n1',
  text: 'hello',
  kind: 'agent',
  outputSchemaId: 'os1',
  outputPrompt: 'prompt',
  position: { x: POS_X, y: POS_Y },
});

beforeEach(() => {
  mockFrom.mockClear();
  mockUpsert.mockClear();
  mockUpdate.mockClear();
  mockDelete.mockClear();
  mockEq.mockClear();
  builder.error = null;
});

describe('insertNode', () => {
  it('upserts a row with output/position fields and the composite onConflict', async () => {
    await insertNode(makeClient(), AGENT, nodeData());

    expect(mockFrom).toHaveBeenCalledWith('graph_nodes');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: AGENT,
        node_id: 'n1',
        output_schema_id: 'os1',
        output_prompt: 'prompt',
        position_x: POS_X,
        position_y: POS_Y,
      }),
      { onConflict: 'agent_id,node_id' }
    );
  });

  it('propagates a mutation error', async () => {
    builder.error = { message: 'boom' };
    await expect(insertNode(makeClient(), AGENT, nodeData())).rejects.toThrow('insertNode: boom');
  });
});

describe('updateNode', () => {
  it('updates and filters by agent_id then node_id', async () => {
    await updateNode(makeClient(), AGENT, nodeData());

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ node_id: 'n1' }));
    expect(mockEq.mock.calls).toEqual([
      ['agent_id', AGENT],
      ['node_id', 'n1'],
    ]);
  });

  it('propagates a mutation error', async () => {
    builder.error = { message: 'boom' };
    await expect(updateNode(makeClient(), AGENT, nodeData())).rejects.toThrow('updateNode: boom');
  });
});

describe('deleteNode', () => {
  it('deletes from-edges, then to-edges, then the node in order', async () => {
    await deleteNode(makeClient(), AGENT, 'n1');

    expect(mockFrom.mock.calls).toEqual([['graph_edges'], ['graph_edges'], ['graph_nodes']]);
    expect(mockEq.mock.calls).toEqual([
      ['agent_id', AGENT],
      ['from_node', 'n1'],
      ['agent_id', AGENT],
      ['to_node', 'n1'],
      ['agent_id', AGENT],
      ['node_id', 'n1'],
    ]);
  });

  it('propagates a mutation error from the first edge delete', async () => {
    builder.error = { message: 'boom' };
    await expect(deleteNode(makeClient(), AGENT, 'n1')).rejects.toThrow(
      'deleteRelatedEdges:from: boom'
    );
  });
});
