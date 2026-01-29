import type { Node, Edge } from "../schemas/graph.schema";

interface LayoutOptions {
  horizontalSpacing?: number;
  verticalSpacing?: number;
}

/**
 * Layout algorithm based on distance from INITIAL_STEP.
 * X coordinate is proportional to the number of steps from INITIAL_STEP.
 */
export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const {
    horizontalSpacing = 300,
    verticalSpacing = 150,
  } = options;

  // Build outgoing edges map
  const outgoing = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  nodes.forEach((node) => {
    outgoing.set(node.id, []);
  });

  edges.forEach((edge) => {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      outgoing.get(edge.from)?.push(edge.to);
    }
  });

  // BFS from INITIAL_STEP to calculate distances
  const distances = new Map<string, number>();
  const queue: { id: string; distance: number }[] = [];

  // Start from INITIAL_STEP
  const startId = "INITIAL_STEP";
  if (nodeIds.has(startId)) {
    queue.push({ id: startId, distance: 0 });
    distances.set(startId, 0);
  }

  while (queue.length > 0) {
    const { id, distance } = queue.shift()!;

    const children = outgoing.get(id) ?? [];
    children.forEach((childId) => {
      if (!distances.has(childId)) {
        distances.set(childId, distance + 1);
        queue.push({ id: childId, distance: distance + 1 });
      }
    });
  }

  // Handle unreachable nodes (place them at distance 0)
  nodes.forEach((node) => {
    if (!distances.has(node.id)) {
      distances.set(node.id, 0);
    }
  });

  // Group nodes by distance (same x coordinate)
  const distanceGroups = new Map<number, string[]>();
  distances.forEach((distance, nodeId) => {
    if (!distanceGroups.has(distance)) {
      distanceGroups.set(distance, []);
    }
    distanceGroups.get(distance)!.push(nodeId);
  });

  // Calculate positions: x based on distance, y based on index within group
  const positions = new Map<string, { x: number; y: number }>();

  distanceGroups.forEach((nodeIdsInGroup, distance) => {
    const x = distance * horizontalSpacing;
    nodeIdsInGroup.forEach((nodeId, index) => {
      const y = index * verticalSpacing;
      positions.set(nodeId, { x, y });
    });
  });

  // Return nodes with calculated positions
  return nodes.map((node) => {
    const pos = positions.get(node.id) ?? { x: 0, y: 0 };
    return {
      ...node,
      position: pos,
    };
  });
}
