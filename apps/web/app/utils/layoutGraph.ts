import type { Node, Edge } from "../schemas/graph.schema";

interface LayoutOptions {
  horizontalSpacing?: number;
  verticalSpacing?: number;
  nodeHeight?: number;
}

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Layout algorithm with tree-like Y positioning:
 * - X coordinate: BFS distance from INITIAL_STEP (depth)
 * - Y coordinate: children centered under parent, calculated level by level
 * - Only returns edges that flow left-to-right (level N to level N+1)
 */
export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): LayoutResult {
  console.log("[layoutGraph] Starting layout with", nodes.length, "nodes and", edges.length, "edges");

  const {
    horizontalSpacing = 300,
    verticalSpacing = 50,
    nodeHeight = 100,
  } = options;

  if (nodes.length === 0) {
    console.log("[layoutGraph] No nodes, returning empty result");
    return { nodes: [], edges: [] };
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const startId = "INITIAL_STEP";

  // Step 1: BFS to find distance from start node to all other nodes
  const distances = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  nodes.forEach((node) => outgoing.set(node.id, []));
  edges.forEach((edge) => {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      outgoing.get(edge.from)?.push(edge.to);
    }
  });

  if (nodeIds.has(startId)) {
    const queue: { id: string; distance: number }[] = [{ id: startId, distance: 0 }];
    distances.set(startId, 0);

    while (queue.length > 0) {
      const { id, distance } = queue.shift()!;
      for (const childId of outgoing.get(id) ?? []) {
        if (!distances.has(childId)) {
          distances.set(childId, distance + 1);
          queue.push({ id: childId, distance: distance + 1 });
        }
      }
    }
  }

  // Handle unreachable nodes
  nodes.forEach((node) => {
    if (!distances.has(node.id)) {
      distances.set(node.id, 0);
    }
  });

  console.log("[layoutGraph] Distances:", Object.fromEntries(distances));

  // Step 2: Create simplified tree graph (only edges from level N to level N+1)
  const treeChildren = new Map<string, string[]>();
  const treeEdges: Edge[] = [];

  nodes.forEach((node) => treeChildren.set(node.id, []));

  edges.forEach((edge) => {
    const fromDist = distances.get(edge.from);
    const toDist = distances.get(edge.to);
    if (fromDist !== undefined && toDist !== undefined && toDist === fromDist + 1) {
      treeChildren.get(edge.from)?.push(edge.to);
      treeEdges.push(edge);
    }
  });

  console.log("[layoutGraph] Tree children:", Object.fromEntries(treeChildren));
  console.log("[layoutGraph] Tree edges:", treeEdges.length, "of", edges.length, "total");

  // Step 3: Group nodes by level
  const maxDistance = Math.max(...distances.values());
  const levels: string[][] = Array.from({ length: maxDistance + 1 }, () => []);

  distances.forEach((distance, nodeId) => {
    levels[distance].push(nodeId);
  });

  console.log("[layoutGraph] Levels:", levels);

  // Step 4: Calculate subtree heights (from leaves to root)
  // This tells us how much Y space each subtree needs
  const subtreeHeight = new Map<string, number>();

  for (let level = maxDistance; level >= 0; level--) {
    for (const nodeId of levels[level]) {
      const children = treeChildren.get(nodeId) ?? [];
      if (children.length === 0) {
        // Leaf node needs space for just itself
        subtreeHeight.set(nodeId, nodeHeight);
      } else {
        // Parent needs sum of children's subtree heights + spacing between them
        const childrenTotalHeight = children.reduce(
          (sum, c) => sum + (subtreeHeight.get(c) ?? nodeHeight),
          0
        );
        const spacing = (children.length - 1) * verticalSpacing;
        subtreeHeight.set(nodeId, childrenTotalHeight + spacing);
      }
    }
  }

  console.log("[layoutGraph] Subtree heights:", Object.fromEntries(subtreeHeight));

  // Step 5: Allocate Y ranges and position nodes (from root to leaves)
  const yPositions = new Map<string, number>();
  const yRanges = new Map<string, { start: number; end: number }>();

  // Root gets range starting at 0
  if (nodeIds.has(startId)) {
    const rootHeight = subtreeHeight.get(startId) ?? nodeHeight;
    yRanges.set(startId, { start: 0, end: rootHeight });
  }

  // Process level by level
  for (let level = 0; level <= maxDistance; level++) {
    for (const nodeId of levels[level]) {
      const range = yRanges.get(nodeId);
      if (!range) continue;

      // Position this node centered in its range
      const rangeCenter = (range.start + range.end) / 2;
      const nodeY = rangeCenter - nodeHeight / 2;
      yPositions.set(nodeId, nodeY);

      console.log(`[layoutGraph] Node ${nodeId}: range=[${range.start}, ${range.end}], center=${rangeCenter}, Y=${nodeY}`);

      // Allocate ranges to children
      const children = treeChildren.get(nodeId) ?? [];
      if (children.length > 0) {
        let currentY = range.start;

        for (const childId of children) {
          const childHeight = subtreeHeight.get(childId) ?? nodeHeight;
          yRanges.set(childId, { start: currentY, end: currentY + childHeight });
          currentY += childHeight + verticalSpacing;
        }
      }
    }
  }

  // Handle orphan nodes not connected to root
  let orphanY = 0;
  const allYs = Array.from(yPositions.values());
  if (allYs.length > 0) {
    orphanY = Math.max(...allYs) + nodeHeight + verticalSpacing;
  }

  for (const node of nodes) {
    if (!yPositions.has(node.id)) {
      yPositions.set(node.id, orphanY);
      orphanY += nodeHeight + verticalSpacing;
    }
  }

  console.log("[layoutGraph] Y positions:", Object.fromEntries(yPositions));

  // Step 5: Build final positions
  const positions = new Map<string, { x: number; y: number }>();

  nodes.forEach((node) => {
    const distance = distances.get(node.id) ?? 0;
    const x = distance * horizontalSpacing;
    const y = yPositions.get(node.id) ?? 0;
    positions.set(node.id, { x, y });
  });

  console.log("[layoutGraph] Final positions:", Object.fromEntries(positions));

  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? { x: 0, y: 0 },
  }));

  return {
    nodes: layoutedNodes,
    edges: treeEdges,
  };
}
