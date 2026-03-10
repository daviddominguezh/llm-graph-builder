import type { Edge, Graph, McpServerConfig, Node } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

const EMPTY_LENGTH = 0;

/** Delete all staging rows for a single table. */
async function deleteFromTable(supabase: SupabaseClient, table: string, agentId: string): Promise<void> {
  const result = await supabase.from(table).delete().eq('agent_id', agentId);
  throwOnMutationError(result, `clearStaging:${table}`);
}

/** Delete independent staging tables (no FK ordering). */
async function clearIndependentTables(supabase: SupabaseClient, agentId: string): Promise<void> {
  await Promise.all([
    deleteFromTable(supabase, 'graph_context_presets', agentId),
    deleteFromTable(supabase, 'graph_mcp_servers', agentId),
    deleteFromTable(supabase, 'graph_agents', agentId),
  ]);
}

export async function clearStagingData(supabase: SupabaseClient, agentId: string): Promise<void> {
  await clearIndependentTables(supabase, agentId);
  await deleteFromTable(supabase, 'graph_edges', agentId);
  await deleteFromTable(supabase, 'graph_nodes', agentId);
}

interface NodeInsertRow {
  agent_id: string;
  node_id: string;
  text: string;
  kind: string;
  description: string;
  agent: string | undefined;
  next_node_is_user: boolean | undefined;
  fallback_node_id: string | undefined;
  global: boolean;
  default_fallback: boolean | undefined;
  position_x: number | undefined;
  position_y: number | undefined;
}

function buildNodeRow(agentId: string, node: Node): NodeInsertRow {
  return {
    agent_id: agentId,
    node_id: node.id,
    text: node.text,
    kind: node.kind,
    description: node.description,
    agent: node.agent,
    next_node_is_user: node.nextNodeIsUser,
    fallback_node_id: node.fallbackNodeId,
    global: node.global,
    default_fallback: node.defaultFallback,
    position_x: node.position?.x,
    position_y: node.position?.y,
  };
}

export async function hydrateNodes(supabase: SupabaseClient, agentId: string, nodes: Node[]): Promise<void> {
  if (nodes.length === EMPTY_LENGTH) return;

  const rows = nodes.map((n) => buildNodeRow(agentId, n));
  const result = await supabase.from('graph_nodes').insert(rows);
  throwOnMutationError(result, 'hydrateNodes');
}

interface EdgeInsertedRow {
  id: string;
  from_node: string;
  to_node: string;
}

interface EdgeIdMap {
  from: string;
  to: string;
  dbId: string;
}

async function insertEdgeRows(
  supabase: SupabaseClient,
  agentId: string,
  edges: Edge[]
): Promise<EdgeIdMap[]> {
  if (edges.length === EMPTY_LENGTH) return [];

  const rows = edges.map((e) => ({ agent_id: agentId, from_node: e.from, to_node: e.to }));
  const result = await supabase.from('graph_edges').insert(rows).select('id, from_node, to_node');

  if (result.error !== null) {
    throw new Error(`insertEdgeRows: ${result.error.message}`);
  }

  const inserted: EdgeInsertedRow[] = result.data;

  return inserted.map((r) => ({
    from: r.from_node,
    to: r.to_node,
    dbId: r.id,
  }));
}

function findEdgeDbId(idMaps: EdgeIdMap[], from: string, to: string): string {
  const match = idMaps.find((m) => m.from === from && m.to === to);

  if (match === undefined) {
    throw new Error(`Edge not found: ${from} -> ${to}`);
  }

  return match.dbId;
}

interface PreconditionInsertRow {
  edge_id: string;
  type: string;
  value: string;
  description: string | undefined;
  tool_fields: Record<string, unknown> | undefined;
}

interface ContextPreconditionInsertRow {
  edge_id: string;
  preconditions: string[];
  jump_to: string | undefined;
}

function buildPreconditionRows(edges: Edge[], idMaps: EdgeIdMap[]): PreconditionInsertRow[] {
  const rows: PreconditionInsertRow[] = [];

  for (const edge of edges) {
    if (edge.preconditions === undefined) continue;
    const edgeId = findEdgeDbId(idMaps, edge.from, edge.to);

    for (const p of edge.preconditions) {
      rows.push({
        edge_id: edgeId,
        type: p.type,
        value: p.value,
        description: p.description,
        tool_fields: p.toolFields,
      });
    }
  }

  return rows;
}

function buildContextPreconditionRows(edges: Edge[], idMaps: EdgeIdMap[]): ContextPreconditionInsertRow[] {
  const rows: ContextPreconditionInsertRow[] = [];

  for (const edge of edges) {
    if (edge.contextPreconditions === undefined) continue;
    const edgeId = findEdgeDbId(idMaps, edge.from, edge.to);

    rows.push({
      edge_id: edgeId,
      preconditions: edge.contextPreconditions.preconditions,
      jump_to: edge.contextPreconditions.jumpTo,
    });
  }

  return rows;
}

async function insertPreconditionRows(
  supabase: SupabaseClient,
  rows: PreconditionInsertRow[]
): Promise<void> {
  if (rows.length === EMPTY_LENGTH) return;
  const result = await supabase.from('graph_edge_preconditions').insert(rows);
  throwOnMutationError(result, 'hydratePreconditions');
}

async function insertContextPreconditionRows(
  supabase: SupabaseClient,
  rows: ContextPreconditionInsertRow[]
): Promise<void> {
  if (rows.length === EMPTY_LENGTH) return;
  const result = await supabase.from('graph_edge_context_preconditions').insert(rows);
  throwOnMutationError(result, 'hydrateContextPreconditions');
}

export async function hydrateEdges(supabase: SupabaseClient, agentId: string, edges: Edge[]): Promise<void> {
  const idMaps = await insertEdgeRows(supabase, agentId, edges);
  const preRows = buildPreconditionRows(edges, idMaps);
  const ctxRows = buildContextPreconditionRows(edges, idMaps);

  await Promise.all([
    insertPreconditionRows(supabase, preRows),
    insertContextPreconditionRows(supabase, ctxRows),
  ]);
}

export async function hydrateAgents(
  supabase: SupabaseClient,
  agentId: string,
  agents: Graph['agents']
): Promise<void> {
  if (agents.length === EMPTY_LENGTH) return;

  const rows = agents.map((a) => ({ agent_id: agentId, agent_key: a.id, description: a.description }));
  const result = await supabase.from('graph_agents').insert(rows);
  throwOnMutationError(result, 'hydrateAgents');
}

function extractTransportConfig(transport: McpServerConfig['transport']): Record<string, unknown> {
  const { type: _type, ...config } = transport;
  return config;
}

export async function hydrateMcpServers(
  supabase: SupabaseClient,
  agentId: string,
  servers: McpServerConfig[] | undefined
): Promise<void> {
  if (servers === undefined || servers.length === EMPTY_LENGTH) return;

  const rows = servers.map((s) => ({
    agent_id: agentId,
    server_id: s.id,
    name: s.name,
    transport_type: s.transport.type,
    transport_config: extractTransportConfig(s.transport),
    enabled: s.enabled,
  }));

  const result = await supabase.from('graph_mcp_servers').insert(rows);
  throwOnMutationError(result, 'hydrateMcpServers');
}
