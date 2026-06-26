import type { SupabaseClient } from './operationHelpers.js';

export type ServerTenantStatus = 'ok' | 'pending' | 'error';

export interface McpTenantDiscoveryRow {
  agent_id: string;
  server_id: string;
  tenant_id: string;
  status: ServerTenantStatus;
  error: string | null;
  values_hash: string | null;
  discovered_at: string | null;
}

export interface DiscoveryResultArgs {
  agentId: string;
  serverId: string;
  tenantId: string;
  status: ServerTenantStatus;
  error: string | null;
  valuesHash: string | null;
}

export interface ResetArgs {
  agentId: string;
  serverId?: string;
  tenantId?: string;
}

const DISCOVERY_COLUMNS = 'agent_id, server_id, tenant_id, status, error, values_hash, discovered_at';

export async function getTenantDiscovery(
  supabase: SupabaseClient,
  agentId: string
): Promise<McpTenantDiscoveryRow[]> {
  const { data, error } = await supabase
    .from('graph_mcp_server_tenant_discovery')
    .select(DISCOVERY_COLUMNS)
    .eq('agent_id', agentId);
  if (error !== null) throw new Error(`getTenantDiscovery: ${error.message}`);
  return data as McpTenantDiscoveryRow[];
}

export async function upsertDiscoveryResult(
  supabase: SupabaseClient,
  args: DiscoveryResultArgs
): Promise<void> {
  const { error } = await supabase.from('graph_mcp_server_tenant_discovery').upsert({
    agent_id: args.agentId,
    server_id: args.serverId,
    tenant_id: args.tenantId,
    status: args.status,
    error: args.error,
    values_hash: args.valuesHash,
    discovered_at: new Date().toISOString(),
  });
  if (error !== null) throw new Error(`upsertDiscoveryResult: ${error.message}`);
}

// Reset matching discovery rows to 'pending' (after an edit invalidates them).
export async function resetDiscovery(supabase: SupabaseClient, args: ResetArgs): Promise<void> {
  let query = supabase
    .from('graph_mcp_server_tenant_discovery')
    .update({ status: 'pending', error: null, values_hash: null, discovered_at: null })
    .eq('agent_id', args.agentId);
  if (args.serverId !== undefined) query = query.eq('server_id', args.serverId);
  if (args.tenantId !== undefined) query = query.eq('tenant_id', args.tenantId);
  const { error } = await query;
  if (error !== null) throw new Error(`resetDiscovery: ${error.message}`);
}
