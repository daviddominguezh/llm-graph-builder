import type { McpServerConfig, VariableValue } from '@daviddh/graph-types';

import { getAgentById } from '../../db/queries/agentQueries.js';
import { getDecryptedEnvVariables, getPublishedGraphData } from '../../db/queries/executionAuthQueries.js';
import { type McpTenantConfigRow, getTenantConfigs } from '../../db/queries/mcpTenantConfigQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { resolveServerTransport } from '../../routes/execute/executeHelpers.js';

export class BindingNotFoundError extends Error {
  constructor() {
    super('binding not found');
    this.name = 'BindingNotFoundError';
  }
}

export interface ResolvedBinding {
  orgId: string;
  server: McpServerConfig;
}

interface AgentRow {
  id: string;
  org_id: string;
  current_version: number;
}

export interface ResolveBindingDeps {
  getAgent: (agentId: string) => Promise<AgentRow | null>;
  getGraph: (agentId: string, version: number) => Promise<Record<string, unknown> | null>;
  getTenantConfigs: (agentId: string) => Promise<McpTenantConfigRow[]>;
  getEnv: (orgId: string) => Promise<{ byName: Record<string, string>; byId: Record<string, string> }>;
  resolveTransport: (
    s: McpServerConfig,
    byName: Record<string, string>,
    byId: Record<string, string>
  ) => McpServerConfig;
}

export function buildResolveBindingDeps(supabase: SupabaseClient): ResolveBindingDeps {
  return {
    getAgent: async (agentId) => (await getAgentById(supabase, agentId)).result,
    getGraph: async (agentId, version) => await getPublishedGraphData(supabase, agentId, version),
    getTenantConfigs: async (agentId) => await getTenantConfigs(supabase, agentId),
    getEnv: async (orgId) => await getDecryptedEnvVariables(supabase, orgId),
    resolveTransport: resolveServerTransport,
  };
}

function extractServers(graph: Record<string, unknown> | null): McpServerConfig[] {
  if (graph === null) return [];
  const { mcpServers } = graph as { mcpServers?: McpServerConfig[] };
  return Array.isArray(mcpServers) ? mcpServers : [];
}

function tenantVarsFor(
  configs: McpTenantConfigRow[],
  serverId: string,
  tenantId: string
): Record<string, VariableValue> | undefined {
  const row = configs.find((c) => c.server_id === serverId && c.tenant_id === tenantId);
  return row?.variable_values;
}

interface ResolveArgs {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
  deps: ResolveBindingDeps;
}

export async function resolveBinding(args: ResolveArgs): Promise<ResolvedBinding> {
  const { agentId, tenantId, mcpBindingId, deps } = args;
  // Trust boundary: the org, server config, and tenant overrides are all derived
  // from the DB by agentId — never from caller-supplied values.
  const agent = await deps.getAgent(agentId);
  if (agent === null) throw new BindingNotFoundError();
  const servers = extractServers(await deps.getGraph(agentId, agent.current_version));
  const raw = servers.find((s) => s.id === mcpBindingId);
  if (raw === undefined) throw new BindingNotFoundError();
  const tenantVars = tenantVarsFor(await deps.getTenantConfigs(agentId), mcpBindingId, tenantId);
  const withVars = tenantVars === undefined ? raw : { ...raw, variableValues: tenantVars };
  const env = await deps.getEnv(agent.org_id);
  return { orgId: agent.org_id, server: deps.resolveTransport(withVars, env.byName, env.byId) };
}
