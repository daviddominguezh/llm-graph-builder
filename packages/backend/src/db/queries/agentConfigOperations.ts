import type { Operation } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type UpdateConfigOp = Extract<Operation, { type: 'updateAgentConfig' }>;
type InsertItemOp = Extract<Operation, { type: 'insertContextItem' }>;
type UpdateItemOp = Extract<Operation, { type: 'updateContextItem' }>;
type DeleteItemOp = Extract<Operation, { type: 'deleteContextItem' }>;
type ReorderItemsOp = Extract<Operation, { type: 'reorderContextItems' }>;
type InsertSkillOp = Extract<Operation, { type: 'insertSkill' }>;
type DeleteSkillOp = Extract<Operation, { type: 'deleteSkill' }>;
type DeleteManySkillsOp = Extract<Operation, { type: 'deleteManySkills' }>;

function buildConfigPayload(data: UpdateConfigOp['data']): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const { systemPrompt, maxSteps } = data;
  if (systemPrompt !== undefined) payload.system_prompt = systemPrompt;
  if (maxSteps !== undefined) payload.max_steps = maxSteps;
  return payload;
}

export async function updateAgentConfig(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateConfigOp['data']
): Promise<void> {
  const payload = buildConfigPayload(data);
  const result = await supabase.from('agents').update(payload).eq('id', agentId);
  throwOnMutationError(result, 'updateAgentConfig');
}

export async function insertContextItem(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertItemOp['data']
): Promise<void> {
  const row = { agent_id: agentId, sort_order: data.sortOrder, content: data.content };
  const result = await supabase
    .from('agent_context_items')
    .upsert(row, { onConflict: 'agent_id,sort_order' });
  throwOnMutationError(result, 'insertContextItem');
}

export async function updateContextItem(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateItemOp['data']
): Promise<void> {
  const result = await supabase
    .from('agent_context_items')
    .update({ content: data.content })
    .eq('agent_id', agentId)
    .eq('sort_order', data.sortOrder);
  throwOnMutationError(result, 'updateContextItem');
}

export async function deleteContextItem(
  supabase: SupabaseClient,
  agentId: string,
  data: DeleteItemOp['data']
): Promise<void> {
  const result = await supabase
    .from('agent_context_items')
    .delete()
    .eq('agent_id', agentId)
    .eq('sort_order', data.sortOrder);
  throwOnMutationError(result, 'deleteContextItem');
}

export async function reorderContextItems(
  supabase: SupabaseClient,
  agentId: string,
  data: ReorderItemsOp['data']
): Promise<void> {
  const result = await supabase.rpc('reorder_context_items', {
    p_agent_id: agentId,
    p_sort_orders: data.sortOrders,
  });
  if (result.error !== null) {
    throw new Error(`reorderContextItems: ${result.error.message}`);
  }
}

function buildSkillRow(agentId: string, data: InsertSkillOp['data']): Record<string, unknown> {
  return {
    agent_id: agentId,
    name: data.name,
    description: data.description,
    content: data.content,
    repo_url: data.repoUrl,
    sort_order: data.sortOrder,
  };
}

export async function insertSkill(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertSkillOp['data']
): Promise<void> {
  const row = buildSkillRow(agentId, data);
  const result = await supabase.from('agent_skills').upsert(row, { onConflict: 'agent_id,name' });
  throwOnMutationError(result, 'insertSkill');
}

export async function deleteSkill(
  supabase: SupabaseClient,
  agentId: string,
  data: DeleteSkillOp['data']
): Promise<void> {
  const result = await supabase.from('agent_skills').delete().eq('agent_id', agentId).eq('name', data.name);
  throwOnMutationError(result, 'deleteSkill');
}

export async function deleteManySkills(
  supabase: SupabaseClient,
  agentId: string,
  data: DeleteManySkillsOp['data']
): Promise<void> {
  const result = await supabase.from('agent_skills').delete().eq('agent_id', agentId).in('name', data.names);
  throwOnMutationError(result, 'deleteManySkills');
}
