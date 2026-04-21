import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AgentVfsConfigRow,
  AgentVfsSettings,
  VfsConfigUpsertInput,
  VfsConfigWithInstallation,
} from './vfsConfigTypes.js';

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isVfsConfigWithInstallation(row: unknown): row is VfsConfigWithInstallation {
  return typeof row === 'object' && row !== null && 'installation_status' in row;
}

function isAgentVfsConfigRow(row: unknown): row is AgentVfsConfigRow {
  return typeof row === 'object' && row !== null && 'agent_id' in row;
}

/* ------------------------------------------------------------------ */
/*  Queries via RPC (joined)                                           */
/* ------------------------------------------------------------------ */

export async function getVfsConfigsByAgent(
  supabase: SupabaseClient,
  agentId: string
): Promise<VfsConfigWithInstallation[]> {
  const result = await supabase.rpc('get_agent_vfs_configs', { p_agent_id: agentId });

  if (result.error !== null) {
    throw new Error(`Failed to fetch VFS configs: ${result.error.message}`);
  }

  const rows: unknown[] = Array.isArray(result.data) ? (result.data as unknown[]) : [];
  return rows.filter(isVfsConfigWithInstallation);
}

export async function getVfsConfigForDispatch(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string
): Promise<VfsConfigWithInstallation | null> {
  const result = await supabase.rpc('get_agent_vfs_config_for_dispatch', {
    p_agent_id: agentId,
    p_org_id: orgId,
  });

  if (result.error !== null) {
    throw new Error(`Failed to fetch VFS config for dispatch: ${result.error.message}`);
  }

  const rows: unknown[] = Array.isArray(result.data) ? (result.data as unknown[]) : [];
  const [first] = rows;
  return isVfsConfigWithInstallation(first) ? first : null;
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export async function upsertVfsConfig(
  supabase: SupabaseClient,
  input: VfsConfigUpsertInput
): Promise<AgentVfsConfigRow> {
  const result = await supabase
    .from('agent_vfs_configs')
    .upsert(
      {
        agent_id: input.agentId,
        org_id: input.orgId,
        installation_id: input.installationId,
        repo_id: input.repoId,
        repo_full_name: input.repoFullName,
      },
      { onConflict: 'agent_id,org_id' }
    )
    .select()
    .single();

  if (result.error !== null) {
    throw new Error(`Failed to upsert VFS config: ${result.error.message}`);
  }
  if (!isAgentVfsConfigRow(result.data)) {
    throw new Error('Unexpected response from VFS config upsert');
  }
  return result.data;
}

export async function deleteVfsConfig(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string
): Promise<void> {
  const { error } = await supabase
    .from('agent_vfs_configs')
    .delete()
    .eq('agent_id', agentId)
    .eq('org_id', orgId);

  if (error !== null) {
    throw new Error(`Failed to delete VFS config: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ */
/*  VFS settings (agents.vfs_settings JSONB)                           */
/* ------------------------------------------------------------------ */

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function isVfsSettings(val: unknown): val is AgentVfsSettings {
  if (!isRecord(val)) return false;
  return val.enabled === true;
}

function parseVfsSettings(raw: unknown): AgentVfsSettings | null {
  return isVfsSettings(raw) ? raw : null;
}

export async function getAgentVfsSettings(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentVfsSettings | null> {
  const { data, error } = await supabase.from('agents').select('vfs_settings').eq('id', agentId).single();

  if (error !== null) return null;
  const row = data as { vfs_settings?: unknown } | null;
  return parseVfsSettings(row?.vfs_settings);
}

export async function updateAgentVfsSettings(
  supabase: SupabaseClient,
  agentId: string,
  settings: AgentVfsSettings | null
): Promise<void> {
  const { error } = await supabase.from('agents').update({ vfs_settings: settings }).eq('id', agentId);

  if (error !== null) {
    throw new Error(`Failed to update VFS settings: ${error.message}`);
  }
}
