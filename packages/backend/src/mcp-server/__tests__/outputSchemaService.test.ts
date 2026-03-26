import type { Graph, OutputSchemaEntity, OutputSchemaField } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;

type ExecuteOperationsBatchFn = (
  supabase: SupabaseClient,
  agentId: string,
  operations: unknown[]
) => Promise<void>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockExecuteOperationsBatch = jest.fn<ExecuteOperationsBatchFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('../../db/queries/operationExecutor.js', () => ({
  executeOperationsBatch: mockExecuteOperationsBatch,
}));

const { listOutputSchemas, getOutputSchema, addOutputSchema, updateOutputSchema, deleteOutputSchema } =
  await import('../services/outputSchemaService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const fieldOne: OutputSchemaField = { name: 'title', type: 'string', required: true };
const fieldTwo: OutputSchemaField = { name: 'count', type: 'number', required: false };

const schema1: OutputSchemaEntity = {
  id: 'schema-1',
  name: 'Product Schema',
  fields: [fieldOne],
};

const schema2: OutputSchemaEntity = {
  id: 'schema-2',
  name: 'Order Schema',
  fields: [fieldTwo],
};

const testGraph: Graph = {
  startNode: 'Start',
  agents: [{ id: 'main', description: 'Main' }],
  nodes: [
    {
      id: 'Start',
      text: 'Hello',
      kind: 'agent',
      agent: 'main',
      global: false,
      description: '',
      outputSchemaId: 'schema-1',
    },
  ],
  edges: [],
  outputSchemas: [schema1, schema2],
};

const graphNoSchemas: Graph = { ...testGraph, outputSchemas: [] };

const SCHEMA_COUNT = 2;
const FIRST = 0;
const SECOND = 1;

beforeEach(() => {
  jest.clearAllMocks();
  mockExecuteOperationsBatch.mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------ */
/*  listOutputSchemas                                                  */
/* ------------------------------------------------------------------ */

describe('listOutputSchemas', () => {
  it('returns schemas enriched with usedByNodes', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);

    const result = await listOutputSchemas(ctx, 'agent-1');

    expect(result).toHaveLength(SCHEMA_COUNT);
    expect(result[FIRST]).toEqual({ ...schema1, usedByNodes: ['Start'] });
    expect(result[SECOND]).toEqual({ ...schema2, usedByNodes: [] });
  });

  it('returns empty array when no schemas configured', async () => {
    mockAssembleGraph.mockResolvedValue(graphNoSchemas);

    const result = await listOutputSchemas(buildCtx(), 'agent-1');

    expect(result).toEqual([]);
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(listOutputSchemas(buildCtx(), 'agent-1')).rejects.toThrow('Graph not found');
  });
});

/* ------------------------------------------------------------------ */
/*  getOutputSchema                                                    */
/* ------------------------------------------------------------------ */

describe('getOutputSchema', () => {
  it('returns the matching schema', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);

    const result = await getOutputSchema(buildCtx(), 'agent-1', 'schema-1');

    expect(result).toEqual(schema1);
  });

  it('throws when schema not found', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);

    await expect(getOutputSchema(buildCtx(), 'agent-1', 'missing-id')).rejects.toThrow(
      'Output schema not found: missing-id'
    );
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(getOutputSchema(buildCtx(), 'agent-1', 'schema-1')).rejects.toThrow('Graph not found');
  });
});

/* ------------------------------------------------------------------ */
/*  addOutputSchema                                                    */
/* ------------------------------------------------------------------ */

describe('addOutputSchema', () => {
  it('calls executeOperationsBatch with insertOutputSchema and returns schemaId', async () => {
    const ctx = buildCtx();

    const result = await addOutputSchema(ctx, 'agent-1', 'New Schema', [fieldOne]);

    expect(result.schemaId).toBeDefined();
    expect(typeof result.schemaId).toBe('string');
    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(
      ctx.supabase,
      'agent-1',
      expect.arrayContaining([
        expect.objectContaining({
          type: 'insertOutputSchema',
          data: expect.objectContaining({ name: 'New Schema', fields: [fieldOne] }),
        }),
      ])
    );
  });
});

/* ------------------------------------------------------------------ */
/*  updateOutputSchema                                                 */
/* ------------------------------------------------------------------ */

describe('updateOutputSchema', () => {
  it('merges name and calls executeOperationsBatch with updateOutputSchema', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);

    await updateOutputSchema(ctx, 'agent-1', 'schema-1', { name: 'Renamed Schema' });

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      {
        type: 'updateOutputSchema',
        data: {
          schemaId: 'schema-1',
          name: 'Renamed Schema',
          fields: schema1.fields,
        },
      },
    ]);
  });

  it('merges fields and preserves existing name', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);

    await updateOutputSchema(ctx, 'agent-1', 'schema-1', { fields: [fieldTwo] });

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      {
        type: 'updateOutputSchema',
        data: {
          schemaId: 'schema-1',
          name: schema1.name,
          fields: [fieldTwo],
        },
      },
    ]);
  });

  it('throws when schema not found', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);

    await expect(updateOutputSchema(buildCtx(), 'agent-1', 'missing', { name: 'X' })).rejects.toThrow(
      'Output schema not found: missing'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  deleteOutputSchema                                                 */
/* ------------------------------------------------------------------ */

describe('deleteOutputSchema', () => {
  it('calls executeOperationsBatch with deleteOutputSchema', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);

    const result = await deleteOutputSchema(ctx, 'agent-1', 'schema-2');

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'deleteOutputSchema', schemaId: 'schema-2' },
    ]);
    expect(result.warning).toBeUndefined();
  });

  it('includes warning when schema is used by nodes', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);

    const result = await deleteOutputSchema(ctx, 'agent-1', 'schema-1');

    expect(result.warning).toContain('Start');
    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'deleteOutputSchema', schemaId: 'schema-1' },
    ]);
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(deleteOutputSchema(buildCtx(), 'agent-1', 'schema-1')).rejects.toThrow('Graph not found');
  });
});
