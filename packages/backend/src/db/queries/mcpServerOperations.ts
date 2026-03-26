import type { McpTransport, Operation } from '@daviddh/graph-types';

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
