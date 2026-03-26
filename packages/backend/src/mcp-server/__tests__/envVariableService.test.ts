import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { OrgEnvVariableRow } from '../../db/queries/envVariableQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type GetEnvVariablesByOrgFn = (
  supabase: SupabaseClient,
  orgId: string
) => Promise<{ result: OrgEnvVariableRow[]; error: string | null }>;

type CreateEnvVariableQueryFn = (
  supabase: SupabaseClient,
  input: { orgId: string; name: string; value: string; isSecret: boolean; userId: string }
) => Promise<{ result: OrgEnvVariableRow | null; error: string | null }>;

type UpdateEnvVariableQueryFn = (
  supabase: SupabaseClient,
  variableId: string,
  updates: { name?: string; value?: string; isSecret?: boolean }
) => Promise<{ error: string | null }>;

type DeleteEnvVariableQueryFn = (
  supabase: SupabaseClient,
  variableId: string
) => Promise<{ error: string | null }>;

type GetEnvVariableValueQueryFn = (
  supabase: SupabaseClient,
  variableId: string
) => Promise<{ value: string | null; error: string | null }>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockGetEnvVariablesByOrg = jest.fn<GetEnvVariablesByOrgFn>();
const mockCreateEnvVariableQuery = jest.fn<CreateEnvVariableQueryFn>();
const mockUpdateEnvVariableQuery = jest.fn<UpdateEnvVariableQueryFn>();
const mockDeleteEnvVariableQuery = jest.fn<DeleteEnvVariableQueryFn>();
const mockGetEnvVariableValueQuery = jest.fn<GetEnvVariableValueQueryFn>();

jest.unstable_mockModule('../../db/queries/envVariableQueries.js', () => ({
  getEnvVariablesByOrg: mockGetEnvVariablesByOrg,
  createEnvVariable: mockCreateEnvVariableQuery,
  updateEnvVariable: mockUpdateEnvVariableQuery,
  deleteEnvVariable: mockDeleteEnvVariableQuery,
  getEnvVariableValue: mockGetEnvVariableValueQuery,
}));

