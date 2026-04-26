import { describe, expect, it, jest } from '@jest/globals';
import type { SelectedTool } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../operationHelpers.js';

type QueryResult = {
  data: { selected_tools: SelectedTool[]; updated_at: string } | null;
  error: { code: string; message: string } | null;
};

type SingleFn = jest.MockedFunction<() => Promise<QueryResult>>;

interface FakeChain {
  update: jest.MockedFunction<(vals: object) => FakeChain>;
  eq: jest.MockedFunction<(col: string, val: string) => FakeChain>;
  select: jest.MockedFunction<(cols: string) => FakeChain>;
  single: SingleFn;
}

function makeChain(result: QueryResult): FakeChain {
  const chain = {} as FakeChain;
  chain.update = jest.fn<(vals: object) => FakeChain>().mockReturnValue(chain);
  chain.eq = jest.fn<(col: string, val: string) => FakeChain>().mockReturnValue(chain);
  chain.select = jest.fn<(cols: string) => FakeChain>().mockReturnValue(chain);
  chain.single = jest.fn<() => Promise<QueryResult>>().mockResolvedValue(result);
  return chain;
}

function makeClient(result: QueryResult): SupabaseClient {
  const chain = makeChain(result);
  return { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

const { updateSelectedToolsWithPrecondition } = await import('../selectedToolsOperations.js');

describe('updateSelectedToolsWithPrecondition', () => {
  it('returns updated row on success', async () => {
    const row = { selected_tools: [], updated_at: '2026-04-26T10:00:00.000Z' };
    const sb = makeClient({ data: row, error: null });
    const tools: SelectedTool[] = [];
    const result = await updateSelectedToolsWithPrecondition(sb, {
      agentId: 'a1',
      tools,
      expectedUpdatedAt: '2026-04-26T09:00:00.000Z',
    });
    expect(result).toEqual({ kind: 'ok', row });
  });

  it('returns conflict when no row matches the precondition', async () => {
    const sb = makeClient({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    const result = await updateSelectedToolsWithPrecondition(sb, {
      agentId: 'a1',
      tools: [],
      expectedUpdatedAt: '2026-04-26T09:00:00.000Z',
    });
    expect(result).toEqual({ kind: 'conflict' });
  });
});
