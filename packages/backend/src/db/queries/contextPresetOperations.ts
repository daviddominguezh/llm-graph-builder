import type { Operation } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type InsertPresetOp = Extract<Operation, { type: 'insertContextPreset' }>;
type UpdatePresetOp = Extract<Operation, { type: 'updateContextPreset' }>;

interface ContextPresetInsertRow {
  agent_id: string;
  name: string;
  session_id: string | undefined;
  tenant_id: string | undefined;
  user_id: string | undefined;
  data: Record<string, unknown> | undefined;
}

function buildPresetRow(agentId: string, data: InsertPresetOp['data']): ContextPresetInsertRow {
  return {
    agent_id: agentId,
    name: data.name,
    session_id: data.sessionId,
    tenant_id: data.tenantId,
    user_id: data.userId,
    data: data.data,
  };
}

export async function insertContextPreset(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertPresetOp['data']
): Promise<void> {
  const row = buildPresetRow(agentId, data);
  const result = await supabase.from('graph_context_presets').upsert(row, { onConflict: 'agent_id,name' });
  throwOnMutationError(result, 'insertContextPreset');
}

export async function updateContextPreset(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdatePresetOp['data']
): Promise<void> {
  const row = buildPresetRow(agentId, data);
  const result = await supabase
    .from('graph_context_presets')
    .update(row)
    .eq('agent_id', agentId)
    .eq('name', data.name);
  throwOnMutationError(result, 'updateContextPreset');
}

export async function deleteContextPreset(
  supabase: SupabaseClient,
  agentId: string,
  name: string
): Promise<void> {
  const result = await supabase
    .from('graph_context_presets')
    .delete()
    .eq('agent_id', agentId)
    .eq('name', name);
  throwOnMutationError(result, 'deleteContextPreset');
}
