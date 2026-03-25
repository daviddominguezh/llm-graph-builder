import type { Graph, McpServerConfig, McpTransport } from '@daviddh/graph-types';
import { randomUUID } from 'node:crypto';

import { assembleGraph } from '../../db/queries/graphQueries.js';
import * as mcpLibraryQueries from '../../db/queries/mcpLibraryQueries.js';
import { executeOperationsBatch } from '../../db/queries/operationExecutor.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface McpServerSummary {
  id: string;
  name: string;
  enabled: boolean;
  transportType: string;
  libraryItemId: string | undefined;
  variableCount: number;
}

export interface AddMcpServerInput {
  name: string;
  transport: McpTransport;
  enabled?: boolean;
  libraryItemId?: string;
  variableValues?: McpServerConfig['variableValues'];
}

export interface UpdateMcpServerFields {
  name?: string;
  transport?: McpTransport;
  enabled?: boolean;
  variableValues?: McpServerConfig['variableValues'];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function requireGraph(graph: Graph | null, agentId: string): Graph {
  if (graph === null) throw new Error(`Graph not found for agent: ${agentId}`);
  return graph;
}

function requireServer(graph: Graph, serverId: string): McpServerConfig {
  const server = (graph.mcpServers ?? []).find((s) => s.id === serverId);
  if (server === undefined) throw new Error(`MCP server not found: ${serverId}`);
  return server;
}

function toSummary(server: McpServerConfig): McpServerSummary {
  return {
    id: server.id,
    name: server.name,
    enabled: server.enabled,
    transportType: server.transport.type,
    libraryItemId: server.libraryItemId,
    variableCount: Object.keys(server.variableValues ?? {}).length,
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function toSafeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildStdioTransport(cfg: Record<string, unknown>): McpTransport {
  return {
    type: 'stdio',
    command: toSafeString(cfg.command),
    args: isStringArray(cfg.args) ? cfg.args : undefined,
    env: isStringRecord(cfg.env) ? cfg.env : undefined,
  };
}

function buildUrlTransport(type: 'sse' | 'http', cfg: Record<string, unknown>): McpTransport {
  return {
    type,
    url: toSafeString(cfg.url),
    headers: isStringRecord(cfg.headers) ? cfg.headers : undefined,
  };
}

function buildTransportFromLibrary(
  transportType: string,
  transportConfig: Record<string, unknown>
): McpTransport {
  if (transportType === 'stdio') return buildStdioTransport(transportConfig);
  if (transportType === 'sse') return buildUrlTransport('sse', transportConfig);
  return buildUrlTransport('http', transportConfig);
}

/* ------------------------------------------------------------------ */
/*  Service functions                                                  */
/* ------------------------------------------------------------------ */

export async function listMcpServers(ctx: ServiceContext, agentId: string): Promise<McpServerSummary[]> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  return (graph.mcpServers ?? []).map(toSummary);
}

export async function getMcpServer(
  ctx: ServiceContext,
  agentId: string,
  serverId: string
): Promise<McpServerConfig> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  return requireServer(graph, serverId);
}

export async function addMcpServer(
  ctx: ServiceContext,
  agentId: string,
  server: AddMcpServerInput
): Promise<{ serverId: string }> {
  const serverId = randomUUID();
  await executeOperationsBatch(ctx.supabase, agentId, [
    {
      type: 'insertMcpServer',
      data: {
        serverId,
        name: server.name,
        transport: server.transport,
        enabled: server.enabled ?? true,
        libraryItemId: server.libraryItemId,
        variableValues: server.variableValues,
      },
    },
  ]);
  return { serverId };
}

export async function updateMcpServer(
  ctx: ServiceContext,
  agentId: string,
  serverId: string,
  fields: UpdateMcpServerFields
): Promise<void> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  const existing = requireServer(graph, serverId);

  await executeOperationsBatch(ctx.supabase, agentId, [
    {
      type: 'updateMcpServer',
      data: {
        serverId,
        name: fields.name ?? existing.name,
        transport: fields.transport ?? existing.transport,
        enabled: fields.enabled ?? existing.enabled,
        variableValues: fields.variableValues ?? existing.variableValues,
      },
    },
  ]);
}

export async function removeMcpServer(ctx: ServiceContext, agentId: string, serverId: string): Promise<void> {
  await executeOperationsBatch(ctx.supabase, agentId, [{ type: 'deleteMcpServer', serverId }]);
}

export async function installFromLibrary(
  ctx: ServiceContext,
  agentId: string,
  libraryItemId: string,
  variableValues?: McpServerConfig['variableValues']
): Promise<{ serverId: string }> {
  const { result: item, error } = await mcpLibraryQueries.getLibraryItemById(ctx.supabase, libraryItemId);

  if (error !== null || item === null) {
    throw new Error(`Library item not found: ${libraryItemId}`);
  }

  const transport = buildTransportFromLibrary(item.transport_type, item.transport_config);
  const serverId = randomUUID();

  await executeOperationsBatch(ctx.supabase, agentId, [
    {
      type: 'insertMcpServer',
      data: {
        serverId,
        name: item.name,
        transport,
        enabled: true,
        libraryItemId,
        variableValues,
      },
    },
  ]);

  await mcpLibraryQueries.incrementInstallations(ctx.supabase, libraryItemId);

  return { serverId };
}
