import {
  type McpTransport,
  type Operation,
  type VariableValue,
  VariableValueSchema,
} from '@daviddh/graph-types';
import { z } from 'zod';

import { staleDiscoveryAfterServerEdit } from '../../routes/mcp-server/mcpDiscoveryInvalidation.js';
import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type InsertMcpOp = Extract<Operation, { type: 'insertMcpServer' }>;
type UpdateMcpOp = Extract<Operation, { type: 'updateMcpServer' }>;

interface McpServerInsertRow {
  agent_id: string;
  server_id: string;
  name: string;
  transport_type: string;
  transport_config: Record<string, unknown>;
  enabled: boolean | undefined;
  library_item_id: string | undefined;
  variable_values: Record<string, unknown> | undefined;
}

function extractTransportConfig(transport: McpTransport): Record<string, unknown> {
  const { type: _type, ...config } = transport;
  return config;
}

function buildMcpServerRow(agentId: string, data: InsertMcpOp['data']): McpServerInsertRow {
  return {
    agent_id: agentId,
    server_id: data.serverId,
    name: data.name,
    transport_type: data.transport.type,
    transport_config: extractTransportConfig(data.transport),
    enabled: data.enabled,
    library_item_id: data.libraryItemId,
    variable_values: data.variableValues,
  };
}

export async function insertMcpServer(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertMcpOp['data']
): Promise<void> {
  const row = buildMcpServerRow(agentId, data);
  const result = await supabase.from('graph_mcp_servers').upsert(row, { onConflict: 'agent_id,server_id' });
  throwOnMutationError(result, 'insertMcpServer');
}

export async function updateMcpServer(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateMcpOp['data']
): Promise<void> {
  const row = buildMcpServerRow(agentId, data);
  const result = await supabase
    .from('graph_mcp_servers')
    .update(row)
    .eq('agent_id', agentId)
    .eq('server_id', data.serverId);
  throwOnMutationError(result, 'updateMcpServer');
  // A transport/definition edit changes the discovery surface for all tenants.
  await staleDiscoveryAfterServerEdit(supabase, agentId, data.serverId);
}

const StoredVariableValuesSchema = z.record(z.string(), VariableValueSchema);

function readJsonField(data: unknown, key: string): unknown {
  if (typeof data !== 'object' || data === null || !(key in data)) return undefined;
  return Object.getOwnPropertyDescriptor(data, key)?.value;
}

function readStringField(data: unknown, key: string): string | undefined {
  const value = readJsonField(data, key);
  return typeof value === 'string' ? value : undefined;
}

function parseStoredVariableValues(raw: unknown): Record<string, VariableValue> | undefined {
  const result = StoredVariableValuesSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

export interface McpServerBinding {
  serverId: string;
  variableValues: Record<string, VariableValue> | undefined;
}

/**
 * Load the stored per-installation binding for an MCP library item on an agent:
 * the base `server_id` and its `variable_values`. The FE cannot decrypt secret
 * `env_ref` values, so the authoritative binding (with the real refs) must be
 * read server-side. Returns undefined when no binding row exists.
 */
export async function getMcpServerBinding(
  supabase: SupabaseClient,
  agentId: string,
  libraryItemId: string
): Promise<McpServerBinding | undefined> {
  const result = await supabase
    .from('graph_mcp_servers')
    .select('server_id, variable_values')
    .eq('agent_id', agentId)
    .eq('library_item_id', libraryItemId)
    .maybeSingle();
  if (result.error !== null || result.data === null) return undefined;
  const serverId = readStringField(result.data, 'server_id');
  if (serverId === undefined) return undefined;
  return { serverId, variableValues: parseStoredVariableValues(readJsonField(result.data, 'variable_values')) };
}

export async function deleteMcpServer(
  supabase: SupabaseClient,
  agentId: string,
  serverId: string
): Promise<void> {
  const result = await supabase
    .from('graph_mcp_servers')
    .delete()
    .eq('agent_id', agentId)
    .eq('server_id', serverId);
  throwOnMutationError(result, 'deleteMcpServer');
}
