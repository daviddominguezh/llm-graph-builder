import type { TemplateGraphData, TemplateMcpServer } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Node helpers                                                       */
/* ------------------------------------------------------------------ */

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
  output_schema_id: string | undefined;
  output_prompt: string | undefined;
}

function buildNodeRow(agentId: string, node: TemplateGraphData['nodes'][number]): NodeInsertRow {
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
    output_schema_id: node.outputSchemaId,
    output_prompt: node.outputPrompt,
  };
}

/* ------------------------------------------------------------------ */
/*  Edge helpers                                                       */
/* ------------------------------------------------------------------ */

interface RpcPrecondition {
  type: string;
  value: string;
  description: string;
}

interface RpcContextPreconditions {
  preconditions: string[];
  jumpTo: string | undefined;
}

function buildEdgePreconditions(edge: TemplateGraphData['edges'][number]): RpcPrecondition[] {
  if (edge.preconditions === undefined) return [];
  return edge.preconditions.map((p) => ({
    type: p.type,
    value: p.value,
    description: p.description ?? '',
  }));
}

function buildEdgeContextPreconditions(
  edge: TemplateGraphData['edges'][number]
): RpcContextPreconditions | null {
  if (edge.contextPreconditions === undefined) return null;
  return {
    preconditions: edge.contextPreconditions.preconditions,
    jumpTo: edge.contextPreconditions.jumpTo,
  };
}

/* ------------------------------------------------------------------ */
/*  MCP server helpers                                                 */
/* ------------------------------------------------------------------ */

interface McpServerRow {
  agent_id: string;
  server_id: string;
  name: string;
  transport_type: string;
  transport_config: Record<string, unknown>;
  enabled: boolean;
  library_item_id: string | null;
  variable_values: null;
}

const PLACEHOLDER_URL = 'https://configure-me.example.com';

function buildLibraryMcpRow(agentId: string, index: number, server: TemplateMcpServer): McpServerRow {
  return {
    agent_id: agentId,
    server_id: `mcp-${String(index)}`,
    name: server.name,
    transport_type: 'http',
    transport_config: { url: PLACEHOLDER_URL },
    enabled: false,
    library_item_id: server.type === 'library' ? server.libraryItemId : null,
    variable_values: null,
  };
}

function buildCustomMcpRow(agentId: string, index: number, server: TemplateMcpServer): McpServerRow {
  const transportType = server.type === 'custom' ? server.transportType : 'http';
  const needsUrl = transportType === 'http' || transportType === 'sse';
  return {
    agent_id: agentId,
    server_id: `mcp-${String(index)}`,
    name: server.name,
    transport_type: transportType,
    transport_config: needsUrl ? { url: PLACEHOLDER_URL } : {},
    enabled: false,
    library_item_id: null,
    variable_values: null,
  };
}

function buildMcpServerRow(agentId: string, index: number, server: TemplateMcpServer): McpServerRow {
  if (server.type === 'library') return buildLibraryMcpRow(agentId, index, server);
  return buildCustomMcpRow(agentId, index, server);
}

/* ------------------------------------------------------------------ */
/*  Output schema helpers                                              */
/* ------------------------------------------------------------------ */

interface OutputSchemaRow {
  agent_id: string;
  schema_id: string;
  name: string;
  fields: unknown;
}

function buildOutputSchemaRow(
  agentId: string,
  schema: NonNullable<TemplateGraphData['outputSchemas']>[number]
): OutputSchemaRow {
  return {
    agent_id: agentId,
    schema_id: schema.id,
    name: schema.name,
    fields: schema.fields,
  };
}

const EMPTY_LENGTH = 0;

/* ------------------------------------------------------------------ */
/*  Insert operations                                                  */
/* ------------------------------------------------------------------ */

async function insertStartNode(supabase: SupabaseClient, agentId: string, startNode: string): Promise<void> {
  const result = await supabase.from('agents').update({ start_node: startNode }).eq('id', agentId);
  throwOnMutationError(result, 'cloneTemplateGraph:startNode');
}

async function insertNodes(
  supabase: SupabaseClient,
  agentId: string,
  nodes: TemplateGraphData['nodes']
): Promise<void> {
  const rows = nodes.map((n) => buildNodeRow(agentId, n));
  const result = await supabase.from('graph_nodes').insert(rows);
  throwOnMutationError(result, 'cloneTemplateGraph:nodes');
}

async function insertSingleEdge(
  supabase: SupabaseClient,
  agentId: string,
  edge: TemplateGraphData['edges'][number]
): Promise<void> {
  const result = await supabase.rpc('upsert_edge_tx', {
    p_agent_id: agentId,
    p_from_node: edge.from,
    p_to_node: edge.to,
    p_preconditions: buildEdgePreconditions(edge),
    p_context_preconditions: buildEdgeContextPreconditions(edge),
  });

  if (result.error !== null) {
    throw new Error(`cloneTemplateGraph:edge: ${result.error.message}`);
  }
}

async function insertEdges(
  supabase: SupabaseClient,
  agentId: string,
  edges: TemplateGraphData['edges']
): Promise<void> {
  await Promise.all(
    edges.map(async (edge) => {
      await insertSingleEdge(supabase, agentId, edge);
    })
  );
}

async function insertAgents(
  supabase: SupabaseClient,
  agentId: string,
  agents: TemplateGraphData['agents']
): Promise<void> {
  const rows = agents.map((a) => ({
    agent_id: agentId,
    agent_key: a.id,
    description: a.description,
  }));
  const result = await supabase.from('graph_agents').insert(rows);
  throwOnMutationError(result, 'cloneTemplateGraph:agents');
}

async function insertMcpServers(
  supabase: SupabaseClient,
  agentId: string,
  servers: TemplateMcpServer[]
): Promise<void> {
  if (servers.length === EMPTY_LENGTH) return;
  const rows = servers.map((s, i) => buildMcpServerRow(agentId, i, s));
  const result = await supabase.from('graph_mcp_servers').insert(rows);
  throwOnMutationError(result, 'cloneTemplateGraph:mcpServers');
}

async function insertOutputSchemas(
  supabase: SupabaseClient,
  agentId: string,
  schemas: TemplateGraphData['outputSchemas']
): Promise<void> {
  if (schemas === undefined || schemas.length === EMPTY_LENGTH) return;
  const rows = schemas.map((s) => buildOutputSchemaRow(agentId, s));
  const result = await supabase.from('graph_output_schemas').insert(rows);
  throwOnMutationError(result, 'cloneTemplateGraph:outputSchemas');
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export async function cloneTemplateGraph(
  supabase: SupabaseClient,
  agentId: string,
  graphData: TemplateGraphData
): Promise<void> {
  await insertStartNode(supabase, agentId, graphData.startNode);
  await insertNodes(supabase, agentId, graphData.nodes);
  await insertEdges(supabase, agentId, graphData.edges);
  await insertAgents(supabase, agentId, graphData.agents);
  await insertMcpServers(supabase, agentId, graphData.mcpServers);
  await insertOutputSchemas(supabase, agentId, graphData.outputSchemas);
}
