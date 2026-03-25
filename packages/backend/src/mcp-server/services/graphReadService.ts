import type { Edge, Node } from '@daviddh/graph-types';

import { assembleGraph } from '../../db/queries/graphQueries.js';
import type { ServiceContext } from '../types.js';
import {
  SCORE_NO_MATCH,
  bfsSubgraph,
  countByField,
  extractContextFlags,
  filterEdgesForSubgraph,
  requireGraph,
  scoreNode,
  toNodeListItem,
} from './graphReadHelpers.js';
import type { NodeListItem, NodeSearchResult, SubgraphResult } from './graphReadHelpers.js';

/* ------------------------------------------------------------------ */
/*  Re-exports for consumer convenience                               */
/* ------------------------------------------------------------------ */

export type { NodeDetails, NodeListItem, NodeSearchResult, SubgraphResult } from './graphReadHelpers.js';

/* ------------------------------------------------------------------ */
/*  Graph summary types                                               */
/* ------------------------------------------------------------------ */

interface McpServerSummary {
  id: string;
  name: string;
  enabled: boolean;
}

interface OutputSchemaSummary {
  id: string;
  name: string;
}

interface GraphSummary {
  startNode: string;
  agents: string[];
  totalNodes: number;
  totalEdges: number;
  globalNodes: string[];
  fallbackNodes: string[];
  nodeCountByAgent: Record<string, number>;
  nodeCountByKind: Record<string, number>;
  mcpServers: McpServerSummary[];
  outputSchemas: OutputSchemaSummary[];
  contextFlags: string[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/*  Service functions                                                  */
/* ------------------------------------------------------------------ */

export async function getGraphSummary(ctx: ServiceContext, agentId: string): Promise<GraphSummary> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  return {
    startNode: graph.startNode,
    agents: graph.agents.map((a) => a.id),
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    globalNodes: graph.nodes.filter((n) => n.global).map((n) => n.id),
    fallbackNodes: graph.nodes.filter((n) => n.defaultFallback === true).map((n) => n.id),
    nodeCountByAgent: countByField(graph.nodes, 'agent'),
    nodeCountByKind: countByField(graph.nodes, 'kind'),
    mcpServers: (graph.mcpServers ?? []).map((s) => ({ id: s.id, name: s.name, enabled: s.enabled })),
    outputSchemas: (graph.outputSchemas ?? []).map((s) => ({ id: s.id, name: s.name })),
    contextFlags: extractContextFlags(graph.edges),
    warnings: [],
  };
}

export async function getNode(
  ctx: ServiceContext,
  agentId: string,
  nodeId: string
): Promise<{
  node: Node;
  inboundEdgeCount: number;
  outboundEdgeCount: number;
  inboundFrom: string[];
  outboundTo: string[];
}> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (node === undefined) throw new Error(`Node not found: ${nodeId}`);

  const inbound = graph.edges.filter((e) => e.to === nodeId);
  const outbound = graph.edges.filter((e) => e.from === nodeId);

  return {
    node,
    inboundEdgeCount: inbound.length,
    outboundEdgeCount: outbound.length,
    inboundFrom: inbound.map((e) => e.from),
    outboundTo: outbound.map((e) => e.to),
  };
}

export async function getEdgesFrom(ctx: ServiceContext, agentId: string, nodeId: string): Promise<Edge[]> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  return graph.edges.filter((e) => e.from === nodeId);
}

export async function getEdgesTo(ctx: ServiceContext, agentId: string, nodeId: string): Promise<Edge[]> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  return graph.edges.filter((e) => e.to === nodeId);
}

/* ------------------------------------------------------------------ */
/*  listNodes filters                                                  */
/* ------------------------------------------------------------------ */

interface ListNodesFilters {
  agentDomain?: string;
  kind?: string;
  global?: boolean;
}

function applyNodeFilters(nodes: Node[], filters: ListNodesFilters): Node[] {
  return nodes.filter((n) => {
    if (filters.agentDomain !== undefined && n.agent !== filters.agentDomain) return false;
    if (filters.kind !== undefined && n.kind !== filters.kind) return false;
    if (filters.global !== undefined && n.global !== filters.global) return false;
    return true;
  });
}

export async function listNodes(
  ctx: ServiceContext,
  agentId: string,
  filters: ListNodesFilters
): Promise<NodeListItem[]> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  return applyNodeFilters(graph.nodes, filters).map(toNodeListItem);
}

/* ------------------------------------------------------------------ */
/*  searchNodes                                                        */
/* ------------------------------------------------------------------ */

const DEFAULT_SEARCH_LIMIT = 10;
const SLICE_FROM_START = 0;

export async function searchNodes(
  ctx: ServiceContext,
  agentId: string,
  query: string,
  limit = DEFAULT_SEARCH_LIMIT
): Promise<NodeSearchResult[]> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  const scored: NodeSearchResult[] = graph.nodes
    .map((n) => ({ ...toNodeListItem(n), score: scoreNode(n, query) }))
    .filter((n) => n.score > SCORE_NO_MATCH)
    .sort((a, b) => b.score - a.score);

  return scored.slice(SLICE_FROM_START, limit);
}

/* ------------------------------------------------------------------ */
/*  getSubgraph                                                        */
/* ------------------------------------------------------------------ */

const DEFAULT_SUBGRAPH_DEPTH = 1;

export async function getSubgraph(
  ctx: ServiceContext,
  agentId: string,
  nodeId: string,
  depth = DEFAULT_SUBGRAPH_DEPTH
): Promise<SubgraphResult> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  const rootExists = graph.nodes.some((n) => n.id === nodeId);
  if (!rootExists) throw new Error(`Node not found: ${nodeId}`);

  const nodeIds = bfsSubgraph(nodeId, graph.edges, depth);
  const nodes = graph.nodes.filter((n) => nodeIds.has(n.id));
  const edges = filterEdgesForSubgraph(nodeIds, graph.edges);

  return { nodes, edges };
}
