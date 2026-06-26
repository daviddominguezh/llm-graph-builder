import type { McpServerConfig, VariableValue } from '@daviddh/graph-types';
import type { Request } from 'express';

import { getAgentById } from '../../db/queries/agentQueries.js';
import { getDecryptedEnvVariables } from '../../db/queries/executionAuthQueries.js';
import { assembleMcpServers } from '../../db/queries/graphAssemblers.js';
import { fetchMcpServers } from '../../db/queries/graphFetchers.js';
import { type McpTenantConfigRow, getTenantConfigs } from '../../db/queries/mcpTenantConfigQueries.js';
import type { McpTenantDiscoveryRow } from '../../db/queries/mcpTenantDiscoveryQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';
import { verifyDiscover } from './services/mcpTenantVerifyDiscover.js';
import { type VerifyDeps, verifyAllForServer, verifyMcpTenantConfig } from './services/verifyMcpTenant.js';

interface VerifyParams {
  serverId?: string;
  tenantId?: string;
}

function getServerId(req: Request): string | undefined {
  const { serverId }: VerifyParams = req.params;
  return typeof serverId === 'string' ? serverId : undefined;
}

function getTenantId(req: Request): string | undefined {
  const { tenantId }: VerifyParams = req.params;
  return typeof tenantId === 'string' ? tenantId : undefined;
}

function findServer(servers: McpServerConfig[], serverId: string): McpServerConfig | undefined {
  return servers.find((s) => s.id === serverId);
}

function tenantsForServer(
  configs: McpTenantConfigRow[],
  serverId: string
): Array<{ tenantId: string; variableValues: Record<string, VariableValue> }> {
  return configs
    .filter((c) => c.server_id === serverId)
    .map((c) => ({ tenantId: c.tenant_id, variableValues: c.variable_values }));
}

interface VerifyContext {
  supabase: AuthenticatedLocals['supabase'];
  agentId: string;
  orgId: string;
  server: McpServerConfig;
}

async function runVerifyAll(ctx: VerifyContext): Promise<McpTenantDiscoveryRow[]> {
  const [configs, env] = await Promise.all([
    getTenantConfigs(ctx.supabase, ctx.agentId),
    getDecryptedEnvVariables(ctx.supabase, ctx.orgId),
  ]);
  const deps: VerifyDeps = { supabase: ctx.supabase, orgId: ctx.orgId, discover: verifyDiscover };
  return await verifyAllForServer(deps, {
    server: ctx.server,
    tenants: tenantsForServer(configs, ctx.server.id),
    agentId: ctx.agentId,
    envByName: env.byName,
    envById: env.byId,
  });
}

function tenantConfigFor(
  configs: McpTenantConfigRow[],
  serverId: string,
  tenantId: string
): Record<string, VariableValue> {
  const match = configs.find((c) => c.server_id === serverId && c.tenant_id === tenantId);
  return match?.variable_values ?? {};
}

async function runVerifyTenant(ctx: VerifyContext, tenantId: string): Promise<McpTenantDiscoveryRow> {
  const [configs, env] = await Promise.all([
    getTenantConfigs(ctx.supabase, ctx.agentId),
    getDecryptedEnvVariables(ctx.supabase, ctx.orgId),
  ]);
  const deps: VerifyDeps = { supabase: ctx.supabase, orgId: ctx.orgId, discover: verifyDiscover };
  return await verifyMcpTenantConfig(deps, {
    agentId: ctx.agentId,
    serverId: ctx.server.id,
    tenantId,
    transport: ctx.server.transport,
    variableValues: tenantConfigFor(configs, ctx.server.id, tenantId),
    envByName: env.byName,
    envById: env.byId,
  });
}

async function resolveVerifyContext(
  supabase: AuthenticatedLocals['supabase'],
  agentId: string,
  serverId: string
): Promise<VerifyContext | null> {
  const { result: agent } = await getAgentById(supabase, agentId);
  if (agent === null) return null;
  const servers = assembleMcpServers(await fetchMcpServers(supabase, agentId)) ?? [];
  const server = findServer(servers, serverId);
  if (server === undefined) return null;
  return { supabase, agentId, orgId: agent.org_id, server };
}

export async function handleVerifyTenantServer(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const serverId = getServerId(req);
  if (agentId === undefined || serverId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId and serverId required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  try {
    const ctx = await resolveVerifyContext(supabase, agentId, serverId);
    if (ctx === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'agent or server not found' });
      return;
    }
    const rows = await runVerifyAll(ctx);
    res.status(HTTP_OK).json({ rows });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}

export async function handleVerifyTenantCell(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const serverId = getServerId(req);
  const tenantId = getTenantId(req);
  if (agentId === undefined || serverId === undefined || tenantId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId, serverId and tenantId required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  try {
    const ctx = await resolveVerifyContext(supabase, agentId, serverId);
    if (ctx === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'agent or server not found' });
      return;
    }
    const row = await runVerifyTenant(ctx, tenantId);
    res.status(HTTP_OK).json({ row });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
