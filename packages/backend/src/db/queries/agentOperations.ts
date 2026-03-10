import type { Operation } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type InsertAgentOp = Extract<Operation, { type: 'insertAgent' }>;
type UpdateAgentOp = Extract<Operation, { type: 'updateAgent' }>;

interface AgentInsertRow {
  agent_id: string;
  agent_key: string;
  description: string | undefined;
}

function buildAgentRow(agentId: string, data: InsertAgentOp['data']): AgentInsertRow {
  return {
    agent_id: agentId,
    agent_key: data.agentKey,
    description: data.description,
  };
}

export async function insertAgent(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertAgentOp['data']
): Promise<void> {
  const row = buildAgentRow(agentId, data);
  const result = await supabase.from('graph_agents').upsert(row, { onConflict: 'agent_id,agent_key' });
  throwOnMutationError(result, 'insertAgent');
}

export async function updateAgent(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateAgentOp['data']
): Promise<void> {
  const row = buildAgentRow(agentId, data);
  const result = await supabase
    .from('graph_agents')
    .update(row)
    .eq('agent_id', agentId)
    .eq('agent_key', data.agentKey);
  throwOnMutationError(result, 'updateAgent');
}

export async function deleteAgent(
  supabase: SupabaseClient,
  agentId: string,
  agentKey: string
): Promise<void> {
  const result = await supabase
    .from('graph_agents')
    .delete()
    .eq('agent_id', agentId)
    .eq('agent_key', agentKey);
  throwOnMutationError(result, 'deleteAgent');
}
