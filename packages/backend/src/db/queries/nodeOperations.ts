import type { Operation } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type InsertNodeOp = Extract<Operation, { type: 'insertNode' }>;
type UpdateNodeOp = Extract<Operation, { type: 'updateNode' }>;

interface NodeRow {
  agent_id: string;
  node_id: string;
  text: string;
  kind: string;
  description: string | undefined;
  agent: string | undefined;
  next_node_is_user: boolean | undefined;
  fallback_node_id: string | undefined;
  global: boolean | undefined;
  default_fallback: boolean | undefined;
  position_x: number | undefined;
  position_y: number | undefined;
  output_schema_id: string | undefined;
}

function buildNodeRow(agentId: string, data: InsertNodeOp['data']): NodeRow {
  return {
    agent_id: agentId,
    node_id: data.nodeId,
    text: data.text,
    kind: data.kind,
    description: data.description,
    agent: data.agent,
    next_node_is_user: data.nextNodeIsUser,
    fallback_node_id: data.fallbackNodeId,
    global: data.global,
    default_fallback: data.defaultFallback,
    position_x: data.position?.x,
    position_y: data.position?.y,
    output_schema_id: data.outputSchemaId,
  };
}

export async function insertNode(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertNodeOp['data']
): Promise<void> {
  const row = buildNodeRow(agentId, data);
  const result = await supabase.from('graph_nodes').upsert(row, { onConflict: 'agent_id,node_id' });
  throwOnMutationError(result, 'insertNode');
}

export async function updateNode(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateNodeOp['data']
): Promise<void> {
  const row = buildNodeRow(agentId, data);
  const result = await supabase
    .from('graph_nodes')
    .update(row)
    .eq('agent_id', agentId)
    .eq('node_id', data.nodeId);
  throwOnMutationError(result, 'updateNode');
}

async function deleteRelatedEdges(supabase: SupabaseClient, agentId: string, nodeId: string): Promise<void> {
  const r1 = await supabase.from('graph_edges').delete().eq('agent_id', agentId).eq('from_node', nodeId);
  throwOnMutationError(r1, 'deleteRelatedEdges:from');

  const r2 = await supabase.from('graph_edges').delete().eq('agent_id', agentId).eq('to_node', nodeId);
  throwOnMutationError(r2, 'deleteRelatedEdges:to');
}

export async function deleteNode(supabase: SupabaseClient, agentId: string, nodeId: string): Promise<void> {
  await deleteRelatedEdges(supabase, agentId, nodeId);
  const result = await supabase.from('graph_nodes').delete().eq('agent_id', agentId).eq('node_id', nodeId);
  throwOnMutationError(result, 'deleteNode');
}
