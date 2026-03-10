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
  };
}

export async function insertNode(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertNodeOp['data']
): Promise<void> {
  const row = buildNodeRow(agentId, data);
  const result = await supabase.from('graph_nodes').insert(row);
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
  const safeId = nodeId.replace(/[^a-zA-Z0-9_\x2d]/gv, '');
  const result = await supabase
    .from('graph_edges')
    .delete()
    .eq('agent_id', agentId)
    .or(`from_node.eq.${safeId},to_node.eq.${safeId}`);
  throwOnMutationError(result, 'deleteRelatedEdges');
}

export async function deleteNode(supabase: SupabaseClient, agentId: string, nodeId: string): Promise<void> {
  await deleteRelatedEdges(supabase, agentId, nodeId);
  const result = await supabase.from('graph_nodes').delete().eq('agent_id', agentId).eq('node_id', nodeId);
  throwOnMutationError(result, 'deleteNode');
}
