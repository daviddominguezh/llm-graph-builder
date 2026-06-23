import { describe, expect, it, jest } from '@jest/globals';

import { EgressBlockedError } from '../../../lib/egressGuard.js';

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
const { verifyMcpTenantConfig } = await import('./verifyMcpTenant.js');

describe('verifyMcpTenantConfig', () => {
  it('records a redacted error category when discovery is blocked', async () => {
    capturedRow = null;
    const supabase = createClient('http://localhost:54321', 'anon-key');
    const discover = async (): Promise<void> => {
      await Promise.resolve();
      throw new EgressBlockedError('blocked');
    };

    const row = await verifyMcpTenantConfig(
      { supabase, orgId: 'o1', discover },
      {
        agentId: 'a1',
        serverId: 's1',
        tenantId: 't1',
        transport: { type: 'http', url: 'https://example.com/mcp' },
        variableValues: {},
        envByName: {},
        envById: {},
      }
    );

    expect(row.status).toBe('error');
    expect(row.error).toBe('blocked');
    expect(capturedRow).toMatchObject({
      status: 'error',
      error: 'blocked',
      values_hash: expect.any(String),
    });
  });
});
