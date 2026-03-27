import type { Edge as SchemaEdge, Node as SchemaNode } from '../schemas/graph.schema';

export interface DebugGraphResult {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
  mutedNodeIds: Set<string>;
  mutedEdgeIds: Set<string>;
  errorNodeIds: Set<string>;
}

function deriveTraversedEdges(visitedNodeIds: string[]): Set<string> {
  const edges = new Set<string>();
  for (let i = 0; i < visitedNodeIds.length - 1; i++) {
    const from = visitedNodeIds[i];
    const to = visitedNodeIds[i + 1];
    if (from !== undefined && to !== undefined) {
      edges.add(`${from}-${to}`);
    }
  }
  return edges;
}

interface MutedCollector {
  mutedNodes: SchemaNode[];
  mutedNodeIds: Set<string>;
}

function processCandidateEdge(
  edge: SchemaEdge,
  visitedSet: Set<string>,
  allNodesMap: Map<string, SchemaNode>,
  collector: MutedCollector
): void {
  if (visitedSet.has(edge.to) || collector.mutedNodeIds.has(edge.to)) return;

  const targetNode = allNodesMap.get(edge.to);
  if (targetNode === undefined) return;

  collector.mutedNodeIds.add(edge.to);
  collector.mutedNodes.push(targetNode);
}

function collectMutedNeighbors(
  visitedSet: Set<string>,
  errorNodeIds: Set<string>,
  allEdges: SchemaEdge[],
  allNodesMap: Map<string, SchemaNode>
): MutedCollector {
  const collector: MutedCollector = { mutedNodes: [], mutedNodeIds: new Set<string>() };

  for (const nodeId of visitedSet) {
    if (errorNodeIds.has(nodeId)) continue;
    const outgoing = allEdges.filter((e) => e.from === nodeId);

    for (const edge of outgoing) {
      processCandidateEdge(edge, visitedSet, allNodesMap, collector);
    }
  }

  return collector;
}

interface KeptEdgesCollector {
  keptEdges: SchemaEdge[];
  mutedEdgeIds: Set<string>;
}

function processKeptEdge(edge: SchemaEdge, mutedNodeIds: Set<string>, collector: KeptEdgesCollector): void {
  const edgeId = `${edge.from}-${edge.to}`;
  const isMuted = mutedNodeIds.has(edge.from) || mutedNodeIds.has(edge.to);

  if (isMuted) {
    collector.mutedEdgeIds.add(edgeId);
  }

  collector.keptEdges.push(edge);
}

function isNonTraversedVisitedEdge(
  edge: SchemaEdge,
  mutedNodeIds: Set<string>,
  traversedEdges: Set<string>
): boolean {
  const bothVisited = !mutedNodeIds.has(edge.from) && !mutedNodeIds.has(edge.to);
  return bothVisited && !traversedEdges.has(`${edge.from}-${edge.to}`);
}

function collectKeptEdges(
  allEdges: SchemaEdge[],
  keptNodeIds: Set<string>,
  mutedNodeIds: Set<string>,
  errorNodeIds: Set<string>,
  traversedEdges: Set<string>
): KeptEdgesCollector {
  const collector: KeptEdgesCollector = { keptEdges: [], mutedEdgeIds: new Set<string>() };

  for (const edge of allEdges) {
    if (errorNodeIds.has(edge.from)) continue;
    if (!keptNodeIds.has(edge.from) || !keptNodeIds.has(edge.to)) continue;
    if (isNonTraversedVisitedEdge(edge, mutedNodeIds, traversedEdges)) continue;

    processKeptEdge(edge, mutedNodeIds, collector);
  }

  return collector;
}

/**
 * Trims a published graph to show only visited nodes and the first nodes
 * of unchosen branches (shown as muted/dimmed).
 */
export function buildDebugGraph(
  allNodes: SchemaNode[],
  allEdges: SchemaEdge[],
  visitedNodeIds: string[],
  errorNodeIds?: Set<string>
): DebugGraphResult {
  const visitedSet = new Set(visitedNodeIds);
  const errors = errorNodeIds ?? new Set<string>();
  const allNodesMap = new Map(allNodes.map((n) => [n.id, n]));

  const traversedEdges = deriveTraversedEdges(visitedNodeIds);
  const visitedNodes = allNodes.filter((n) => visitedSet.has(n.id));
  const { mutedNodes, mutedNodeIds } = collectMutedNeighbors(visitedSet, errors, allEdges, allNodesMap);

  const allKeptNodes = [...visitedNodes, ...mutedNodes];
  const keptNodeIds = new Set(allKeptNodes.map((n) => n.id));

  const { keptEdges, mutedEdgeIds } = collectKeptEdges(allEdges, keptNodeIds, mutedNodeIds, errors, traversedEdges);

  return {
    nodes: allKeptNodes,
    edges: keptEdges,
    mutedNodeIds,
    mutedEdgeIds,
    errorNodeIds: errors,
  };
}
