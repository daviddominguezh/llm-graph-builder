import type { Operation, Precondition } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type InsertEdgeOp = Extract<Operation, { type: 'insertEdge' }>;
type UpdateEdgeOp = Extract<Operation, { type: 'updateEdge' }>;
type EdgeData = InsertEdgeOp['data'];

interface RpcToolRef {
  providerType: 'builtin' | 'mcp';
  providerId: string;
  toolName: string;
}

interface RpcPrecondition {
  type: string;
  value: string;
  description: string;
  toolFields?: Record<string, unknown>;
  /** Structured tool ref for tool_call preconditions; absent on user_said / agent_decision. */
  tool?: RpcToolRef;
}

interface RpcContextPreconditions {
  preconditions: string[];
  jumpTo: string | undefined;
}

function encodePreconditionValue(p: Precondition): string {
  // For tool_call, also JSON-encode into value as a transitional bridge — the
  // upsert RPC reads structured fields from `tool` (preferred) but legacy
  // restore/rollback flows still read `value`. Once those are migrated, this
  // can return `''` for tool_call.
  if (p.type === 'tool_call') return JSON.stringify(p.tool);
  return p.value;
}

function getToolFields(p: Precondition): Record<string, unknown> | undefined {
  return p.type === 'tool_call' ? p.toolFields : undefined;
}

function getToolRef(p: Precondition): RpcToolRef | undefined {
  return p.type === 'tool_call' ? p.tool : undefined;
}

function buildRpcPreconditions(data: EdgeData): RpcPrecondition[] {
  if (data.preconditions === undefined) return [];

  return data.preconditions.map((p) => ({
    type: p.type,
    value: encodePreconditionValue(p),
    description: p.description ?? '',
    toolFields: getToolFields(p),
    tool: getToolRef(p),
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
