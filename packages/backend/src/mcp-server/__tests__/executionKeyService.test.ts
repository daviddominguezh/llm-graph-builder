import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type {
  CreateExecutionKeyResult,
  ExecutionKeyAgent,
  ExecutionKeyRow,
} from '../../db/queries/executionKeyQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type GetExecutionKeysByOrgFn = (
  supabase: SupabaseClient,
  orgId: string
) => Promise<{ result: ExecutionKeyRow[]; error: string | null }>;

type GetAgentsForKeyFn = (
  supabase: SupabaseClient,
  keyId: string
) => Promise<{ result: ExecutionKeyAgent[]; error: string | null }>;

type CreateExecutionKeyQueryFn = (
  supabase: SupabaseClient,
  input: { orgId: string; name: string; allAgents: boolean; agentIds: string[]; expiresAt: string | null }
) => Promise<{ result: CreateExecutionKeyResult | null; error: string | null }>;

type UpdateExecutionKeyAgentsFn = (
  supabase: SupabaseClient,
  keyId: string,
  allAgents: boolean,
  agentIds: string[]
) => Promise<{ error: string | null }>;

type UpdateExecutionKeyNameFn = (
  supabase: SupabaseClient,
  keyId: string,
  name: string
) => Promise<{ error: string | null }>;

type DeleteExecutionKeyQueryFn = (
  supabase: SupabaseClient,
  keyId: string
) => Promise<{ error: string | null }>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockGetExecutionKeysByOrg = jest.fn<GetExecutionKeysByOrgFn>();
const mockGetAgentsForKey = jest.fn<GetAgentsForKeyFn>();
const mockCreateExecutionKeyQuery = jest.fn<CreateExecutionKeyQueryFn>();
const mockUpdateExecutionKeyAgents = jest.fn<UpdateExecutionKeyAgentsFn>();
const mockUpdateExecutionKeyName = jest.fn<UpdateExecutionKeyNameFn>();
const mockDeleteExecutionKeyQuery = jest.fn<DeleteExecutionKeyQueryFn>();

jest.unstable_mockModule('../../db/queries/executionKeyQueries.js', () => ({
  getExecutionKeysByOrg: mockGetExecutionKeysByOrg,
  getAgentsForKey: mockGetAgentsForKey,
}));

jest.unstable_mockModule('../../db/queries/executionKeyMutations.js', () => ({
  createExecutionKey: mockCreateExecutionKeyQuery,
  updateExecutionKeyAgents: mockUpdateExecutionKeyAgents,
  updateExecutionKeyName: mockUpdateExecutionKeyName,
  deleteExecutionKey: mockDeleteExecutionKeyQuery,
}));

const { listExecutionKeys, createExecutionKey, updateExecutionKey, deleteExecutionKey } =
  await import('../services/executionKeyService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const execKeyRow: ExecutionKeyRow = {
  id: 'execkey-1',
  org_id: 'org-1',
  name: 'Test Exec Key',
  key_prefix: 'clr_abc123...',
  all_agents: false,
  expires_at: null,
  created_at: '2024-01-01T00:00:00Z',
  last_used_at: null,
};

const execKeyAgent: ExecutionKeyAgent = {
  agent_id: 'agent-1',
  agent_name: 'My Agent',
  agent_slug: 'my-agent',
};

