import type { Edge, Graph, Node } from '@daviddh/graph-types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface NodeListItem {
  id: string;
  text: string;
  kind: string;
  agent: string | undefined;
  global: boolean;
  nextNodeIsUser: boolean | undefined;
  hasOutputSchema: boolean;
  fallbackNodeId: string | undefined;
}

export interface NodeSearchResult extends NodeListItem {
  score: number;
}

export interface NodeDetails {
  node: Node;
  inboundEdgeCount: number;
  outboundEdgeCount: number;
  inboundFrom: string[];
  outboundTo: string[];
}

export interface SubgraphResult {
  nodes: Node[];
  edges: Edge[];
}

/* ------------------------------------------------------------------ */
/*  Graph loading helper                                               */
/* ------------------------------------------------------------------ */

export function requireGraph(graph: Graph | null, agentId: string): Graph {
  if (graph === null) throw new Error(`Graph not found: ${agentId}`);
  return graph;
}

/* ------------------------------------------------------------------ */
/*  countByField                                                       */
/* ------------------------------------------------------------------ */

const INITIAL_COUNT = 0;
const INCREMENT = 1;

export function countByField(nodes: Node[], field: 'agent' | 'kind'): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    const key = String(node[field]);
    counts[key] = (counts[key] ?? INITIAL_COUNT) + INCREMENT;
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/*  extractContextFlags                                                */
/* ------------------------------------------------------------------ */

export function extractContextFlags(edges: Edge[]): string[] {
  const flags = new Set<string>();
  for (const edge of edges) {
    const preconditions = edge.contextPreconditions?.preconditions ?? [];
    for (const flag of preconditions) {
      flags.add(flag);
    }
  }
  return Array.from(flags);
}

/* ------------------------------------------------------------------ */
/*  toNodeListItem                                                     */
/* ------------------------------------------------------------------ */

const TEXT_TRUNCATE_LENGTH = 80;
const SLICE_START = 0;

export function toNodeListItem(node: Node): NodeListItem {
  return {
    id: node.id,
    text: node.text.slice(SLICE_START, TEXT_TRUNCATE_LENGTH),
    kind: node.kind,
    agent: node.agent,
    global: node.global,
    nextNodeIsUser: node.nextNodeIsUser,
    hasOutputSchema: node.outputSchemaId !== undefined,
    fallbackNodeId: node.fallbackNodeId,
  };
}

/* ------------------------------------------------------------------ */
/*  scoreNode                                                          */
/* ------------------------------------------------------------------ */

export const SCORE_EXACT_ID = 100;
export const SCORE_CONTAINS_ID = 50;
export const SCORE_CONTAINS_TEXT = 25;
export const SCORE_CONTAINS_DESCRIPTION = 10;
export const SCORE_NO_MATCH = 0;

export function scoreNode(node: Node, query: string): number {
  const lower = query.toLowerCase();
  if (node.id.toLowerCase() === lower) return SCORE_EXACT_ID;
  if (node.id.toLowerCase().includes(lower)) return SCORE_CONTAINS_ID;
  if (node.text.toLowerCase().includes(lower)) return SCORE_CONTAINS_TEXT;
  if (node.description.toLowerCase().includes(lower)) return SCORE_CONTAINS_DESCRIPTION;
  return SCORE_NO_MATCH;
}

/* ------------------------------------------------------------------ */
/*  BFS for subgraph                                                   */
/* ------------------------------------------------------------------ */

function collectAdjacentUnvisited(nodeId: string, edges: Edge[], visited: Set<string>): string[] {
  const result: string[] = [];
  for (const edge of edges) {
    if (edge.from === nodeId && !visited.has(edge.to)) result.push(edge.to);
    if (edge.to === nodeId && !visited.has(edge.from)) result.push(edge.from);
  }
  return result;
}

function expandFrontier(frontier: Set<string>, allEdges: Edge[], visited: Set<string>): Set<string> {
  const next = new Set<string>();
  for (const nodeId of frontier) {
    for (const adjacentId of collectAdjacentUnvisited(nodeId, allEdges, visited)) {
      next.add(adjacentId);
      visited.add(adjacentId);
    }
  }
  return next;
}

export function bfsSubgraph(startId: string, allEdges: Edge[], depth: number): Set<string> {
  const visited = new Set<string>([startId]);
  let frontier = new Set<string>([startId]);

  for (let i = INCREMENT; i <= depth; i += INCREMENT) {
    frontier = expandFrontier(frontier, allEdges, visited);
  }

  return visited;
}

export function filterEdgesForSubgraph(nodeIds: Set<string>, edges: Edge[]): Edge[] {
  return edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
}
