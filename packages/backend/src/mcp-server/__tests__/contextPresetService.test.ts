import type { ContextPreset } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type ExecuteOperationsBatchFn = (
  supabase: SupabaseClient,
  agentId: string,
  operations: unknown[]
) => Promise<void>;

type FetchContextPresetsFn = (supabase: SupabaseClient, agentId: string) => Promise<ContextPreset[]>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockExecuteOperationsBatch = jest.fn<ExecuteOperationsBatchFn>();
const mockFetchContextPresets = jest.fn<FetchContextPresetsFn>();

jest.unstable_mockModule('../../db/queries/operationExecutor.js', () => ({
  executeOperationsBatch: mockExecuteOperationsBatch,
}));

jest.unstable_mockModule('../../db/queries/contextPresetQueries.js', () => ({
  fetchContextPresets: mockFetchContextPresets,
}));

const { listContextPresets, addContextPreset, updateContextPreset, deleteContextPreset } =
  await import('../services/contextPresetService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const preset1: ContextPreset = {
  name: 'default',
  sessionId: 'session-1',
  data: { key: 'value' },
};

const preset2: ContextPreset = {
  name: 'alternative',
  tenantId: 'tenant-1',
};

const PRESET_COUNT = 2;

beforeEach(() => {
  jest.clearAllMocks();
  mockExecuteOperationsBatch.mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------ */
/*  listContextPresets                                                 */
/* ------------------------------------------------------------------ */

describe('listContextPresets', () => {
  it('returns all presets fetched from the database', async () => {
    const ctx = buildCtx();
    mockFetchContextPresets.mockResolvedValue([preset1, preset2]);

    const result = await listContextPresets(ctx, 'agent-1');

    expect(result).toEqual([preset1, preset2]);
    expect(result).toHaveLength(PRESET_COUNT);
    expect(mockFetchContextPresets).toHaveBeenCalledWith(ctx.supabase, 'agent-1');
  });

  it('returns empty array when no presets exist', async () => {
    mockFetchContextPresets.mockResolvedValue([]);

    const result = await listContextPresets(buildCtx(), 'agent-1');

    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  addContextPreset                                                   */
/* ------------------------------------------------------------------ */

describe('addContextPreset', () => {
  it('calls executeOperationsBatch with insertContextPreset', async () => {
    const ctx = buildCtx();
    const presetData = { name: 'new-preset', sessionId: 'session-1' };

    await addContextPreset(ctx, 'agent-1', presetData);

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'insertContextPreset', data: presetData },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  updateContextPreset                                                */
/* ------------------------------------------------------------------ */

describe('updateContextPreset', () => {
  it('calls executeOperationsBatch with updateContextPreset', async () => {
    const ctx = buildCtx();
    const fields = { name: 'default', tenantId: 'tenant-2' };

    await updateContextPreset(ctx, 'agent-1', fields);

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'updateContextPreset', data: fields },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  deleteContextPreset                                                */
/* ------------------------------------------------------------------ */

describe('deleteContextPreset', () => {
  it('calls executeOperationsBatch with deleteContextPreset', async () => {
    const ctx = buildCtx();

    await deleteContextPreset(ctx, 'agent-1', 'default');

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'deleteContextPreset', name: 'default' },
    ]);
  });
});
