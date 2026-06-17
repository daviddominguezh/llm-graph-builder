import type { SupabaseClient } from '@supabase/supabase-js';

import type { CreateExecutionKeyResult, ExecutionKeyRow } from './executionKeyQueries.js';
import { generateExecutionKey, mapExecutionKeyRows } from './executionKeyQueries.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EXECUTION_KEY_COLUMNS =
  'id, org_id, name, key_prefix, all_agents, all_tenants, expires_at, created_at, last_used_at';
const EMPTY_LENGTH = 0;

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

interface InsertKeyRowInput {
  orgId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  allAgents: boolean;
  allTenants: boolean;
  expiresAt: string | null;
}

async function insertKeyRow(
  supabase: SupabaseClient,
  input: InsertKeyRowInput
): Promise<{ row: ExecutionKeyRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_keys')
    .insert({
      org_id: input.orgId,
      name: input.name,
      key_hash: input.keyHash,
      key_prefix: input.keyPrefix,
      all_agents: input.allAgents,
      all_tenants: input.allTenants,
      expires_at: input.expiresAt,
    })
    .select(EXECUTION_KEY_COLUMNS)
    .single();

  if (error !== null) return { row: null, error: error.message };
  const rowData: unknown = data;
  const rows = mapExecutionKeyRows([rowData]);
  const [first] = rows;
  if (first === undefined) return { row: null, error: 'Invalid execution key data' };
  return { row: first, error: null };
}

async function insertKeyAgents(
  supabase: SupabaseClient,
  keyId: string,
  agentIds: string[]
): Promise<{ error: string | null }> {
  if (agentIds.length === EMPTY_LENGTH) return { error: null };

  const rows = agentIds.map((agentId) => ({ key_id: keyId, agent_id: agentId }));
  const { error } = await supabase.from('agent_execution_key_agents').insert(rows);

  if (error !== null) return { error: error.message };
  return { error: null };
}

async function insertKeyTenants(
  supabase: SupabaseClient,
  keyId: string,
  tenantIds: string[]
): Promise<{ error: string | null }> {
  if (tenantIds.length === EMPTY_LENGTH) return { error: null };

  const rows = tenantIds.map((tenantId) => ({ key_id: keyId, tenant_id: tenantId }));
  const { error } = await supabase.from('agent_execution_key_tenants').insert(rows);

  if (error !== null) return { error: error.message };
  return { error: null };
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export interface CreateExecutionKeyInput {
  orgId: string;
  name: string;
  allAgents: boolean;
  agentIds: string[];
  allTenants: boolean;
  tenantIds: string[];
  expiresAt: string | null;
}

async function insertKeyScopes(
  supabase: SupabaseClient,
  keyId: string,
  input: CreateExecutionKeyInput
): Promise<{ error: string | null }> {
  if (!input.allAgents) {
    const agentResult = await insertKeyAgents(supabase, keyId, input.agentIds);
    if (agentResult.error !== null) return { error: agentResult.error };
  }
  if (!input.allTenants) {
    const tenantResult = await insertKeyTenants(supabase, keyId, input.tenantIds);
    if (tenantResult.error !== null) return { error: tenantResult.error };
  }
  return { error: null };
}

export async function createExecutionKey(
  supabase: SupabaseClient,
  input: CreateExecutionKeyInput
): Promise<{ result: CreateExecutionKeyResult | null; error: string | null }> {
  const { fullKey, keyHash, keyPrefix } = generateExecutionKey();

  const keyResult = await insertKeyRow(supabase, {
    orgId: input.orgId,
    name: input.name,
    keyHash,
    keyPrefix,
    allAgents: input.allAgents,
    allTenants: input.allTenants,
    expiresAt: input.expiresAt,
  });
  if (keyResult.error !== null || keyResult.row === null) {
    return { result: null, error: keyResult.error ?? 'Failed to create key' };
  }

  const scopeResult = await insertKeyScopes(supabase, keyResult.row.id, input);
  if (scopeResult.error !== null) {
    await supabase.from('agent_execution_keys').delete().eq('id', keyResult.row.id);
    return { result: null, error: scopeResult.error };
  }

  return { result: { key: keyResult.row, fullKey }, error: null };
}

export async function updateExecutionKeyAllAgents(
  supabase: SupabaseClient,
  keyId: string,
  allAgents: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_execution_keys')
    .update({ all_agents: allAgents })
    .eq('id', keyId);

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateExecutionKeyAgents(
  supabase: SupabaseClient,
  keyId: string,
  allAgents: boolean,
  agentIds: string[]
): Promise<{ error: string | null }> {
  const allAgentsResult = await updateExecutionKeyAllAgents(supabase, keyId, allAgents);
  if (allAgentsResult.error !== null) return allAgentsResult;

  const { error: deleteError } = await supabase
    .from('agent_execution_key_agents')
    .delete()
    .eq('key_id', keyId);

  if (deleteError !== null) return { error: deleteError.message };

  if (allAgents) return { error: null };
  return await insertKeyAgents(supabase, keyId, agentIds);
}

export async function updateExecutionKeyAllTenants(
  supabase: SupabaseClient,
  keyId: string,
  allTenants: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_execution_keys')
    .update({ all_tenants: allTenants })
    .eq('id', keyId);

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateExecutionKeyTenants(
  supabase: SupabaseClient,
  keyId: string,
  allTenants: boolean,
  tenantIds: string[]
): Promise<{ error: string | null }> {
  const allTenantsResult = await updateExecutionKeyAllTenants(supabase, keyId, allTenants);
  if (allTenantsResult.error !== null) return allTenantsResult;

  const { error: deleteError } = await supabase
    .from('agent_execution_key_tenants')
    .delete()
    .eq('key_id', keyId);

  if (deleteError !== null) return { error: deleteError.message };

  if (allTenants) return { error: null };
  return await insertKeyTenants(supabase, keyId, tenantIds);
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
