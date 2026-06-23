import type { VariableValue } from '@daviddh/graph-types';
import { createHash } from 'node:crypto';

import type { SupabaseClient } from './operationHelpers.js';

export interface McpTenantConfigRow {
  agent_id: string;
  server_id: string;
  tenant_id: string;
  variable_values: Record<string, VariableValue>;
  updated_at: string;
}

export interface UpsertCellArgs {
  agentId: string;
  serverId: string;
  tenantId: string;
  variableValues: Record<string, VariableValue>;
  expectedUpdatedAt: string | null;
}

export type UpsertCellResult = { kind: 'ok'; row: McpTenantConfigRow } | { kind: 'conflict' };

const CONFIG_COLUMNS = 'agent_id, server_id, tenant_id, variable_values, updated_at';

// Canonical (sorted-key) JSON hash so a discovery row can detect config drift.
export function hashVariableValues(values: Record<string, VariableValue>): string {
  const sortedKeys = Object.keys(values).sort();
  const canonical = sortedKeys.map((k) => [k, values[k]]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function getTenantConfigs(
  supabase: SupabaseClient,
  agentId: string
): Promise<McpTenantConfigRow[]> {
  const { data, error } = await supabase
    .from('graph_mcp_server_tenant_config')
    .select(CONFIG_COLUMNS)
    .eq('agent_id', agentId);
  if (error !== null) throw new Error(`getTenantConfigs: ${error.message}`);
  return data as McpTenantConfigRow[];
}

export async function upsertTenantConfigCell(
  supabase: SupabaseClient,
  args: UpsertCellArgs
): Promise<UpsertCellResult> {
  if (args.expectedUpdatedAt === null) {
    return await insertCell(supabase, args);
  }
  const result = await supabase
    .from('graph_mcp_server_tenant_config')
    .update({ variable_values: args.variableValues })
    .eq('agent_id', args.agentId)
    .eq('server_id', args.serverId)
    .eq('tenant_id', args.tenantId)
    .eq('updated_at', args.expectedUpdatedAt)
    .select(CONFIG_COLUMNS)
    .single();
  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return { kind: 'conflict' };
    throw new Error(`upsertTenantConfigCell: ${result.error.message}`);
  }
  return { kind: 'ok', row: result.data as McpTenantConfigRow };
}

async function insertCell(supabase: SupabaseClient, args: UpsertCellArgs): Promise<UpsertCellResult> {
  const result = await supabase
    .from('graph_mcp_server_tenant_config')
    .insert({
      agent_id: args.agentId,
      server_id: args.serverId,
      tenant_id: args.tenantId,
      variable_values: args.variableValues,
    })
    .select(CONFIG_COLUMNS)
    .single();
  if (result.error !== null) {
    if (result.error.code === '23505') return { kind: 'conflict' };
    throw new Error(`upsertTenantConfigCell.insert: ${result.error.message}`);
  }
  return { kind: 'ok', row: result.data as McpTenantConfigRow };
}
