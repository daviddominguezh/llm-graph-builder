import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { ApiKeyRow } from '../../db/queries/apiKeyQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type GetApiKeysByOrgFn = (
  supabase: SupabaseClient,
  orgId: string
) => Promise<{ result: ApiKeyRow[]; error: string | null }>;

type CreateApiKeyQueryFn = (
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  keyValue: string
) => Promise<{ result: ApiKeyRow | null; error: string | null }>;

type DeleteApiKeyQueryFn = (supabase: SupabaseClient, keyId: string) => Promise<{ error: string | null }>;

type UpdateStagingKeyIdFn = (
  supabase: SupabaseClient,
  agentId: string,
  keyId: string | null
) => Promise<{ error: string | null }>;

type UpdateProductionKeyIdFn = (
  supabase: SupabaseClient,
  agentId: string,
  keyId: string | null
) => Promise<{ error: string | null }>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockGetApiKeysByOrg = jest.fn<GetApiKeysByOrgFn>();
const mockCreateApiKeyQuery = jest.fn<CreateApiKeyQueryFn>();
const mockDeleteApiKeyQuery = jest.fn<DeleteApiKeyQueryFn>();
const mockUpdateStagingKeyId = jest.fn<UpdateStagingKeyIdFn>();
const mockUpdateProductionKeyId = jest.fn<UpdateProductionKeyIdFn>();

jest.unstable_mockModule('../../db/queries/apiKeyQueries.js', () => ({
  getApiKeysByOrg: mockGetApiKeysByOrg,
  createApiKey: mockCreateApiKeyQuery,
  deleteApiKey: mockDeleteApiKeyQuery,
}));

jest.unstable_mockModule('../../db/queries/agentQueries.js', () => ({
  updateStagingKeyId: mockUpdateStagingKeyId,
  updateProductionKeyId: mockUpdateProductionKeyId,
}));

const { listApiKeys, createApiKey, deleteApiKey, setStagingKey, setProductionKey } =
  await import('../services/apiKeyService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const apiKeyRow: ApiKeyRow = {
  id: 'apikey-1',
  org_id: 'org-1',
  name: 'Test Key',
  key_preview: 'sk-test...',
  created_at: '2024-01-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  listApiKeys                                                        */
/* ------------------------------------------------------------------ */

describe('listApiKeys', () => {
  it('returns API keys when query succeeds', async () => {
    const ctx = buildCtx();
    mockGetApiKeysByOrg.mockResolvedValue({ result: [apiKeyRow], error: null });

    const result = await listApiKeys(ctx);

    expect(result).toEqual([apiKeyRow]);
    expect(mockGetApiKeysByOrg).toHaveBeenCalledWith(ctx.supabase, 'org-1');
  });

  it('returns empty array when org has no keys', async () => {
    mockGetApiKeysByOrg.mockResolvedValue({ result: [], error: null });

    const result = await listApiKeys(buildCtx());

    expect(result).toEqual([]);
  });

  it('throws when query returns an error', async () => {
    mockGetApiKeysByOrg.mockResolvedValue({ result: [], error: 'DB error' });

    await expect(listApiKeys(buildCtx())).rejects.toThrow('DB error');
  });
});

/* ------------------------------------------------------------------ */
/*  createApiKey                                                       */
/* ------------------------------------------------------------------ */

describe('createApiKey', () => {
  it('creates API key and returns the row', async () => {
    const ctx = buildCtx();
    mockCreateApiKeyQuery.mockResolvedValue({ result: apiKeyRow, error: null });

    const result = await createApiKey(ctx, 'Test Key', 'sk-testvalue123');

    expect(mockCreateApiKeyQuery).toHaveBeenCalledWith(ctx.supabase, 'org-1', 'Test Key', 'sk-testvalue123');
    expect(result).toEqual(apiKeyRow);
  });

  it('throws when creation fails', async () => {
    mockCreateApiKeyQuery.mockResolvedValue({ result: null, error: 'Create failed' });

    await expect(createApiKey(buildCtx(), 'Test Key', 'sk-test')).rejects.toThrow('Create failed');
  });

  it('throws with default message when result is null and no error', async () => {
    mockCreateApiKeyQuery.mockResolvedValue({ result: null, error: null });

    await expect(createApiKey(buildCtx(), 'Test Key', 'sk-test')).rejects.toThrow('Failed to create API key');
  });
});

/* ------------------------------------------------------------------ */
/*  deleteApiKey                                                       */
/* ------------------------------------------------------------------ */

describe('deleteApiKey', () => {
  it('deletes API key by id', async () => {
    const ctx = buildCtx();
    mockDeleteApiKeyQuery.mockResolvedValue({ error: null });

    await deleteApiKey(ctx, 'apikey-1');

    expect(mockDeleteApiKeyQuery).toHaveBeenCalledWith(ctx.supabase, 'apikey-1');
  });

  it('throws when delete fails', async () => {
    mockDeleteApiKeyQuery.mockResolvedValue({ error: 'Delete failed' });

    await expect(deleteApiKey(buildCtx(), 'apikey-1')).rejects.toThrow('Delete failed');
  });
});

/* ------------------------------------------------------------------ */
/*  setStagingKey                                                      */
/* ------------------------------------------------------------------ */

describe('setStagingKey', () => {
  it('sets staging key for agent', async () => {
    const ctx = buildCtx();
    mockUpdateStagingKeyId.mockResolvedValue({ error: null });

    await setStagingKey(ctx, 'agent-1', 'apikey-1');

    expect(mockUpdateStagingKeyId).toHaveBeenCalledWith(ctx.supabase, 'agent-1', 'apikey-1');
  });

  it('clears staging key when null provided', async () => {
    const ctx = buildCtx();
    mockUpdateStagingKeyId.mockResolvedValue({ error: null });

    await setStagingKey(ctx, 'agent-1', null);

    expect(mockUpdateStagingKeyId).toHaveBeenCalledWith(ctx.supabase, 'agent-1', null);
  });

  it('throws when update fails', async () => {
    mockUpdateStagingKeyId.mockResolvedValue({ error: 'Update failed' });

    await expect(setStagingKey(buildCtx(), 'agent-1', 'apikey-1')).rejects.toThrow('Update failed');
  });
});

/* ------------------------------------------------------------------ */
/*  setProductionKey                                                   */
/* ------------------------------------------------------------------ */

describe('setProductionKey', () => {
  it('sets production key for agent', async () => {
    const ctx = buildCtx();
    mockUpdateProductionKeyId.mockResolvedValue({ error: null });

    await setProductionKey(ctx, 'agent-1', 'apikey-1');

    expect(mockUpdateProductionKeyId).toHaveBeenCalledWith(ctx.supabase, 'agent-1', 'apikey-1');
  });

  it('clears production key when null provided', async () => {
    const ctx = buildCtx();
    mockUpdateProductionKeyId.mockResolvedValue({ error: null });

    await setProductionKey(ctx, 'agent-1', null);

    expect(mockUpdateProductionKeyId).toHaveBeenCalledWith(ctx.supabase, 'agent-1', null);
  });

  it('throws when update fails', async () => {
    mockUpdateProductionKeyId.mockResolvedValue({ error: 'Update failed' });

    await expect(setProductionKey(buildCtx(), 'agent-1', 'apikey-1')).rejects.toThrow('Update failed');
  });
});
