import { describe, expect, it, jest } from '@jest/globals';
import type { SelectedTool } from '@daviddh/llm-graph-runner';

import { updateSelectedToolsWithPrecondition } from '../selectedToolsOperations.js';

type FakeResult = {
  data: { selected_tools: SelectedTool[]; updated_at: string } | null;
  error: { code: string } | null;
};

interface FakeBuilder {
  update: jest.Mock;
  eq: jest.Mock;
  select: jest.Mock;
  single: jest.Mock<() => Promise<FakeResult>>;
}

function makeSupabase(
  returnedRow: { selected_tools: SelectedTool[]; updated_at: string } | null,
  error: { code: string } | null = null
) {
  const builder = {} as FakeBuilder;
  builder.update = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.select = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn<() => Promise<FakeResult>>().mockResolvedValue({ data: returnedRow, error });
  return { from: jest.fn().mockReturnValue(builder), _builder: builder };
}

describe('updateSelectedToolsWithPrecondition', () => {
  it('returns updated row on success', async () => {
    const row = { selected_tools: [], updated_at: '2026-04-26T10:00:00.000Z' };
    const sb = makeSupabase(row);
    const tools: SelectedTool[] = [];
    const result = await updateSelectedToolsWithPrecondition(sb as never, {
      agentId: 'a1',
      tools,
      expectedUpdatedAt: '2026-04-26T09:00:00.000Z',
    });
    expect(result).toEqual({ kind: 'ok', row });
  });

  it('returns conflict when no row matches the precondition', async () => {
    const sb = makeSupabase(null, { code: 'PGRST116' });
    const result = await updateSelectedToolsWithPrecondition(sb as never, {
      agentId: 'a1',
      tools: [],
      expectedUpdatedAt: '2026-04-26T09:00:00.000Z',
    });
    expect(result).toEqual({ kind: 'conflict' });
  });
});
