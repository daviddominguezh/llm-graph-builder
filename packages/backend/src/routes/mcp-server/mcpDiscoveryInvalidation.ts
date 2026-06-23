import type { VariableValue } from '@daviddh/graph-types';

import type { McpTenantConfigRow } from '../../db/queries/mcpTenantConfigQueries.js';
import { resetDiscovery } from '../../db/queries/mcpTenantDiscoveryQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

const CONFIG_COLUMNS = 'agent_id, server_id, tenant_id, variable_values, updated_at';

// Best-effort: invalidation must never fail the primary write that triggered it.
function logInvalidationFailure(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[mcpDiscoveryInvalidation] ${context} failed: ${message}\n`);
}

// A custom-MCP transport/template edit changes the discovery surface for every
// tenant of that server, so all its discovery rows must go back to pending.
export async function staleDiscoveryAfterServerEdit(
  supabase: SupabaseClient,
  agentId: string,
  serverId: string
): Promise<void> {
  try {
    await resetDiscovery(supabase, { agentId, serverId });
  } catch (err) {
    logInvalidationFailure(`server edit (${agentId}/${serverId})`, err);
  }
}

function referencesEnvVar(values: Record<string, VariableValue>, envVariableId: string): boolean {
  return Object.values(values).some(
    (value) => value.type === 'env_ref' && value.envVariableId === envVariableId
  );
}

// All config rows the caller can see (RLS scopes this to the user's org).
async function getAllVisibleTenantConfigs(supabase: SupabaseClient): Promise<McpTenantConfigRow[]> {
  const { data, error } = await supabase.from('graph_mcp_server_tenant_config').select(CONFIG_COLUMNS);
  if (error !== null) throw new Error(`getAllVisibleTenantConfigs: ${error.message}`);
  return data as McpTenantConfigRow[];
}

async function resetForConfigRows(supabase: SupabaseClient, rows: McpTenantConfigRow[]): Promise<void> {
  await Promise.all(
    rows.map(async (row) => {
      await resetDiscovery(supabase, {
        agentId: row.agent_id,
        serverId: row.server_id,
        tenantId: row.tenant_id,
      });
    })
  );
}

// An org env-variable value change invalidates every (agent, server, tenant)
// cell whose config references that variable via an env_ref.
export async function staleDiscoveryAfterEnvChange(
  supabase: SupabaseClient,
  envVariableId: string
): Promise<void> {
  try {
    const configs = await getAllVisibleTenantConfigs(supabase);
    const affected = configs.filter((row) => referencesEnvVar(row.variable_values, envVariableId));
    await resetForConfigRows(supabase, affected);
  } catch (err) {
    logInvalidationFailure(`env change (${envVariableId})`, err);
  }
}
