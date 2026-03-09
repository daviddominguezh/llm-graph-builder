import type { Operation } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type InsertEdgeOp = Extract<Operation, { type: 'insertEdge' }>;
type UpdateEdgeOp = Extract<Operation, { type: 'updateEdge' }>;
type EdgeData = InsertEdgeOp['data'];

interface EdgeInsertRow {
  agent_id: string;
  from_node: string;
  to_node: string;
}

interface PreconditionInsertRow {
  edge_id: string;
  type: string;
  value: string;
  description: string | undefined;
}

interface ContextPreconditionInsertRow {
  edge_id: string;
  preconditions: string[];
  jump_to: string | undefined;
}

interface InsertedEdge {
  id: string;
}

const EMPTY_LENGTH = 0;

async function insertEdgeRow(supabase: SupabaseClient, agentId: string, data: EdgeData): Promise<string> {
  const row: EdgeInsertRow = { agent_id: agentId, from_node: data.from, to_node: data.to };
  const result = await supabase.from('graph_edges').insert(row).select('id').single();

  if (result.error !== null) {
    throw new Error(`insertEdgeRow: ${result.error.message}`);
  }

  const inserted: InsertedEdge = result.data;
  return inserted.id;
}

function buildPreconditionRows(edgeId: string, data: EdgeData): PreconditionInsertRow[] {
  if (data.preconditions === undefined) return [];

  return data.preconditions.map((p) => ({
    edge_id: edgeId,
    type: p.type,
    value: p.value,
    description: p.description,
  }));
}

function buildContextPreconditionRow(edgeId: string, data: EdgeData): ContextPreconditionInsertRow | null {
  if (data.contextPreconditions === undefined) return null;

  return {
    edge_id: edgeId,
    preconditions: data.contextPreconditions.preconditions,
    jump_to: data.contextPreconditions.jumpTo,
  };
}

async function insertPreconditions(supabase: SupabaseClient, edgeId: string, data: EdgeData): Promise<void> {
  const rows = buildPreconditionRows(edgeId, data);

  if (rows.length > EMPTY_LENGTH) {
    const result = await supabase.from('graph_edge_preconditions').insert(rows);
    throwOnMutationError(result, 'insertPreconditions');
  }

  const ctxRow = buildContextPreconditionRow(edgeId, data);

  if (ctxRow !== null) {
    const result = await supabase.from('graph_edge_context_preconditions').insert(ctxRow);
    throwOnMutationError(result, 'insertContextPreconditions');
  }
}

export async function insertEdge(supabase: SupabaseClient, agentId: string, data: EdgeData): Promise<void> {
  const edgeId = await insertEdgeRow(supabase, agentId, data);
  await insertPreconditions(supabase, edgeId, data);
}

async function findEdgeId(
  supabase: SupabaseClient,
  agentId: string,
  from: string,
  to: string
): Promise<string> {
  const result = await supabase
    .from('graph_edges')
    .select('id')
    .eq('agent_id', agentId)
    .eq('from_node', from)
    .eq('to_node', to)
    .single();

  if (result.error !== null) {
    throw new Error(`findEdgeId: ${result.error.message}`);
  }

  const row: InsertedEdge = result.data;
  return row.id;
}

async function deletePreconditionsForEdge(supabase: SupabaseClient, edgeId: string): Promise<void> {
  const r1 = await supabase.from('graph_edge_preconditions').delete().eq('edge_id', edgeId);
  throwOnMutationError(r1, 'deletePreconditionsForEdge');

  const r2 = await supabase.from('graph_edge_context_preconditions').delete().eq('edge_id', edgeId);
  throwOnMutationError(r2, 'deleteContextPreconditionsForEdge');
}

export async function updateEdge(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateEdgeOp['data']
): Promise<void> {
  const edgeId = await findEdgeId(supabase, agentId, data.from, data.to);
  await deletePreconditionsForEdge(supabase, edgeId);
  await insertPreconditions(supabase, edgeId, data);
}

export async function deleteEdge(
  supabase: SupabaseClient,
  agentId: string,
  from: string,
  to: string
): Promise<void> {
  const result = await supabase
    .from('graph_edges')
    .delete()
    .eq('agent_id', agentId)
    .eq('from_node', from)
    .eq('to_node', to);
  throwOnMutationError(result, 'deleteEdge');
}
