import type { Edge as SchemaEdge, Node as SchemaNode } from '../schemas/graph.schema';

export interface DebugGraphResult {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
  mutedNodeIds: Set<string>;
  mutedEdgeIds: Set<string>;
}

function collectMutedNeighbors(
  visitedSet: Set<string>,
  allEdges: SchemaEdge[],
  allNodesMap: Map<string, SchemaNode>
): { mutedNodes: SchemaNode[]; mutedNodeIds: Set<string> } {
  const mutedNodeIds = new Set<string>();
  const mutedNodes: SchemaNode[] = [];

  for (const nodeId of visitedSet) {
    const outgoing = allEdges.filter((e) => e.from === nodeId);

    for (const edge of outgoing) {
      if (!visitedSet.has(edge.to) && !mutedNodeIds.has(edge.to)) {
        const targetNode = allNodesMap.get(edge.to);
        if (targetNode !== undefined) {
          mutedNodeIds.add(edge.to);
          mutedNodes.push(targetNode);
        }
      }
    }
  }

  return { mutedNodes, mutedNodeIds };
}

function collectKeptEdges(
  allEdges: SchemaEdge[],
  keptNodeIds: Set<string>,
  mutedNodeIds: Set<string>
): { keptEdges: SchemaEdge[]; mutedEdgeIds: Set<string> } {
  const keptEdges: SchemaEdge[] = [];
  const mutedEdgeIds = new Set<string>();

  for (const edge of allEdges) {
    const fromKept = keptNodeIds.has(edge.from);
    const toKept = keptNodeIds.has(edge.to);

    if (fromKept && toKept) {
      const edgeId = `${edge.from}-${edge.to}`;
      const isMuted = mutedNodeIds.has(edge.from) || mutedNodeIds.has(edge.to);

      if (isMuted) {
        mutedEdgeIds.add(edgeId);
      }

      keptEdges.push(edge);
    }
  }

  return { keptEdges, mutedEdgeIds };
}

/**
 * Trims a published graph to show only visited nodes and the first nodes
 * of unchosen branches (shown as muted/dimmed).
 */
export function buildDebugGraph(
  allNodes: SchemaNode[],
  allEdges: SchemaEdge[],
  visitedNodeIds: string[]
): DebugGraphResult {
  const visitedSet = new Set(visitedNodeIds);
  const allNodesMap = new Map(allNodes.map((n) => [n.id, n]));

  const visitedNodes = allNodes.filter((n) => visitedSet.has(n.id));
  const { mutedNodes, mutedNodeIds } = collectMutedNeighbors(visitedSet, allEdges, allNodesMap);

  const allKeptNodes = [...visitedNodes, ...mutedNodes];
  const keptNodeIds = new Set(allKeptNodes.map((n) => n.id));

  const { keptEdges, mutedEdgeIds } = collectKeptEdges(allEdges, keptNodeIds, mutedNodeIds);

  return {
    nodes: allKeptNodes,
    edges: keptEdges,
    mutedNodeIds,
    mutedEdgeIds,
  };
}
