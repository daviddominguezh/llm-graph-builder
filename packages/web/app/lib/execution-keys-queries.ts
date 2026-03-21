import type { SupabaseClient } from '@supabase/supabase-js';

import type { ExecutionKeyAgent, ExecutionKeyRow } from './execution-keys';
import {
  EXECUTION_KEY_COLUMNS,
  generateExecutionKey,
  mapExecutionKeyAgents,
  mapExecutionKeyRows,
} from './execution-keys';

export interface CreateExecutionKeyResult {
  key: ExecutionKeyRow;
  fullKey: string;
}

export async function getExecutionKeysByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: ExecutionKeyRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_keys')
    .select(EXECUTION_KEY_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapExecutionKeyRows(rows), error: null };
}

interface AgentJoinRow {
  agent_id: string;
  agents: { name: string; slug: string } | null;
}

function isAgentJoinRow(value: unknown): value is AgentJoinRow {
  return typeof value === 'object' && value !== null && 'agent_id' in value && 'agents' in value;
}

function mapAgentJoinRows(data: unknown[]): ExecutionKeyAgent[] {
  return data.reduce<ExecutionKeyAgent[]>((acc, row) => {
    if (!isAgentJoinRow(row)) return acc;
    const agent = row.agents;
    if (agent === null) return acc;
    acc.push({ agent_id: row.agent_id, agent_name: agent.name, agent_slug: agent.slug });
    return acc;
  }, []);
}

export async function getAgentsForKey(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ result: ExecutionKeyAgent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_key_agents')
    .select('agent_id, agents(name, slug)')
    .eq('key_id', keyId);

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapAgentJoinRows(rows), error: null };
}

async function insertKeyRow(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  keyHash: string,
  keyPrefix: string,
  expiresAt: string | null
): Promise<{ row: ExecutionKeyRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_keys')
    .insert({ org_id: orgId, name, key_hash: keyHash, key_prefix: keyPrefix, expires_at: expiresAt })
    .select(EXECUTION_KEY_COLUMNS)
    .single();

  if (error !== null) return { row: null, error: error.message };
  const rows = mapExecutionKeyRows([data as unknown]);
  const first = rows[0];
  if (!first) return { row: null, error: 'Invalid execution key data' };
  return { row: first, error: null };
}

async function insertKeyAgents(
  supabase: SupabaseClient,
  keyId: string,
  agentIds: string[]
): Promise<{ error: string | null }> {
  if (agentIds.length === 0) return { error: null };

  const rows = agentIds.map((agentId) => ({ key_id: keyId, agent_id: agentId }));
  const { error } = await supabase.from('agent_execution_key_agents').insert(rows);

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function createExecutionKey(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  agentIds: string[],
  expiresAt: string | null
): Promise<{ result: CreateExecutionKeyResult | null; error: string | null }> {
  const { fullKey, keyHash, keyPrefix } = generateExecutionKey();

  const keyResult = await insertKeyRow(supabase, orgId, name, keyHash, keyPrefix, expiresAt);
  if (keyResult.error !== null || keyResult.row === null) {
    return { result: null, error: keyResult.error ?? 'Failed to create key' };
  }

  const agentResult = await insertKeyAgents(supabase, keyResult.row.id, agentIds);
  if (agentResult.error !== null) {
    await supabase.from('agent_execution_keys').delete().eq('id', keyResult.row.id);
    return { result: null, error: agentResult.error };
  }

  return { result: { key: keyResult.row, fullKey }, error: null };
}

export async function updateExecutionKeyAgents(
  supabase: SupabaseClient,
  keyId: string,
  agentIds: string[]
): Promise<{ error: string | null }> {
  const { error: deleteError } = await supabase
    .from('agent_execution_key_agents')
    .delete()
    .eq('key_id', keyId);

  if (deleteError !== null) return { error: deleteError.message };
  return insertKeyAgents(supabase, keyId, agentIds);
}

export async function updateExecutionKeyName(
  supabase: SupabaseClient,
  keyId: string,
  name: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('agent_execution_keys').update({ name }).eq('id', keyId);

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function deleteExecutionKey(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('agent_execution_keys').delete().eq('id', keyId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
