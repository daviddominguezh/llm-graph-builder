import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AgentMetadata, AgentRow } from '../../db/queries/agentQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type GetAgentsByOrgFn = (
  supabase: SupabaseClient,
  orgId: string
) => Promise<{ result: AgentMetadata[]; error: string | null }>;

type GetAgentBySlugFn = (
  supabase: SupabaseClient,
  slug: string
) => Promise<{ result: AgentRow | null; error: string | null }>;

type InsertAgentFn = (
  supabase: SupabaseClient,
  input: { orgId: string; name: string; slug: string; description: string }
) => Promise<{ result: AgentRow | null; error: string | null }>;

type UpdateAgentFn = (
  supabase: SupabaseClient,
  agentId: string,
  fields: { name?: string; description?: string }
) => Promise<{ error: string | null }>;

type DeleteAgentFn = (supabase: SupabaseClient, agentId: string) => Promise<{ error: string | null }>;

type GenerateSlugFn = (name: string) => string;
type FindUniqueSlugFn = (supabase: SupabaseClient, base: string, table: string) => Promise<string>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockGetAgentsByOrg = jest.fn<GetAgentsByOrgFn>();
const mockGetAgentBySlug = jest.fn<GetAgentBySlugFn>();
const mockInsertAgent = jest.fn<InsertAgentFn>();
const mockUpdateAgentQuery = jest.fn<UpdateAgentFn>();
const mockDeleteAgentQuery = jest.fn<DeleteAgentFn>();
const mockGenerateSlug = jest.fn<GenerateSlugFn>();
const mockFindUniqueSlug = jest.fn<FindUniqueSlugFn>();

jest.unstable_mockModule('../../db/queries/agentQueries.js', () => ({
  getAgentsByOrg: mockGetAgentsByOrg,
  getAgentBySlug: mockGetAgentBySlug,
  insertAgent: mockInsertAgent,
  updateAgent: mockUpdateAgentQuery,
  deleteAgent: mockDeleteAgentQuery,
}));

jest.unstable_mockModule('../../db/queries/slugQueries.js', () => ({
  generateSlug: mockGenerateSlug,
  findUniqueSlug: mockFindUniqueSlug,
}));

