import { describe, expect, it, jest } from '@jest/globals';

interface MutationResult {
  error: { message: string } | null;
}

interface UpsertChain {
  upsert: (row: Record<string, unknown>) => Promise<MutationResult>;
}

const OK_RESULT: MutationResult = { error: null };

let capturedRow: Record<string, unknown> | null = null;

function makeChain(): UpsertChain {
  return {
    upsert: async (row: Record<string, unknown>): Promise<MutationResult> => {
      capturedRow = row;
      return await Promise.resolve(OK_RESULT);
    },
  };
}

const mockFrom = jest.fn<(table: string) => UpsertChain>(() => makeChain());

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ from: mockFrom }),
}));

const { createClient } = await import('@supabase/supabase-js');
const { upsertDiscoveryResult } = await import('./mcpTenantDiscoveryQueries.js');

describe('upsertDiscoveryResult', () => {
  it('upserts a row keyed by (agent, server, tenant) with the status', async () => {
    capturedRow = null;
    const supabase = createClient('http://localhost:54321', 'anon-key');
    await upsertDiscoveryResult(supabase, {
      agentId: 'a1',
      serverId: 's1',
      tenantId: 't1',
      status: 'ok',
      error: null,
      valuesHash: 'h',
    });
    expect(capturedRow).toMatchObject({
      agent_id: 'a1',
      server_id: 's1',
      tenant_id: 't1',
      status: 'ok',
    });
  });
});