const createKeyResult: CreateExecutionKeyResult = {
  key: execKeyRow,
  fullKey: 'clr_abc123full',
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  listExecutionKeys                                                  */
/* ------------------------------------------------------------------ */

describe('listExecutionKeys', () => {
  it('returns keys with agents attached', async () => {
    const ctx = buildCtx();
    mockGetExecutionKeysByOrg.mockResolvedValue({ result: [execKeyRow], error: null });
    mockGetAgentsForKey.mockResolvedValue({ result: [execKeyAgent], error: null });

    const result = await listExecutionKeys(ctx);

    expect(result).toEqual([{ ...execKeyRow, agents: [execKeyAgent] }]);
    expect(mockGetExecutionKeysByOrg).toHaveBeenCalledWith(ctx.supabase, 'org-1');
    expect(mockGetAgentsForKey).toHaveBeenCalledWith(ctx.supabase, 'execkey-1');
  });

  it('returns empty array when no keys exist', async () => {
    mockGetExecutionKeysByOrg.mockResolvedValue({ result: [], error: null });

    const result = await listExecutionKeys(buildCtx());

    expect(result).toEqual([]);
  });

  it('throws when query returns an error', async () => {
    mockGetExecutionKeysByOrg.mockResolvedValue({ result: [], error: 'DB error' });

    await expect(listExecutionKeys(buildCtx())).rejects.toThrow('DB error');
  });
});

/* ------------------------------------------------------------------ */
/*  createExecutionKey                                                 */
/* ------------------------------------------------------------------ */

describe('createExecutionKey', () => {
  it('creates execution key with agents and expiry', async () => {
    const ctx = buildCtx();
    mockCreateExecutionKeyQuery.mockResolvedValue({ result: createKeyResult, error: null });

    const input = { name: 'Test Key', agentIds: ['agent-1'], expiresAt: '2025-01-01T00:00:00Z' };
    const result = await createExecutionKey(ctx, input);

    expect(mockCreateExecutionKeyQuery).toHaveBeenCalledWith(ctx.supabase, {
      orgId: 'org-1',
      name: 'Test Key',
      allAgents: false,
      agentIds: ['agent-1'],
      expiresAt: '2025-01-01T00:00:00Z',
    });
    expect(result).toEqual(createKeyResult);
  });

  it('creates execution key with null expiry when not provided', async () => {
    const ctx = buildCtx();
    mockCreateExecutionKeyQuery.mockResolvedValue({ result: createKeyResult, error: null });

    await createExecutionKey(ctx, { name: 'Test Key', agentIds: [] });

    expect(mockCreateExecutionKeyQuery).toHaveBeenCalledWith(ctx.supabase, {
      orgId: 'org-1',
      name: 'Test Key',
      allAgents: false,
      agentIds: [],
      expiresAt: null,
    });
  });

  it('throws when creation fails', async () => {
    mockCreateExecutionKeyQuery.mockResolvedValue({ result: null, error: 'Create failed' });

    await expect(createExecutionKey(buildCtx(), { name: 'Test Key', agentIds: [] })).rejects.toThrow(
      'Create failed'
    );
  });

  it('throws with default message when result is null and no error', async () => {
    mockCreateExecutionKeyQuery.mockResolvedValue({ result: null, error: null });

    await expect(createExecutionKey(buildCtx(), { name: 'Test Key', agentIds: [] })).rejects.toThrow(
      'Failed to create execution key'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  updateExecutionKey                                                 */
/* ------------------------------------------------------------------ */

describe('updateExecutionKey', () => {
  it('updates name when provided', async () => {
    const ctx = buildCtx();
    mockUpdateExecutionKeyName.mockResolvedValue({ error: null });

    await updateExecutionKey(ctx, 'execkey-1', { name: 'New Name' });

    expect(mockUpdateExecutionKeyName).toHaveBeenCalledWith(ctx.supabase, 'execkey-1', 'New Name');
    expect(mockUpdateExecutionKeyAgents).not.toHaveBeenCalled();
  });

  it('updates agents when provided', async () => {
    const ctx = buildCtx();
    mockUpdateExecutionKeyAgents.mockResolvedValue({ error: null });

    await updateExecutionKey(ctx, 'execkey-1', { agentIds: ['agent-2'] });

    expect(mockUpdateExecutionKeyAgents).toHaveBeenCalledWith(ctx.supabase, 'execkey-1', false, ['agent-2']);
    expect(mockUpdateExecutionKeyName).not.toHaveBeenCalled();
  });

  it('updates both name and agents when provided', async () => {
    const ctx = buildCtx();
    mockUpdateExecutionKeyName.mockResolvedValue({ error: null });
    mockUpdateExecutionKeyAgents.mockResolvedValue({ error: null });

    await updateExecutionKey(ctx, 'execkey-1', { name: 'New Name', agentIds: ['agent-2'] });

    expect(mockUpdateExecutionKeyName).toHaveBeenCalledWith(ctx.supabase, 'execkey-1', 'New Name');
    expect(mockUpdateExecutionKeyAgents).toHaveBeenCalledWith(ctx.supabase, 'execkey-1', false, ['agent-2']);
  });

  it('throws when name update fails', async () => {
    mockUpdateExecutionKeyName.mockResolvedValue({ error: 'Update failed' });

    await expect(updateExecutionKey(buildCtx(), 'execkey-1', { name: 'New Name' })).rejects.toThrow(
      'Update failed'
    );
  });

  it('throws when agents update fails', async () => {
    mockUpdateExecutionKeyAgents.mockResolvedValue({ error: 'Update failed' });

    await expect(updateExecutionKey(buildCtx(), 'execkey-1', { agentIds: ['agent-2'] })).rejects.toThrow(
      'Update failed'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  deleteExecutionKey                                                 */
/* ------------------------------------------------------------------ */

describe('deleteExecutionKey', () => {
  it('deletes execution key by id', async () => {
    const ctx = buildCtx();
    mockDeleteExecutionKeyQuery.mockResolvedValue({ error: null });

    await deleteExecutionKey(ctx, 'execkey-1');

    expect(mockDeleteExecutionKeyQuery).toHaveBeenCalledWith(ctx.supabase, 'execkey-1');
  });

  it('throws when delete fails', async () => {
    mockDeleteExecutionKeyQuery.mockResolvedValue({ error: 'Delete failed' });

    await expect(deleteExecutionKey(buildCtx(), 'execkey-1')).rejects.toThrow('Delete failed');
  });
});
