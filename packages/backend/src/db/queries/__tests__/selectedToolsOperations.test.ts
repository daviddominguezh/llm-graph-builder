import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { describe, expect, it, jest } from '@jest/globals';

interface QueryResult {
  data: { selected_tools: SelectedTool[]; updated_at: string } | null;
  error: { code: string; message: string } | null;
}

type SingleFn = jest.MockedFunction<() => Promise<QueryResult>>;
type EqFn = jest.MockedFunction<(col: string, val: string) => ChainMock>;
type SelectFn = jest.MockedFunction<(cols: string) => ChainMock>;
type UpdateFn = jest.MockedFunction<(vals: object) => ChainMock>;

interface ChainMock {
  update: UpdateFn;
  eq: EqFn;
  select: SelectFn;
  single: SingleFn;
}

const mockSingle = jest.fn<() => Promise<QueryResult>>();
const mockEq = jest.fn<(col: string, val: string) => ChainMock>();
const mockSelect = jest.fn<(cols: string) => ChainMock>();
const mockUpdate = jest.fn<(vals: object) => ChainMock>();
const mockFrom = jest.fn<(table: string) => ChainMock>();

const chain: ChainMock = {
  update: mockUpdate,
  eq: mockEq,
  select: mockSelect,
  single: mockSingle,
};

mockFrom.mockReturnValue(chain);
mockUpdate.mockReturnValue(chain);
mockEq.mockReturnValue(chain);
mockSelect.mockReturnValue(chain);

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ from: mockFrom }),
}));

const { createClient } = await import('@supabase/supabase-js');
const { updateSelectedToolsWithPrecondition, fetchAgentSelectedTools } =
  await import('../selectedToolsOperations.js');

describe('updateSelectedToolsWithPrecondition', () => {
  it('returns updated row on success', async () => {
    const row = { selected_tools: [], updated_at: '2026-04-26T10:00:00.000Z' };
    mockSingle.mockResolvedValue({ data: row, error: null });
    const sb = createClient('https://fake.supabase.co', 'fake-key');
    const tools: SelectedTool[] = [];
    const result = await updateSelectedToolsWithPrecondition(sb, {
      agentId: 'a1',
      tools,
      expectedUpdatedAt: '2026-04-26T09:00:00.000Z',
    });
    expect(result).toEqual({ kind: 'ok', row });
  });

  it('returns conflict when no row matches the precondition', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    const sb = createClient('https://fake.supabase.co', 'fake-key');
    const result = await updateSelectedToolsWithPrecondition(sb, {
      agentId: 'a1',
      tools: [],
      expectedUpdatedAt: '2026-04-26T09:00:00.000Z',
    });
    expect(result).toEqual({ kind: 'conflict' });
  });
});

describe('fetchAgentSelectedTools', () => {
  it('returns selected tools when agent exists', async () => {
    const row = { selected_tools: [], updated_at: '2026-04-26T10:00:00.000Z' };
    mockSingle.mockResolvedValue({ data: row, error: null });
    const sb = createClient('https://fake.supabase.co', 'fake-key');
    const result = await fetchAgentSelectedTools(sb, 'agent-1');
    expect(result).toEqual(row);
  });

  it('returns null when agent not found (PGRST116)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    const sb = createClient('https://fake.supabase.co', 'fake-key');
    const result = await fetchAgentSelectedTools(sb, 'missing-agent');
    expect(result).toBeNull();
  });
});
