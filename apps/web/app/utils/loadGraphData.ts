import type { Graph } from "../schemas/graph.schema";
import { GraphSchema } from "../schemas/graph.schema";
import { layoutGraph } from "./layoutGraph";
import graphData from "../data/graph-test.json";

interface LoadGraphResult {
  graph: Graph;
  nodeWidth: number;
}

function calculateNodeWidth(nodes: Graph["nodes"]): number {
  const maxIdLength = Math.max(...nodes.map((n) => n.id.length));
  const nodePadding = 40;
  return maxIdLength * 7.5 + nodePadding;
}

function ensureNodePositions(graph: Graph, nodeWidth: number): Graph {
  const hasPositions = graph.nodes.every((node) => node.position !== undefined);

  if (hasPositions) {
    return graph;
  }

  const horizontalGap = 150;
  const verticalGap = 100;
  const nodeHeight = 100;

  const layoutResult = layoutGraph(graph.nodes, graph.edges, {
    horizontalSpacing: nodeWidth + horizontalGap,
    verticalSpacing: verticalGap,
    nodeHeight,
  });

  // Return only the tree nodes and edges (left-to-right flow only)
  return {
    ...graph,
    nodes: layoutResult.nodes,
    edges: layoutResult.edges,
  };
}

export function loadGraphData(): LoadGraphResult | null {
  const result = GraphSchema.safeParse(graphData);

  if (!result.success) {
    console.error(
      "[loadGraphData] Graph validation failed:",
      result.error.format(),
    );
    return null;
  }

  const nodeWidth = calculateNodeWidth(result.data.nodes);
  const graph = ensureNodePositions(result.data, nodeWidth);

  return { graph, nodeWidth };
}

export function findInitialNodePosition(
  graph: Graph,
): { x: number; y: number } | null {
  const initialNode = graph.nodes.find((n) => n.id === "INITIAL_STEP");
  return initialNode?.position ?? null;
}

export function calculateInitialViewport(
  initialNodePosition: { x: number; y: number },
  containerHeight: number,
): { x: number; y: number; zoom: number } {
  const nodeHeight = 120;
  const padding = 50;

  return {
    x: -initialNodePosition.x + padding,
    y: -initialNodePosition.y + containerHeight / 2 - nodeHeight / 2,
    zoom: 1,
  };
}

export const GRAPH_DATA = loadGraphData();
