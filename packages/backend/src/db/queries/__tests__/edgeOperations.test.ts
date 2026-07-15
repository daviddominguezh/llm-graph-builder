import type { Operation } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDelete = jest.fn<() => Builder>();
const mockEq = jest.fn<(col: string, val: string) => Builder>();
const mockFrom = jest.fn<(table: string) => Builder>();
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<MutationResult>>();

interface MutationResult {
  error: { message: string } | null;
}
interface Builder {
  delete: typeof mockDelete;
  eq: typeof mockEq;
  error: MutationResult['error'];
}

const builder: Builder = { delete: mockDelete, eq: mockEq, error: null };
mockDelete.mockReturnValue(builder);
mockEq.mockReturnValue(builder);
mockFrom.mockReturnValue(builder);

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ from: mockFrom, rpc: mockRpc }),
}));

const { createClient } = await import('@supabase/supabase-js');
const { insertEdge, updateEdge, deleteEdge } = await import('../edgeOperations.js');

const URL = 'https://fake.supabase.co';
const KEY = 'fake-key';
const AGENT = 'agent-1';
const makeClient = (): ReturnType<typeof createClient> => createClient(URL, KEY);

type EdgeData = Extract<Operation, { type: 'insertEdge' }>['data'];
const TOOL = { providerType: 'mcp' as const, providerId: 'p1', toolName: 'search' };
const TOOL_FIELDS = { q: { type: 'fixed' as const, value: 'x' } };

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ error: null });
  mockFrom.mockClear();
  mockDelete.mockClear();
  mockEq.mockClear();
  builder.error = null;
});

describe('insertEdge / updateEdge', () => {
  it('maps tool_call preconditions with JSON-encoded value, toolFields and tool ref', async () => {
    const data: EdgeData = {
      from: 'a',
      to: 'b',
      preconditions: [{ type: 'tool_call', tool: TOOL, toolFields: TOOL_FIELDS, description: 'd' }],
    };
    await insertEdge(makeClient(), AGENT, data);

    expect(mockRpc).toHaveBeenCalledWith('upsert_edge_tx', {
      p_agent_id: AGENT,
      p_from_node: 'a',
      p_to_node: 'b',
      p_preconditions: [
        {
          type: 'tool_call',
          value: JSON.stringify(TOOL),
          description: 'd',
          toolFields: TOOL_FIELDS,
          tool: TOOL,
        },
      ],
      p_context_preconditions: null,
    });
  });

});

describe('insertEdge / updateEdge other mapping', () => {
  it('maps user_said preconditions with plain value and defaulted description', async () => {
    const data: EdgeData = { from: 'a', to: 'b', preconditions: [{ type: 'user_said', value: 'hi' }] };
    await updateEdge(makeClient(), AGENT, data);

    expect(mockRpc).toHaveBeenCalledWith(
      'upsert_edge_tx',
      expect.objectContaining({
        p_preconditions: [{ type: 'user_said', value: 'hi', description: '' }],
      })
    );
  });

  it('maps contextPreconditions when present', async () => {
    const data: EdgeData = {
      from: 'a',
      to: 'b',
      contextPreconditions: { preconditions: ['x', 'y'], jumpTo: 'n2' },
    };
    await insertEdge(makeClient(), AGENT, data);

    expect(mockRpc).toHaveBeenCalledWith(
      'upsert_edge_tx',
      expect.objectContaining({
        p_preconditions: [],
        p_context_preconditions: { preconditions: ['x', 'y'], jumpTo: 'n2' },
      })
    );
  });

  it('sends an empty array and null context when preconditions are undefined', async () => {
    await insertEdge(makeClient(), AGENT, { from: 'a', to: 'b' });

    expect(mockRpc).toHaveBeenCalledWith(
      'upsert_edge_tx',
      expect.objectContaining({ p_preconditions: [], p_context_preconditions: null })
    );
  });

});

describe('insertEdge / updateEdge errors', () => {
  it('throws when the upsert RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'rpc-boom' } });
    await expect(insertEdge(makeClient(), AGENT, { from: 'a', to: 'b' })).rejects.toThrow(
      'upsertEdgeAtomic: rpc-boom'
    );
  });
});

describe('deleteEdge', () => {
  it('deletes filtering by agent_id, from_node and to_node', async () => {
    await deleteEdge(makeClient(), AGENT, 'a', 'b');

    expect(mockFrom).toHaveBeenCalledWith('graph_edges');
    expect(mockEq.mock.calls).toEqual([
      ['agent_id', AGENT],
      ['from_node', 'a'],
      ['to_node', 'b'],
    ]);
  });

  it('propagates a mutation error', async () => {
    builder.error = { message: 'boom' };
    await expect(deleteEdge(makeClient(), AGENT, 'a', 'b')).rejects.toThrow('deleteEdge: boom');
  });
});
