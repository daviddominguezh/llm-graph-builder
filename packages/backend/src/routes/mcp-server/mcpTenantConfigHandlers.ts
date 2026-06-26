import { VariableValueSchema } from '@daviddh/graph-types';
import type { McpServerConfig } from '@daviddh/graph-types';
import type { Request } from 'express';
import { z } from 'zod';

import { getAgentById } from '../../db/queries/agentQueries.js';
import { assembleMcpServers } from '../../db/queries/graphAssemblers.js';
import { fetchMcpServers } from '../../db/queries/graphFetchers.js';
import {
  type McpTenantConfigRow,
  getTenantConfigs,
  upsertTenantConfigCell,
} from '../../db/queries/mcpTenantConfigQueries.js';
import {
  type McpTenantDiscoveryRow,
  getTenantDiscovery,
  resetDiscovery,
} from '../../db/queries/mcpTenantDiscoveryQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';
import { loadTenantStatusBundle } from './mcpTenantStatusBuilder.js';

const HTTP_CONFLICT = 409;

const CellBodySchema = z.object({
  variableValues: z.record(z.string(), VariableValueSchema),
  expectedUpdatedAt: z.string().nullable(),
});

interface CellParams {
  serverId?: string;
  tenantId?: string;
}

function getCellParams(req: Request): { serverId: string; tenantId: string } | null {
  const { serverId, tenantId }: CellParams = req.params;
  if (typeof serverId !== 'string' || typeof tenantId !== 'string') return null;
  return { serverId, tenantId };
}

interface ConfigBundle {
  configs: McpTenantConfigRow[];
  discovery: McpTenantDiscoveryRow[];
}

export async function handleGetTenantConfig(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  try {
    const [configs, discovery] = await Promise.all([
      getTenantConfigs(supabase, agentId),
      getTenantDiscovery(supabase, agentId),
    ]);
    const bundle: ConfigBundle = { configs, discovery };
    res.status(HTTP_OK).json(bundle);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}

// After a successful cell save the cached discovery for that exact (server, tenant)
// is stale, so reset it to pending. Best-effort: never fail the primary write.
async function resetCellDiscovery(
  supabase: AuthenticatedLocals['supabase'],
  agentId: string,
  cell: { serverId: string; tenantId: string }
): Promise<void> {
  try {
    await resetDiscovery(supabase, { agentId, serverId: cell.serverId, tenantId: cell.tenantId });
  } catch (err) {
    process.stderr.write(`[mcpTenantConfig] reset after save failed: ${extractErrorMessage(err)}\n`);
  }
}

export async function handlePutTenantConfigCell(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const cell = getCellParams(req);
  if (agentId === undefined || cell === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId, serverId and tenantId required' });
    return;
  }
  const parse = CellBodySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: parse.error.message });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  await saveCell({ supabase, agentId, cell, body: parse.data }, res);
}

interface SaveCellArgs {
  supabase: AuthenticatedLocals['supabase'];
  agentId: string;
  cell: { serverId: string; tenantId: string };
  body: z.infer<typeof CellBodySchema>;
}

async function saveCell(args: SaveCellArgs, res: AuthenticatedResponse): Promise<void> {
  try {
    const result = await upsertTenantConfigCell(args.supabase, {
      agentId: args.agentId,
      serverId: args.cell.serverId,
      tenantId: args.cell.tenantId,
      variableValues: args.body.variableValues,
      expectedUpdatedAt: args.body.expectedUpdatedAt,
    });
    if (result.kind === 'conflict') {
      res.status(HTTP_CONFLICT).json({ error: 'conflict' });
      return;
    }
    await resetCellDiscovery(args.supabase, args.agentId, args.cell);
    res.status(HTTP_OK).json({ row: result.row });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}

async function loadAgentServers(
  supabase: AuthenticatedLocals['supabase'],
  agentId: string
): Promise<{ orgId: string; servers: McpServerConfig[] } | null> {
  const { result: agent } = await getAgentById(supabase, agentId);
  if (agent === null) return null;
  const servers = assembleMcpServers(await fetchMcpServers(supabase, agentId)) ?? [];
  return { orgId: agent.org_id, servers };
}

export async function handleGetTenantStatus(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  try {
    const loaded = await loadAgentServers(supabase, agentId);
    if (loaded === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'agent not found' });
      return;
    }
    const bundle = await loadTenantStatusBundle(supabase, agentId, loaded.orgId, loaded.servers);
    res.status(HTTP_OK).json(bundle);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
