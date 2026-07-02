import type { McpServerConfig, VariableValue } from '@daviddh/graph-types';
import {
  type DescribeAllItem,
  type ProviderCtx,
  builtInProviders,
  composeRegistry,
  createTransport,
} from '@daviddh/llm-graph-runner';
import type { Request } from 'express';

import { assembleAgentConfig, isAgentType } from '../../db/queries/agentConfigQueries.js';
import { getAgentById } from '../../db/queries/agentQueries.js';
import { getDecryptedEnvVariables } from '../../db/queries/executionAuthQueries.js';
import { assembleGraph } from '../../db/queries/graphQueries.js';
import { type McpTenantConfigRow, getTenantConfigs } from '../../db/queries/mcpTenantConfigQueries.js';
import { getTenantsByOrg } from '../../db/queries/tenantQueries.js';
import { makeGuardedCreateTransport } from '../../lib/guardedCreateTransport.js';
import { consoleLogger } from '../../logger.js';
import { resolveServerTransport } from '../execute/executeHelpers.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

// The builder's tools panel reflects the DRAFT graph the user is editing (via the
// same assemblers as GET /graph), NOT the published version — otherwise a
// newly-added/configured MCP server shows no tools until publish.
async function getDraftMcpServers(
  supabase: AuthenticatedLocals['supabase'],
  agentId: string
): Promise<McpServerConfig[]> {
  if (await isAgentType(supabase, agentId)) {
    const config = await assembleAgentConfig(supabase, agentId);
    return config?.mcpServers ?? [];
  }
  const graph = await assembleGraph(supabase, agentId);
  return graph?.mcpServers ?? [];
}

function buildCatalogProviderCtx(orgId: string, agentId: string, tenantId: string): ProviderCtx {
  return {
    orgId,
    tenantId,
    agentId,
    isChildAgent: false,
    logger: consoleLogger,
    oauthTokens: new Map<string, never>(),
    mcpServers: new Map<string, McpServerConfig>(),
    services: () => undefined,
  };
}

// The SP1 default tenant (first row of getTenantsByOrg) is the builder's canonical
// reference tenant; its per-server config overrides the agent-wide variableValues.
async function resolveDefaultTenant(
  supabase: AuthenticatedLocals['supabase'],
  orgId: string
): Promise<string | null> {
  const { result } = await getTenantsByOrg(supabase, orgId);
  const [defaultTenant] = result;
  return defaultTenant?.id ?? null;
}

function buildDefaultTenantVarMap(
  configs: McpTenantConfigRow[],
  defaultTenantId: string
): Map<string, Record<string, VariableValue>> {
  const map = new Map<string, Record<string, VariableValue>>();
  for (const cfg of configs) {
    if (cfg.tenant_id === defaultTenantId) map.set(cfg.server_id, cfg.variable_values);
  }
  return map;
}

function applyDefaultTenantValues(
  servers: McpServerConfig[],
  varMap: Map<string, Record<string, VariableValue>>
): McpServerConfig[] {
  return servers.map((server) => {
    const tenantValues = varMap.get(server.id);
    if (tenantValues === undefined) return server;
    return { ...server, variableValues: tenantValues };
  });
}

interface ProviderResponseShape {
  type: 'builtin' | 'mcp';
  id: string;
  displayName: string;
  description?: string;
  tools: DescribeAllItem['tools'];
  cachedAt?: number;
  serverVersion?: string;
  error?: DescribeAllItem['error'];
}

function shapeProviders(items: DescribeAllItem[]): ProviderResponseShape[] {
  return items.map((item) => ({
    type: item.provider.type,
    id: item.provider.id,
    displayName: item.provider.displayName,
    description: item.provider.description,
    tools: item.tools,
    cachedAt: item.cachedAt,
    serverVersion: item.serverVersion,
    error: item.error,
  }));
}

interface ResolveServersArgs {
  supabase: AuthenticatedLocals['supabase'];
  agentId: string;
  orgId: string;
  defaultTenantId: string | null;
  rawMcpServers: McpServerConfig[];
}

async function resolveDefaultTenantMcpServers(args: ResolveServersArgs): Promise<McpServerConfig[]> {
  const { supabase, agentId, orgId, defaultTenantId, rawMcpServers } = args;
  const env = await getDecryptedEnvVariables(supabase, orgId);
  if (defaultTenantId === null) {
    return rawMcpServers.map((s) => resolveServerTransport(s, env.byName, env.byId));
  }
  const configs = await getTenantConfigs(supabase, agentId);
  const varMap = buildDefaultTenantVarMap(configs, defaultTenantId);
  const withDefaults = applyDefaultTenantValues(rawMcpServers, varMap);
  return withDefaults.map((s) => resolveServerTransport(s, env.byName, env.byId));
}

async function respondWithRegistry(
  supabase: AuthenticatedLocals['supabase'],
  agentId: string,
  res: AuthenticatedResponse
): Promise<void> {
  const { result: agent } = await getAgentById(supabase, agentId);
  if (agent === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agent not found' });
    return;
  }
  const rawMcpServers = await getDraftMcpServers(supabase, agentId);
  const defaultTenantId = await resolveDefaultTenant(supabase, agent.org_id);
  const orgMcpServers = await resolveDefaultTenantMcpServers({
    supabase,
    agentId,
    orgId: agent.org_id,
    defaultTenantId,
    rawMcpServers,
  });
  const registry = composeRegistry({
    builtIns: builtInProviders,
    orgMcpServers,
    logger: consoleLogger,
    createTransport: makeGuardedCreateTransport(createTransport),
  });
  const ctx = buildCatalogProviderCtx(agent.org_id, agentId, defaultTenantId ?? '');
  const items = await registry.describeAll(ctx);
  res.status(HTTP_OK).json({ providers: shapeProviders(items), fetchedAt: Date.now() });
}

export async function handleGetAgentRegistry(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  try {
    await respondWithRegistry(supabase, agentId, res);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
