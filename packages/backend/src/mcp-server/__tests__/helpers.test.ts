import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

interface AgentLookupResult {
  id: string;
  productionApiKeyId: string | null;
  startNode: string | null;
}

interface ExecutionKeyAgent {
  agent_id: string;
  agent_name: string;
  agent_slug: string;
}

type GetAgentFn = (
  supabase: SupabaseClient,
  slug: string,
  orgId: string
) => Promise<AgentLookupResult | null>;

type ValidateAccessFn = (supabase: SupabaseClient, keyId: string, agentId: string) => Promise<boolean>;

type GetAgentsForKeyFn = (
  supabase: SupabaseClient,
  keyId: string
) => Promise<{ result: ExecutionKeyAgent[]; error: string | null }>;

const mockGetAgentBySlugAndOrg = jest.fn<GetAgentFn>();
const mockValidateKeyAgentAccess = jest.fn<ValidateAccessFn>();
const mockGetAgentsForKey = jest.fn<GetAgentsForKeyFn>();

jest.unstable_mockModule('../../db/queries/executionAuthQueries.js', () => ({
  getAgentBySlugAndOrg: mockGetAgentBySlugAndOrg,
  validateKeyAgentAccess: mockValidateKeyAgentAccess,
}));

jest.unstable_mockModule('../../db/queries/executionKeyQueries.js', () => ({
  getAgentsForKey: mockGetAgentsForKey,
}));

const { resolveAgentId } = await import('../helpers.js');

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const agentResult: AgentLookupResult = {
  id: 'agent-uuid-1',
  productionApiKeyId: null,
  startNode: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveAgentId — access granted', () => {
  it('returns agentId when key has all-agents access', async () => {
    mockGetAgentBySlugAndOrg.mockResolvedValue(agentResult);
    mockGetAgentsForKey.mockResolvedValue({ result: [], error: null });

    const result = await resolveAgentId(buildCtx(), 'my-agent');

    expect(result).toBe('agent-uuid-1');
    expect(mockValidateKeyAgentAccess).not.toHaveBeenCalled();
  });

  it('returns agentId when key has specific access', async () => {
    mockGetAgentBySlugAndOrg.mockResolvedValue(agentResult);
    mockGetAgentsForKey.mockResolvedValue({
      result: [{ agent_id: 'agent-uuid-1', agent_name: 'My Agent', agent_slug: 'my-agent' }],
      error: null,
    });
    mockValidateKeyAgentAccess.mockResolvedValue(true);

    const result = await resolveAgentId(buildCtx(), 'my-agent');

    expect(result).toBe('agent-uuid-1');
  });
});

describe('resolveAgentId — access denied', () => {
  it('throws when agent slug is not found', async () => {
    mockGetAgentBySlugAndOrg.mockResolvedValue(null);

    await expect(resolveAgentId(buildCtx(), 'missing-agent')).rejects.toThrow(
      'Agent not found: missing-agent'
    );
  });

  it('throws when key lacks access to the agent', async () => {
    mockGetAgentBySlugAndOrg.mockResolvedValue(agentResult);
    mockGetAgentsForKey.mockResolvedValue({
      result: [{ agent_id: 'other-agent', agent_name: 'Other', agent_slug: 'other' }],
      error: null,
    });
    mockValidateKeyAgentAccess.mockResolvedValue(false);

    await expect(resolveAgentId(buildCtx(), 'my-agent')).rejects.toThrow('Access denied for agent: my-agent');
  });
});
