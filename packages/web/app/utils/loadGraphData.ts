import graphData from '../data/ecommerce.json';
import type { Graph, Node as SchemaNode } from '../schemas/graph.schema';
import { GraphSchema } from '../schemas/graph.schema';
import { layoutGraph } from './layoutGraph';

interface LoadGraphResult {
  graph: Graph;
  nodeWidth: number;
}

const CHAR_WIDTH_FACTOR = 7.5;
const INITIAL_STEP_WIDTH = 100;
const INITIAL_STEP_HEIGHT = 44;
const DEFAULT_NODE_HEIGHT = 130;
const FIXED_NODE_HEIGHT = 220;
const NO_SPACING = 0;
const HALF_DIVISOR = 2;

function calculateNodeWidth(nodes: Graph['nodes']): number {
  const maxIdLength = Math.max(...nodes.map((n: SchemaNode) => n.id.length));
  const nodePadding = 40;
  return maxIdLength * CHAR_WIDTH_FACTOR + nodePadding;
}

/**
 * Calculate per-node dimensions for layout.
 * All nodes have fixed height except INITIAL_STEP.
 */
function calculateNodeDimensions(
  nodes: Graph['nodes'],
  nodeWidth: number
): Record<string, { width: number; height: number }> {
  const dimensions: Record<string, { width: number; height: number }> = {};

  for (const node of nodes) {
    if (node.id === 'INITIAL_STEP') {
      dimensions[node.id] = { width: INITIAL_STEP_WIDTH, height: INITIAL_STEP_HEIGHT };
      continue;
    }

    dimensions[node.id] = { width: nodeWidth, height: FIXED_NODE_HEIGHT };
  }

  return dimensions;
}

function ensureNodePositions(graph: Graph, nodeWidth: number): Graph {
  const hasPositions = graph.nodes.every((node: SchemaNode) => node.position !== undefined);

  if (hasPositions) {
    return graph;
  }

  const nodeDimensions = calculateNodeDimensions(graph.nodes, nodeWidth);

  const layoutResult = layoutGraph(graph.nodes, graph.edges, {
    horizontalSpacing: nodeWidth,
    verticalSpacing: NO_SPACING,
    defaultNodeWidth: nodeWidth,
    defaultNodeHeight: DEFAULT_NODE_HEIGHT,
    nodeDimensions,
    rankdir: 'LR',
  });

  return {
    ...graph,
    nodes: layoutResult.nodes,
    edges: layoutResult.edges,
  };
}

/**
 * Process a validated graph: calculate node width and ensure positions.
 * Use this for both hardcoded data and imported files.
 */
export function processGraph(graph: Graph): LoadGraphResult {
  const nodeWidth = calculateNodeWidth(graph.nodes);
  const processedGraph = ensureNodePositions(graph, nodeWidth);
  return { graph: processedGraph, nodeWidth };
}

export function loadGraphData(): LoadGraphResult | null {
  const result = GraphSchema.safeParse(graphData);

  if (!result.success) {
    return null;
  }

  return processGraph(result.data);
}

export function findInitialNodePosition(graph: Graph): { x: number; y: number } | null {
  const initialNode = graph.nodes.find((n: SchemaNode) => n.id === 'INITIAL_STEP');
  return initialNode?.position ?? null;
}

export function calculateInitialViewport(
  initialNodePosition: { x: number; y: number },
  containerHeight: number
): { x: number; y: number; zoom: number } {
  const padding = 50;
  const zoom = 0.8;

  const nodeCenterY = initialNodePosition.y + INITIAL_STEP_HEIGHT / HALF_DIVISOR;

  return {
    x: -initialNodePosition.x * zoom + padding,
    y: containerHeight / HALF_DIVISOR - nodeCenterY * zoom,
    zoom,
  };
}

// Set to null for empty canvas, or loadGraphData() to load from JSON
export const GRAPH_DATA: ReturnType<typeof loadGraphData> = null;
