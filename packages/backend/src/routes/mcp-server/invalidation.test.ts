import { describe, expect, it, jest } from '@jest/globals';

import type { McpTenantConfigRow } from '../../db/queries/mcpTenantConfigQueries.js';
import type { ResetArgs } from '../../db/queries/mcpTenantDiscoveryQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Seam mocks                                                         */
/* ------------------------------------------------------------------ */

const resetCalls: ResetArgs[] = [];

const mockResetDiscovery = jest.fn<(supabase: SupabaseClient, args: ResetArgs) => Promise<void>>(
  async (_supabase, args) => {
    resetCalls.push(args);
    await Promise.resolve();
  }
);

jest.unstable_mockModule('../../db/queries/mcpTenantDiscoveryQueries.js', () => ({
  resetDiscovery: mockResetDiscovery,
}));

interface SelectResult {
  data: McpTenantConfigRow[];
  error: null;
}

let configRowsToReturn: McpTenantConfigRow[] = [];

const mockFrom = jest.fn(() => ({
  select: async (): Promise<SelectResult> => await Promise.resolve({ data: configRowsToReturn, error: null }),
}));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ from: mockFrom }),
}));

const { createClient } = await import('@supabase/supabase-js');
const { staleDiscoveryAfterServerEdit, staleDiscoveryAfterEnvChange } =
  await import('./mcpDiscoveryInvalidation.js');

const supabase = createClient('http://localhost:54321', 'anon-key');

const NONE = 0;

function clearResetCalls(): void {
  resetCalls.length = NONE;
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function configRow(overrides: Partial<McpTenantConfigRow>): McpTenantConfigRow {
  return {
    agent_id: 'a1',
    server_id: 's1',
    tenant_id: 't1',
    variable_values: {},
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('staleDiscoveryAfterServerEdit', () => {
  it('resets every tenant discovery row for the edited server', async () => {
    clearResetCalls();
    await staleDiscoveryAfterServerEdit(supabase, 'agent-1', 'server-9');
    expect(resetCalls).toEqual([{ agentId: 'agent-1', serverId: 'server-9' }]);
  });
});

describe('staleDiscoveryAfterEnvChange', () => {
  it('resets only cells whose config references the changed env var', async () => {
    clearResetCalls();
    configRowsToReturn = [
      configRow({
        agent_id: 'a1',
        server_id: 's1',
        tenant_id: 't1',
        variable_values: { HOST: { type: 'env_ref', envVariableId: 'env-7' } },
      }),
      configRow({
        agent_id: 'a2',
        server_id: 's2',
        tenant_id: 't2',
        variable_values: { HOST: { type: 'env_ref', envVariableId: 'other' } },
      }),
      configRow({
        agent_id: 'a3',
        server_id: 's3',
        tenant_id: 't3',
        variable_values: { HOST: { type: 'direct', value: 'x' } },
      }),
    ];
    await staleDiscoveryAfterEnvChange(supabase, 'env-7');
    expect(resetCalls).toEqual([{ agentId: 'a1', serverId: 's1', tenantId: 't1' }]);
  });

  it('resets nothing when no config references the env var', async () => {
    clearResetCalls();
    configRowsToReturn = [configRow({ variable_values: { A: { type: 'direct', value: '1' } } })];
    await staleDiscoveryAfterEnvChange(supabase, 'env-missing');
    expect(resetCalls).toHaveLength(NONE);
  });
});