const { listEnvVariables, createEnvVariable, updateEnvVariable, deleteEnvVariable, getEnvVariableValue } =
  await import('../services/envVariableService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const envVarRow: OrgEnvVariableRow = {
  id: 'var-1',
  org_id: 'org-1',
  name: 'MY_VAR',
  is_secret: false,
  created_at: '2024-01-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  listEnvVariables                                                   */
/* ------------------------------------------------------------------ */

describe('listEnvVariables', () => {
  it('returns env variables when query succeeds', async () => {
    const ctx = buildCtx();
    mockGetEnvVariablesByOrg.mockResolvedValue({ result: [envVarRow], error: null });

    const result = await listEnvVariables(ctx);

    expect(result).toEqual([envVarRow]);
    expect(mockGetEnvVariablesByOrg).toHaveBeenCalledWith(ctx.supabase, 'org-1');
  });

  it('returns empty array when org has no variables', async () => {
    mockGetEnvVariablesByOrg.mockResolvedValue({ result: [], error: null });

    const result = await listEnvVariables(buildCtx());

    expect(result).toEqual([]);
  });

  it('throws when query returns an error', async () => {
    mockGetEnvVariablesByOrg.mockResolvedValue({ result: [], error: 'DB error' });

    await expect(listEnvVariables(buildCtx())).rejects.toThrow('DB error');
  });
});

/* ------------------------------------------------------------------ */
/*  createEnvVariable                                                  */
/* ------------------------------------------------------------------ */

describe('createEnvVariable', () => {
  it('creates variable with isSecret defaulting to false', async () => {
    const ctx = buildCtx();
    mockCreateEnvVariableQuery.mockResolvedValue({ result: envVarRow, error: null });

    const result = await createEnvVariable(ctx, 'MY_VAR', 'value123');

    expect(mockCreateEnvVariableQuery).toHaveBeenCalledWith(ctx.supabase, {
      orgId: 'org-1',
      name: 'MY_VAR',
      value: 'value123',
      isSecret: false,
      userId: '',
    });
    expect(result).toEqual(envVarRow);
  });

  it('creates variable with isSecret true when provided', async () => {
    const ctx = buildCtx();
    const secretRow: OrgEnvVariableRow = { ...envVarRow, is_secret: true };
    mockCreateEnvVariableQuery.mockResolvedValue({ result: secretRow, error: null });

    const result = await createEnvVariable(ctx, 'MY_VAR', 'value123', true);

    expect(mockCreateEnvVariableQuery).toHaveBeenCalledWith(ctx.supabase, {
      orgId: 'org-1',
      name: 'MY_VAR',
      value: 'value123',
      isSecret: true,
      userId: '',
    });
    expect(result).toEqual(secretRow);
  });

  it('throws when creation fails', async () => {
    mockCreateEnvVariableQuery.mockResolvedValue({ result: null, error: 'Create failed' });

    await expect(createEnvVariable(buildCtx(), 'MY_VAR', 'value123')).rejects.toThrow('Create failed');
  });

  it('throws with default message when result is null and no error', async () => {
    mockCreateEnvVariableQuery.mockResolvedValue({ result: null, error: null });

    await expect(createEnvVariable(buildCtx(), 'MY_VAR', 'value123')).rejects.toThrow(
      'Failed to create env variable'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  updateEnvVariable                                                  */
/* ------------------------------------------------------------------ */

describe('updateEnvVariable', () => {
  it('updates variable fields', async () => {
    const ctx = buildCtx();
    mockUpdateEnvVariableQuery.mockResolvedValue({ error: null });

    await updateEnvVariable(ctx, 'var-1', { name: 'NEW_VAR', value: 'new_value' });

    expect(mockUpdateEnvVariableQuery).toHaveBeenCalledWith(ctx.supabase, 'var-1', {
      name: 'NEW_VAR',
      value: 'new_value',
    });
  });

  it('throws when update fails', async () => {
    mockUpdateEnvVariableQuery.mockResolvedValue({ error: 'Update failed' });

    await expect(updateEnvVariable(buildCtx(), 'var-1', { name: 'NEW_VAR' })).rejects.toThrow(
      'Update failed'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  deleteEnvVariable                                                  */
/* ------------------------------------------------------------------ */

describe('deleteEnvVariable', () => {
  it('deletes variable by id', async () => {
    const ctx = buildCtx();
    mockDeleteEnvVariableQuery.mockResolvedValue({ error: null });

    await deleteEnvVariable(ctx, 'var-1');

    expect(mockDeleteEnvVariableQuery).toHaveBeenCalledWith(ctx.supabase, 'var-1');
  });

  it('throws when delete fails', async () => {
    mockDeleteEnvVariableQuery.mockResolvedValue({ error: 'Delete failed' });

    await expect(deleteEnvVariable(buildCtx(), 'var-1')).rejects.toThrow('Delete failed');
  });
});

/* ------------------------------------------------------------------ */
/*  getEnvVariableValue                                                */
/* ------------------------------------------------------------------ */

describe('getEnvVariableValue', () => {
  it('returns value when query succeeds', async () => {
    const ctx = buildCtx();
    mockGetEnvVariableValueQuery.mockResolvedValue({ value: 'secret_value', error: null });

    const result = await getEnvVariableValue(ctx, 'var-1');

    expect(result).toEqual({ value: 'secret_value' });
    expect(mockGetEnvVariableValueQuery).toHaveBeenCalledWith(ctx.supabase, 'var-1');
  });

  it('returns null value when variable has no value', async () => {
    mockGetEnvVariableValueQuery.mockResolvedValue({ value: null, error: null });

    const result = await getEnvVariableValue(buildCtx(), 'var-1');

    expect(result).toEqual({ value: null });
  });

  it('throws when query fails', async () => {
    mockGetEnvVariableValueQuery.mockResolvedValue({ value: null, error: 'Access denied' });

    await expect(getEnvVariableValue(buildCtx(), 'var-1')).rejects.toThrow('Access denied');
  });
});
