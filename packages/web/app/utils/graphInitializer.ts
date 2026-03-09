import type { Edge, Node } from '@xyflow/react';

import type { Graph } from '../schemas/graph.schema';
import type { RFEdgeData, RFNodeData } from './graphTransformers';
import { schemaEdgeToRFEdge, schemaNodeToRFNode } from './graphTransformers';
import { processGraph } from './loadGraphData';

export const START_NODE_ID = 'INITIAL_STEP';
const DEFAULT_FIRST_NODE_ID = 'first_node';
export const DEFAULT_NODE_WIDTH = 180;
export const DEFAULT_NODE_HEIGHT = 220;
export const START_NODE_WIDTH = 100;
export const START_NODE_HEIGHT = 44;
export const NODE_GAP = 100;

const START_X = -50;
const START_Y = 200;
const HALF = 2;

export const defaultStartNode: Node<RFNodeData> = {
  id: START_NODE_ID,
  type: 'start',
  position: { x: START_X, y: START_Y },
  selectable: false,
  draggable: false,
  data: { nodeId: START_NODE_ID, text: '', description: '' },
};

const defaultFirstNode: Node<RFNodeData> = {
  id: DEFAULT_FIRST_NODE_ID,
  type: 'agent',
  position: {
    x: defaultStartNode.position.x + START_NODE_WIDTH + NODE_GAP,
    y: defaultStartNode.position.y + START_NODE_HEIGHT / HALF - DEFAULT_NODE_HEIGHT / HALF,
  },
  data: {
    nodeId: DEFAULT_FIRST_NODE_ID,
    text: '',
    description: '',
    nodeWidth: DEFAULT_NODE_WIDTH,
  },
};

const defaultStartEdge: Edge<RFEdgeData> = {
  id: `${START_NODE_ID}-${DEFAULT_FIRST_NODE_ID}`,
  source: START_NODE_ID,
  target: DEFAULT_FIRST_NODE_ID,
  sourceHandle: 'right-source',
  targetHandle: 'left-target',
  type: 'precondition',
  data: {
    preconditions: [{ type: 'user_said', value: 'Hello', description: 'User greeting' }],
  },
};

const EMPTY_LENGTH = 0;

function hasGraphNodes(graphData: Graph | undefined): graphData is Graph {
  if (graphData === undefined) return false;
  if (!('nodes' in graphData)) return false;
  return Array.isArray(graphData.nodes) && graphData.nodes.length > EMPTY_LENGTH;
}

function mapSchemaNode(n: Graph['nodes'][number], i: number, nodeWidth: number): Node<RFNodeData> {
  const baseNode = schemaNodeToRFNode(n, i);
  const isStartNode = n.id === START_NODE_ID;
  return {
    ...baseNode,
    type: isStartNode ? 'start' : baseNode.type,
    selectable: !isStartNode,
    draggable: false,
    data: { ...baseNode.data, nodeWidth },
  };
}

export function buildInitialNodes(graphData: Graph | undefined): Array<Node<RFNodeData>> {
  if (!hasGraphNodes(graphData)) {
    return [defaultStartNode, defaultFirstNode];
  }
  const { graph, nodeWidth } = processGraph(graphData);
  return graph.nodes.map((n, i) => mapSchemaNode(n, i, nodeWidth));
}

export function buildInitialEdges(graphData: Graph | undefined): Array<Edge<RFEdgeData>> {
  if (!hasGraphNodes(graphData)) {
    return [defaultStartEdge];
  }
  const { graph } = processGraph(graphData);
  return graph.edges.map((e, i) => schemaEdgeToRFEdge(e, i, graph.nodes));
}
