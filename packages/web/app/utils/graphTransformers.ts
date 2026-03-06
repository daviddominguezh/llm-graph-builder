import { Position, type Edge as RFEdge, type Node as RFNode } from '@xyflow/react';

import type {
  ContextPreconditions,
  Precondition,
  Edge as SchemaEdge,
  Node as SchemaNode,
} from '../schemas/graph.schema';

// Default node dimensions for handle calculation
const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 80;

// Grid layout constants
const GRID_COLUMNS = 5;
const GRID_COLUMN_WIDTH = 300;
const GRID_ROW_HEIGHT = 150;
const INITIAL_INDEX = 0;

interface HandlePair {
  sourceHandle: string;
  targetHandle: string;
}

/**
 * Calculate the closest source and target handles based on node positions.
 * Available handles:
 * - Sources: right-source, top-source, bottom-source
 * - Targets: left-target, top-target, bottom-target
 */
function getClosestHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  _nodeWidth: number = DEFAULT_NODE_WIDTH,
  _nodeHeight: number = DEFAULT_NODE_HEIGHT
): HandlePair {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;

  // For left-to-right flow (target is to the right)
  if (dx >= INITIAL_INDEX) {
    return { sourceHandle: 'right-source', targetHandle: 'left-target' };
  }

  // For right-to-left flow (back edges), use vertical handles
  if (dy > INITIAL_INDEX) {
    // Target is below source: use bottom-source -> top-target
    return { sourceHandle: 'bottom-source', targetHandle: 'top-target' };
  }

  // Target is above source: use top-source -> bottom-target
  return { sourceHandle: 'top-source', targetHandle: 'bottom-target' };
}

export interface RFNodeData extends Record<string, unknown> {
  nodeId: string;
  text: string;
  description: string;
  agent?: string;
  nextNodeIsUser?: boolean;
  global?: boolean;
  muted?: boolean;
  nodeWidth?: number | null;
}

export interface RFEdgeData extends Record<string, unknown> {
  preconditions?: Precondition[];
  contextPreconditions?: ContextPreconditions;
  muted?: boolean;
}

function computeDefaultPosition(index: number): { x: number; y: number } {
  return {
    x: (index % GRID_COLUMNS) * GRID_COLUMN_WIDTH,
    y: Math.floor(index / GRID_COLUMNS) * GRID_ROW_HEIGHT,
  };
}

export function schemaNodeToRFNode(node: SchemaNode, index = INITIAL_INDEX): RFNode<RFNodeData> {
  const defaultPosition = computeDefaultPosition(index);

  return {
    id: node.id,
    type: node.kind,
    position: node.position ?? defaultPosition,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      nodeId: node.id,
      text: node.text,
      description: node.description,
      agent: node.agent,
      nextNodeIsUser: node.nextNodeIsUser,
      global: node.global,
    },
  };
}

function resolveTextFields(
  data: RFNodeData | undefined,
  original: SchemaNode
): Pick<SchemaNode, 'id' | 'text' | 'kind' | 'description'> {
  return {
    id: original.id,
    text: data?.text ?? original.text,
    kind: original.kind,
    description: data?.description ?? original.description,
  };
}

function resolveOptionalFields(
  data: RFNodeData | undefined,
  original: SchemaNode
): Pick<SchemaNode, 'agent' | 'nextNodeIsUser' | 'global'> {
  return {
    agent: data?.agent ?? original.agent,
    nextNodeIsUser: data?.nextNodeIsUser ?? original.nextNodeIsUser,
    global: data?.global ?? original.global,
  };
}

export function rfNodeToSchemaNode(rfNode: RFNode<RFNodeData>, originalNode: SchemaNode): SchemaNode {
  return {
    ...resolveTextFields(rfNode.data, originalNode),
    ...resolveOptionalFields(rfNode.data, originalNode),
    position: rfNode.position,
  };
}

function computeHandlesFromNodes(edge: SchemaEdge, nodes: SchemaNode[]): HandlePair | undefined {
  const sourceNode = nodes.find((n) => n.id === edge.from);
  const targetNode = nodes.find((n) => n.id === edge.to);

  if (sourceNode?.position !== undefined && targetNode?.position !== undefined) {
    return getClosestHandles(sourceNode.position, targetNode.position);
  }

  return undefined;
}

export function schemaEdgeToRFEdge(
  edge: SchemaEdge,
  index = INITIAL_INDEX,
  nodes?: SchemaNode[]
): RFEdge<RFEdgeData> {
  const handles = nodes === undefined ? undefined : computeHandlesFromNodes(edge, nodes);

  return {
    id: `${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    sourceHandle: handles?.sourceHandle,
    targetHandle: handles?.targetHandle,
    type: 'precondition',
    data: {
      preconditions: edge.preconditions,
      contextPreconditions: edge.contextPreconditions,
    },
  };
}

export function rfEdgeToSchemaEdge(rfEdge: RFEdge<RFEdgeData>): SchemaEdge {
  return {
    from: rfEdge.source,
    to: rfEdge.target,
    preconditions: rfEdge.data?.preconditions,
    contextPreconditions: rfEdge.data?.contextPreconditions,
  };
}
