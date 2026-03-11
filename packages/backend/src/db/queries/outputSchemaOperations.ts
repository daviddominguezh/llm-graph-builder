import type { Operation } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type InsertOp = Extract<Operation, { type: 'insertOutputSchema' }>;
type UpdateOp = Extract<Operation, { type: 'updateOutputSchema' }>;

interface OutputSchemaInsertRow {
  agent_id: string;
  schema_id: string;
  name: string;
  fields: unknown;
}

function buildRow(agentId: string, data: InsertOp['data']): OutputSchemaInsertRow {
  return {
    agent_id: agentId,
    schema_id: data.schemaId,
    name: data.name,
    fields: data.fields,
  };
}

export async function insertOutputSchema(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertOp['data']
): Promise<void> {
  const row = buildRow(agentId, data);
  const result = await supabase
    .from('graph_output_schemas')
    .upsert(row, { onConflict: 'agent_id,schema_id' });
  throwOnMutationError(result, 'insertOutputSchema');
}

export async function updateOutputSchema(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateOp['data']
): Promise<void> {
  const row = buildRow(agentId, data);
  const result = await supabase
    .from('graph_output_schemas')
    .update(row)
    .eq('agent_id', agentId)
    .eq('schema_id', data.schemaId);
  throwOnMutationError(result, 'updateOutputSchema');
}

export async function deleteOutputSchema(
  supabase: SupabaseClient,
  agentId: string,
  schemaId: string
): Promise<void> {
  const result = await supabase
    .from('graph_output_schemas')
    .delete()
    .eq('agent_id', agentId)
    .eq('schema_id', schemaId);
  throwOnMutationError(result, 'deleteOutputSchema');
}
