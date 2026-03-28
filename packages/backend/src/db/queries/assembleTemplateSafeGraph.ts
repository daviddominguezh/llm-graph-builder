import type { TemplateGraphData, TemplateMcpServer } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';

// ---------------------------------------------------------------------------
// Raw JSONB shape from agent_versions.graph_data
// These interfaces cover ONLY the fields we read; secrets are never touched.
// ---------------------------------------------------------------------------

interface RawPosition {
  x: number;
  y: number;
}

interface RawNode {
  id: string;
  text: string;
  kind: string;
  description?: string;
  agent?: string;
  nextNodeIsUser?: boolean;
  fallbackNodeId?: string;
  global?: boolean;
  defaultFallback?: boolean;
  position?: RawPosition;
  outputSchemaId?: string;
  outputPrompt?: string;
}

interface RawPrecondition {
  type: string;
  value: string;
  description?: string;
  toolFields?: Record<string, unknown>;
}

interface RawContextPreconditions {
  preconditions: string[];
  jumpTo?: string;
}

interface RawEdge {
  from: string;
  to: string;
  preconditions?: RawPrecondition[];
  contextPreconditions?: RawContextPreconditions;
}

interface RawAgent {
  id: string;
  description?: string;
}

interface RawTransport {
  type: string;
  url?: string;
  headers?: Record<string, string>;
}

interface RawMcpServer {
  id: string;
  name: string;
  transport: RawTransport;
  enabled: boolean;
  libraryItemId?: string;
  // variableValues intentionally omitted — NEVER read
}

interface RawOutputField {
  name: string;
  type: string;
  description?: string;
}

interface RawOutputSchema {
  id: string;
  name: string;
  fields: RawOutputField[];
}

interface RawGraphData {
  startNode: string;
  nodes: RawNode[];
  edges: RawEdge[];
  agents: RawAgent[];
  mcpServers?: RawMcpServer[];
  outputSchemas?: RawOutputSchema[];
}

// ---------------------------------------------------------------------------
// Pure helpers (each <=40 lines, depth <=2)
// ---------------------------------------------------------------------------

function stripPrecondition(raw: RawPrecondition): { type: string; value: string; description?: string } {
  return {
    type: raw.type,
    value: raw.value,
    description: raw.description,
  };
}

function stripEdge(raw: RawEdge): TemplateGraphData['edges'][number] {
  return {
    from: raw.from,
    to: raw.to,
    preconditions: raw.preconditions?.map(stripPrecondition),
    contextPreconditions: raw.contextPreconditions,
  };
}

function stripNode(raw: RawNode): TemplateGraphData['nodes'][number] {
  return {
    id: raw.id,
    text: raw.text,
    kind: raw.kind,
    description: raw.description ?? '',
    agent: raw.agent,
    nextNodeIsUser: raw.nextNodeIsUser,
    fallbackNodeId: raw.fallbackNodeId,
    global: raw.global ?? false,
    defaultFallback: raw.defaultFallback,
    position: raw.position,
    outputSchemaId: raw.outputSchemaId,
    outputPrompt: raw.outputPrompt,
  };
}

function buildLibraryRef(libraryItemId: string, name: string): TemplateMcpServer {
  return { type: 'library' as const, libraryItemId, name };
}

function extractHeaderKeys(transport: RawTransport): string[] {
  const { headers } = transport;
  return headers === undefined ? [] : Object.keys(headers);
}

function buildCustomSkeleton(server: RawMcpServer): TemplateMcpServer {
  return {
    type: 'custom' as const,
    name: server.name,
    transportType: server.transport.type,
    url: server.transport.url,
    headerKeys: extractHeaderKeys(server.transport),
  };
}

function toTemplateMcpServer(server: RawMcpServer): TemplateMcpServer {
  if (server.libraryItemId !== undefined) return buildLibraryRef(server.libraryItemId, server.name);
  return buildCustomSkeleton(server);
}

function stripMcpServers(servers: RawMcpServer[] | undefined): TemplateMcpServer[] {
  if (servers === undefined) return [];
  return servers.map(toTemplateMcpServer);
}

function stripOutputSchemas(schemas: RawOutputSchema[] | undefined): TemplateGraphData['outputSchemas'] {
  if (schemas === undefined) return undefined;
  return schemas.map((s) => ({ id: s.id, name: s.name, fields: s.fields }));
}

// ---------------------------------------------------------------------------
// Public: pure transformation (no DB access)
// ---------------------------------------------------------------------------

export function assembleFromGraphData(raw: RawGraphData): TemplateGraphData {
  return {
    startNode: raw.startNode,
    nodes: raw.nodes.map(stripNode),
    edges: raw.edges.map(stripEdge),
    agents: raw.agents.map((a) => ({ id: a.id, description: a.description ?? '' })),
    mcpServers: stripMcpServers(raw.mcpServers),
    outputSchemas: stripOutputSchemas(raw.outputSchemas),
  };
}

// ---------------------------------------------------------------------------
// Public: DB-backed entry point
// ---------------------------------------------------------------------------

export async function assembleTemplateSafeGraph(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<TemplateGraphData | null> {
  const result = await supabase
    .from('agent_versions')
    .select('graph_data')
    .eq('agent_id', agentId)
    .eq('version', version)
    .single();

  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return null;
    throw new Error(`assembleTemplateSafeGraph: ${result.error.message}`);
  }

  const row = result.data as { graph_data: RawGraphData };
  return assembleFromGraphData(row.graph_data);
}
