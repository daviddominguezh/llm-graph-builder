import type { McpServerConfig, McpTransport, VariableValue } from '@daviddh/graph-types';

import type { DecryptedEnvVars } from '../db/queries/executionAuthQueries.js';
import { getDecryptedEnvVariables } from '../db/queries/executionAuthQueries.js';
import { getLibraryItemById, parseLibraryTransport } from '../db/queries/mcpLibraryQueries.js';
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
 * The transport to resolve against. For a library-backed server we use the
 * library item's PRISTINE template (its `{{VAR}}` secret refs survive, unlike
 * the FE transport, which the `/api/simulate` proxy flattens to `Bearer `
 * client-side). Custom servers (no `libraryItemId`) keep their FE transport.
 */
function pristineTransportFor(
  server: McpServerConfig,
  pristineTransports: Map<string, McpTransport>
): McpTransport {
  if (server.libraryItemId === undefined) return server.transport;
  return pristineTransports.get(server.libraryItemId) ?? server.transport;
}

export interface SimResolveContext {
  tenantConfigs: McpTenantConfigRow[];
  defaultTenantId: string | undefined;
  env: DecryptedEnvVars;
  pristineTransports: Map<string, McpTransport>;
}

/**
 * Resolve ONE sim server: take the default-tenant `variable_values` (falling
 * back to the server's own), pair them with the pristine library transport, then
 * substitute `{{VAR}}` templates — secret env `ref`s included — via the decrypted
 * env maps. Mirrors production `resolveBinding` / the tool-test `resolveStaticToken`.
 */
export function resolveOneSimServer(server: McpServerConfig, ctx: SimResolveContext): McpServerConfig {
  const tenantVars = tenantVarsForServer(ctx.tenantConfigs, server.id, ctx.defaultTenantId);
  const withVars: McpServerConfig = {
    ...server,
    transport: pristineTransportFor(server, ctx.pristineTransports),
    variableValues: tenantVars ?? server.variableValues,
  };
  return resolveServerTransport(withVars, ctx.env.byName, ctx.env.byId);
}

/** Never re-loads the DB graph: resolves the caller-supplied (possibly unsaved) servers. */
export function applyTenantResolution(servers: McpServerConfig[], ctx: SimResolveContext): McpServerConfig[] {
  return servers.map((server) => resolveOneSimServer(server, ctx));
}

/** Distinct `libraryItemId`s across the sim servers. */
function libraryItemIds(servers: McpServerConfig[]): string[] {
  const ids = servers.map((s) => s.libraryItemId).filter((id): id is string => id !== undefined);
  return [...new Set(ids)];
}

/**
 * Load each referenced library item's pristine transport, keyed by libraryItemId.
 * A failed lookup or unparsable row is simply omitted (the server then falls back
 * to its FE transport).
 */
async function loadPristineTransports(
  supabase: SupabaseClient,
  servers: McpServerConfig[]
): Promise<Map<string, McpTransport>> {
  const entries = await Promise.all(
    libraryItemIds(servers).map(async (id): Promise<readonly [string, McpTransport] | null> => {
      const { result, error } = await getLibraryItemById(supabase, id);
      if (error !== null || result === null) return null;
      const transport = parseLibraryTransport(result);
      return transport === null ? null : ([id, transport] as const);
    })
  );
  return new Map(entries.filter((e): e is readonly [string, McpTransport] => e !== null));
}

/**
 * Load the DEFAULT tenant, its MCP tenant config, the org's decrypted env vars,
 * and each server's pristine library transport, then resolve every sim server.
 */
export async function resolveSimMcpServers(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  servers: McpServerConfig[]
): Promise<McpServerConfig[]> {
  const [defaultTenantId, tenantConfigs, env, pristineTransports] = await Promise.all([
    getDefaultTenantId(supabase, orgId),
    getTenantConfigs(supabase, agentId),
    getDecryptedEnvVariables(supabase, orgId),
    loadPristineTransports(supabase, servers),
  ]);
  return applyTenantResolution(servers, { tenantConfigs, defaultTenantId, env, pristineTransports });
}
