import type { RuntimeGraph } from '@daviddh/graph-types';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { getTenantById } from '../../db/queries/tenantQueries.js';
import {
  type TenantConfigSnapshot,
  applyTenantMcpConfig,
  assertTenantInSnapshot,
} from './applyTenantMcpConfig.js';
import type { GraphAndKeys } from './executeFetcher.js';
import { HttpError } from './executeFetcher.js';
import { resolveMcpTransportVariables } from './executeHelpers.js';

const HTTP_UNPROCESSABLE = 422;

export interface TenantGraphArgs {
  supabase: SupabaseClient;
  graph: RuntimeGraph;
  snapshot: TenantConfigSnapshot[];
  tenantId: string;
  orgId: string;
}

async function validateRunTenant(supabase: SupabaseClient, tenantId: string, orgId: string): Promise<void> {
  const { result, error } = await getTenantById(supabase, tenantId);
  if (error !== null) {
    throw new HttpError(HTTP_UNPROCESSABLE, `Failed to validate tenant "${tenantId}": ${error}`);
  }
  if (result?.org_id !== orgId) {
    throw new HttpError(HTTP_UNPROCESSABLE, `Unknown tenant "${tenantId}" for this organization`);
  }
}

// Validate the run tenant is real for the org, then swap in its published per-tenant MCP
// values. Fails fast (republish-required) when servers exist but the snapshot lacks the tenant.
export async function resolveTenantGraph(args: TenantGraphArgs): Promise<RuntimeGraph> {
  await validateRunTenant(args.supabase, args.tenantId, args.orgId);
  assertTenantInSnapshot({
    snapshot: args.snapshot,
    tenantId: args.tenantId,
    mcpServers: args.graph.mcpServers,
  });
  return applyTenantMcpConfig(args.graph, args.snapshot, args.tenantId);
}

export interface TenantEnvGraphArgs {
  supabase: SupabaseClient;
  graphAndKeys: GraphAndKeys;
  tenantId: string;
  orgId: string;
}

// Chokepoint for BOTH app types: per-tenant snapshot application (with tenant validation)
// followed by env-variable substitution, yielding the env-resolved runtime graph.
export async function resolveTenantAndEnvGraph(args: TenantEnvGraphArgs): Promise<RuntimeGraph> {
  const { graphAndKeys } = args;
  const tenantGraph = await resolveTenantGraph({
    supabase: args.supabase,
    graph: graphAndKeys.graph,
    snapshot: graphAndKeys.mcpTenantConfig,
    tenantId: args.tenantId,
    orgId: args.orgId,
  });
  return resolveMcpTransportVariables(tenantGraph, graphAndKeys.envVars.byName, graphAndKeys.envVars.byId);
}
