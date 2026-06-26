import type { McpServerConfig, McpTransport, VariableValue } from '@daviddh/graph-types';
import { buildResolvedVars, resolveTransport } from '@daviddh/graph-types';

import { hashVariableValues } from '../../../db/queries/mcpTenantConfigQueries.js';
import {
  type McpTenantDiscoveryRow,
  upsertDiscoveryResult,
} from '../../../db/queries/mcpTenantDiscoveryQueries.js';
import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import { classifyDiscoveryError } from '../../../lib/discoveryError.js';

export interface VerifyDeps {
  supabase: SupabaseClient;
  orgId: string;
  discover: (transport: McpTransport, allowlist: string[]) => Promise<void>;
}

export interface VerifyArgs {
  agentId: string;
  serverId: string;
  tenantId: string;
  transport: McpTransport;
  variableValues: Record<string, VariableValue>;
  envByName: Record<string, string>;
  envById: Record<string, string>;
}

const VERIFY_CONCURRENCY = 4;
const FIRST_BATCH = 0;

export async function verifyMcpTenantConfig(
  deps: VerifyDeps,
  args: VerifyArgs
): Promise<McpTenantDiscoveryRow> {
  const valuesHash = hashVariableValues(args.variableValues);
  const resolved = buildResolvedVars(args.variableValues, {
    byName: args.envByName,
    byId: args.envById,
  });
  const transport = resolveTransport(args.transport, resolved);
  const row = await runDiscovery(deps, args, transport, valuesHash);
  await upsertDiscoveryResult(deps.supabase, {
    agentId: args.agentId,
    serverId: args.serverId,
    tenantId: args.tenantId,
    status: row.status,
    error: row.error,
    valuesHash,
  });
  return row;
}

async function runDiscovery(
  deps: VerifyDeps,
  args: VerifyArgs,
  transport: McpTransport,
  valuesHash: string
): Promise<McpTenantDiscoveryRow> {
  const baseRow = {
    agent_id: args.agentId,
    server_id: args.serverId,
    tenant_id: args.tenantId,
    values_hash: valuesHash,
    discovered_at: new Date().toISOString(),
  };
  try {
    await deps.discover(transport, []);
    return { ...baseRow, status: 'ok', error: null };
  } catch (err) {
    return { ...baseRow, status: 'error', error: classifyDiscoveryError(err) };
  }
}

export interface VerifyAllArgs {
  server: McpServerConfig;
  tenants: Array<{ tenantId: string; variableValues: Record<string, VariableValue> }>;
  agentId: string;
  envByName: Record<string, string>;
  envById: Record<string, string>;
}

export async function verifyAllForServer(
  deps: VerifyDeps,
  args: VerifyAllArgs
): Promise<McpTenantDiscoveryRow[]> {
  return await verifyBatch(deps, args, FIRST_BATCH, []);
}

// Process tenants in bounded-size batches without an awaited loop (no-await-in-loop).
async function verifyBatch(
  deps: VerifyDeps,
  args: VerifyAllArgs,
  start: number,
  acc: McpTenantDiscoveryRow[]
): Promise<McpTenantDiscoveryRow[]> {
  if (start >= args.tenants.length) return acc;
  const batch = args.tenants.slice(start, start + VERIFY_CONCURRENCY);
  const rows = await Promise.all(batch.map(async (t) => await verifyOneTenant(deps, args, t)));
  return await verifyBatch(deps, args, start + VERIFY_CONCURRENCY, [...acc, ...rows]);
}

async function verifyOneTenant(
  deps: VerifyDeps,
  args: VerifyAllArgs,
  tenant: { tenantId: string; variableValues: Record<string, VariableValue> }
): Promise<McpTenantDiscoveryRow> {
  return await verifyMcpTenantConfig(deps, {
    agentId: args.agentId,
    serverId: args.server.id,
    tenantId: tenant.tenantId,
    transport: args.server.transport,
    variableValues: tenant.variableValues,
    envByName: args.envByName,
    envById: args.envById,
  });
}
