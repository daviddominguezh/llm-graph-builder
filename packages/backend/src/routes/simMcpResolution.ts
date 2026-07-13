import type { McpServerConfig, VariableValue } from '@daviddh/graph-types';

import type { DecryptedEnvVars } from '../db/queries/executionAuthQueries.js';
import { getDecryptedEnvVariables } from '../db/queries/executionAuthQueries.js';
import type { McpTenantConfigRow } from '../db/queries/mcpTenantConfigQueries.js';
import { getTenantConfigs } from '../db/queries/mcpTenantConfigQueries.js';
import type { SupabaseClient } from '../db/queries/operationHelpers.js';
import { getDefaultTenantId } from '../db/queries/tenantQueries.js';
import { resolveServerTransport } from './execute/executeHelpers.js';

/**
 * The per-tenant `variable_values` for a server under the given tenant, or
 * `undefined` when the tenant scope is unknown or the server has no config row.
 */
function tenantVarsForServer(
  configs: McpTenantConfigRow[],
  serverId: string,
  tenantId: string | undefined
): Record<string, VariableValue> | undefined {
  if (tenantId === undefined) return undefined;
  return configs.find((c) => c.server_id === serverId && c.tenant_id === tenantId)?.variable_values;
}

/**
 * Resolve each sim MCP server's transport in place: pick the default-tenant
 * `variable_values` (falling back to the server's own `variableValues`), then
 * substitute `{{VAR}}` templates — including secret env `ref`s — via the decrypted
 * env maps. Mirrors production `resolveBinding`, but never re-loads the DB graph:
 * it resolves the caller-supplied (possibly unsaved) servers.
 */
export function applyTenantResolution(
  servers: McpServerConfig[],
  tenantConfigs: McpTenantConfigRow[],
  defaultTenantId: string | undefined,
  env: DecryptedEnvVars
): McpServerConfig[] {
  return servers.map((server) => {
    const tenantVars = tenantVarsForServer(tenantConfigs, server.id, defaultTenantId);
    const withVars = tenantVars === undefined ? server : { ...server, variableValues: tenantVars };
    return resolveServerTransport(withVars, env.byName, env.byId);
  });
}

/**
 * Load the DEFAULT tenant, its MCP tenant config, and the org's decrypted env
 * vars, then resolve every sim server's transport under that scope.
 */
export async function resolveSimMcpServers(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  servers: McpServerConfig[]
): Promise<McpServerConfig[]> {
  const [defaultTenantId, tenantConfigs, env] = await Promise.all([
    getDefaultTenantId(supabase, orgId),
    getTenantConfigs(supabase, agentId),
    getDecryptedEnvVariables(supabase, orgId),
  ]);
  return applyTenantResolution(servers, tenantConfigs, defaultTenantId, env);
}