const { listAgents, createAgent, getAgent, updateAgent, deleteAgent } =
  await import('../services/agentService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const AGENT_VERSION = 1;

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const agentMetadata: AgentMetadata = {
  id: 'agent-1',
  name: 'My Agent',
  slug: 'my-agent',
  description: 'A test agent',
  version: AGENT_VERSION,
  updated_at: '2024-01-01T00:00:00Z',
  published_at: null,
};

const agentRow: AgentRow = {
  id: 'agent-1',
  org_id: 'org-1',
  name: 'My Agent',
  slug: 'my-agent',
  description: 'A test agent',
  start_node: 'node-1',
  current_version: AGENT_VERSION,
  version: AGENT_VERSION,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  staging_api_key_id: null,
  production_api_key_id: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  listAgents                                                         */
/* ------------------------------------------------------------------ */

describe('listAgents', () => {
  it('returns formatted agent list when query succeeds', async () => {
    const ctx = buildCtx();
    mockGetAgentsByOrg.mockResolvedValue({ result: [agentMetadata], error: null });

    const result = await listAgents(ctx);

    expect(result).toEqual([agentMetadata]);
    expect(mockGetAgentsByOrg).toHaveBeenCalledWith(ctx.supabase, 'org-1');
  });

  it('returns empty array when org has no agents', async () => {
    mockGetAgentsByOrg.mockResolvedValue({ result: [], error: null });

    const result = await listAgents(buildCtx());

    expect(result).toEqual([]);
  });

  it('throws when query returns an error', async () => {
    mockGetAgentsByOrg.mockResolvedValue({ result: [], error: 'DB error' });

    await expect(listAgents(buildCtx())).rejects.toThrow('DB error');
  });

  it('filters by search term when provided', async () => {
    const second: AgentMetadata = { ...agentMetadata, id: 'agent-2', name: 'Other', slug: 'other' };
    mockGetAgentsByOrg.mockResolvedValue({ result: [agentMetadata, second], error: null });

    const result = await listAgents(buildCtx(), 'my');

    expect(result).toEqual([agentMetadata]);
  });
});

/* ------------------------------------------------------------------ */
/*  createAgent                                                        */
/* ------------------------------------------------------------------ */

describe('createAgent', () => {
  it('generates slug, finds unique slug, inserts agent, returns created agent', async () => {
    const ctx = buildCtx();
    mockGenerateSlug.mockReturnValue('my-agent');
    mockFindUniqueSlug.mockResolvedValue('my-agent');
    mockInsertAgent.mockResolvedValue({ result: agentRow, error: null });

    const result = await createAgent(ctx, 'My Agent', 'A test agent');

    expect(mockGenerateSlug).toHaveBeenCalledWith('My Agent');
    expect(mockFindUniqueSlug).toHaveBeenCalledWith(ctx.supabase, 'my-agent', 'agents');
    expect(mockInsertAgent).toHaveBeenCalledWith(ctx.supabase, {
      orgId: 'org-1',
      name: 'My Agent',
      slug: 'my-agent',
      description: 'A test agent',
    });
    expect(result).toEqual(agentRow);
  });

  it('throws when insertAgent fails', async () => {
    mockGenerateSlug.mockReturnValue('my-agent');
    mockFindUniqueSlug.mockResolvedValue('my-agent');
    mockInsertAgent.mockResolvedValue({ result: null, error: 'Insert failed' });

    await expect(createAgent(buildCtx(), 'My Agent', 'A test agent')).rejects.toThrow('Insert failed');
  });
});

/* ------------------------------------------------------------------ */
/*  getAgent                                                           */
/* ------------------------------------------------------------------ */

describe('getAgent', () => {
  it('returns full agent row by slug', async () => {
    const ctx = buildCtx();
    mockGetAgentBySlug.mockResolvedValue({ result: agentRow, error: null });

    const result = await getAgent(ctx, 'my-agent');

    expect(result).toEqual(agentRow);
    expect(mockGetAgentBySlug).toHaveBeenCalledWith(ctx.supabase, 'my-agent');
  });

  it('throws when agent not found', async () => {
    mockGetAgentBySlug.mockResolvedValue({ result: null, error: null });

    await expect(getAgent(buildCtx(), 'missing-agent')).rejects.toThrow('Agent not found: missing-agent');
  });
});

/* ------------------------------------------------------------------ */
/*  updateAgent                                                        */
/* ------------------------------------------------------------------ */

describe('updateAgent', () => {
  it('updates name and description', async () => {
    const ctx = buildCtx();
    mockUpdateAgentQuery.mockResolvedValue({ error: null });

    await updateAgent(ctx, 'agent-1', { name: 'New Name', description: 'New desc' });

    expect(mockUpdateAgentQuery).toHaveBeenCalledWith(ctx.supabase, 'agent-1', {
      name: 'New Name',
      description: 'New desc',
    });
  });

  it('throws when update fails', async () => {
    mockUpdateAgentQuery.mockResolvedValue({ error: 'Update failed' });

    await expect(updateAgent(buildCtx(), 'agent-1', { name: 'New Name' })).rejects.toThrow('Update failed');
  });
});

/* ------------------------------------------------------------------ */
/*  deleteAgent                                                        */
/* ------------------------------------------------------------------ */

describe('deleteAgent', () => {
  it('gets agent by slug, deletes by id', async () => {
    const ctx = buildCtx();
    mockGetAgentBySlug.mockResolvedValue({ result: agentRow, error: null });
    mockDeleteAgentQuery.mockResolvedValue({ error: null });

    await deleteAgent(ctx, 'my-agent');

    expect(mockGetAgentBySlug).toHaveBeenCalledWith(ctx.supabase, 'my-agent');
    expect(mockDeleteAgentQuery).toHaveBeenCalledWith(ctx.supabase, 'agent-1');
  });

  it('throws when agent not found', async () => {
    mockGetAgentBySlug.mockResolvedValue({ result: null, error: null });

    await expect(deleteAgent(buildCtx(), 'missing-agent')).rejects.toThrow('Agent not found: missing-agent');
  });

  it('throws when delete fails', async () => {
    mockGetAgentBySlug.mockResolvedValue({ result: agentRow, error: null });
    mockDeleteAgentQuery.mockResolvedValue({ error: 'Delete failed' });

    await expect(deleteAgent(buildCtx(), 'my-agent')).rejects.toThrow('Delete failed');
  });
});
