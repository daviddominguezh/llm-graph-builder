import type { Operation } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type InsertEdgeOp = Extract<Operation, { type: 'insertEdge' }>;
type UpdateEdgeOp = Extract<Operation, { type: 'updateEdge' }>;
type EdgeData = InsertEdgeOp['data'];

interface RpcPrecondition {
  type: string;
  value: string;
  description: string;
  toolFields?: Record<string, unknown>;
}

interface RpcContextPreconditions {
  preconditions: string[];
  jumpTo: string | undefined;
}

function buildRpcPreconditions(data: EdgeData): RpcPrecondition[] {
  if (data.preconditions === undefined) return [];

  return data.preconditions.map((p) => ({
    type: p.type,
    value: p.value,
    description: p.description ?? '',
    toolFields: p.toolFields,
  }));
}

function buildRpcContextPreconditions(data: EdgeData): RpcContextPreconditions | null {
  if (data.contextPreconditions === undefined) return null;

  return {
    preconditions: data.contextPreconditions.preconditions,
    jumpTo: data.contextPreconditions.jumpTo,
  };
}

async function upsertEdgeAtomic(supabase: SupabaseClient, agentId: string, data: EdgeData): Promise<void> {
  const result = await supabase.rpc('upsert_edge_tx', {
    p_agent_id: agentId,
    p_from_node: data.from,
    p_to_node: data.to,
    p_preconditions: buildRpcPreconditions(data),
    p_context_preconditions: buildRpcContextPreconditions(data),
  });

  if (result.error !== null) {
    throw new Error(`upsertEdgeAtomic: ${result.error.message}`);
  }
}

export async function insertEdge(supabase: SupabaseClient, agentId: string, data: EdgeData): Promise<void> {
  await upsertEdgeAtomic(supabase, agentId, data);
}

export async function updateEdge(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateEdgeOp['data']
): Promise<void> {
  await upsertEdgeAtomic(supabase, agentId, data);
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
