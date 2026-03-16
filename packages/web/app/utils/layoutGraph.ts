import type { DagreGraph } from '../lib/dagre';
import { dagre } from '../lib/dagre';
import type { Edge, Node } from '../schemas/graph.schema';

interface NodeDimensions {
  width: number;
  height: number;
}

interface LayoutOptions {
  horizontalSpacing?: number;
  verticalSpacing?: number;
  defaultNodeWidth?: number;
  defaultNodeHeight?: number;
  nodeDimensions?: Record<string, NodeDimensions>;
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
}

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

const DEFAULT_HORIZONTAL_SPACING = 150;
const DEFAULT_VERTICAL_SPACING = 100;
const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 130;
const GRAPH_MARGIN = 20;
const HALF_DIVISOR = 2;
const ORIGIN = 0;

interface ResolvedConfig {
  horizontalSpacing: number;
  verticalSpacing: number;
  defaultNodeWidth: number;
  defaultNodeHeight: number;
  nodeDimensions: Record<string, NodeDimensions>;
  rankdir: 'TB' | 'BT' | 'LR' | 'RL';
}

function resolveOptions(options: LayoutOptions): ResolvedConfig {
  return {
    horizontalSpacing: options.horizontalSpacing ?? DEFAULT_HORIZONTAL_SPACING,
    verticalSpacing: options.verticalSpacing ?? DEFAULT_VERTICAL_SPACING,
    defaultNodeWidth: options.defaultNodeWidth ?? DEFAULT_NODE_WIDTH,
    defaultNodeHeight: options.defaultNodeHeight ?? DEFAULT_NODE_HEIGHT,
    nodeDimensions: options.nodeDimensions ?? {},
    rankdir: options.rankdir ?? 'LR',
  };
}

function getDimensions(config: ResolvedConfig, nodeId: string): NodeDimensions {
  return (
    config.nodeDimensions[nodeId] ?? { width: config.defaultNodeWidth, height: config.defaultNodeHeight }
  );
}

function buildDagreGraph(nodes: Node[], edges: Edge[], config: ResolvedConfig): DagreGraph {
  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: config.rankdir,
    nodesep: config.verticalSpacing,
    ranksep: config.horizontalSpacing,
    marginx: GRAPH_MARGIN,
    marginy: GRAPH_MARGIN,
  });

  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    const dims = getDimensions(config, node.id);
    g.setNode(node.id, { width: dims.width, height: dims.height, label: node.id });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.from, edge.to);
  });

  return g;
}

function extractPositions(g: DagreGraph, config: ResolvedConfig): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  g.nodes().forEach((nodeId: string) => {
    const dagreNode = g.node(nodeId);
    const dims = getDimensions(config, nodeId);

    if (dagreNode !== undefined) {
      positions.set(nodeId, {
        x: dagreNode.x - dims.width / HALF_DIVISOR,
        y: dagreNode.y - dims.height / HALF_DIVISOR,
      });
    }
  });

  return positions;
}

/**
 * Layout algorithm using dagre (Sugiyama method):
 * - Handles all edges including back-edges and cycles
 * - Minimizes edge crossings
 * - Respects per-node dimensions
 */
export function layoutGraph(nodes: Node[], edges: Edge[], options: LayoutOptions = {}): LayoutResult {
  if (nodes.length === ORIGIN) {
    return { nodes: [], edges: [] };
  }

  const config = resolveOptions(options);
  const g = buildDagreGraph(nodes, edges, config);

  dagre.layout(g);

  const positions = extractPositions(g, config);

  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? { x: ORIGIN, y: ORIGIN },
  }));

  return { nodes: layoutedNodes, edges };
}
