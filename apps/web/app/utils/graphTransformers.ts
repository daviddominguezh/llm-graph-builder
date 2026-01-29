import { Position, type Node as RFNode, type Edge as RFEdge } from "@xyflow/react";
import type {
  Node as SchemaNode,
  Edge as SchemaEdge,
  Precondition,
  ContextPreconditions,
} from "../schemas/graph.schema";

export interface RFNodeData extends Record<string, unknown> {
  nodeId: string;
  text: string;
  description: string;
  agent?: string;
  nextNodeIsUser?: boolean;
  muted?: boolean;
  nodeWidth?: number | null;
}

export interface RFEdgeData extends Record<string, unknown> {
  preconditions?: Precondition[];
  contextPreconditions?: ContextPreconditions;
  muted?: boolean;
}

export function schemaNodeToRFNode(node: SchemaNode, index = 0): RFNode<RFNodeData> {
  // Generate default position if not provided (grid layout)
  const defaultPosition = {
    x: (index % 5) * 300,
    y: Math.floor(index / 5) * 150,
  };

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
    },
  };
}

export function rfNodeToSchemaNode(
  rfNode: RFNode,
  originalNode: SchemaNode
): SchemaNode {
  const data = rfNode.data as RFNodeData | undefined;
  return {
    id: rfNode.id,
    text: data?.text ?? originalNode.text,
    kind: originalNode.kind,
    description: data?.description ?? originalNode.description,
    agent: data?.agent ?? originalNode.agent,
    nextNodeIsUser: data?.nextNodeIsUser ?? originalNode.nextNodeIsUser,
    position: rfNode.position,
  };
}

export function schemaEdgeToRFEdge(edge: SchemaEdge, index = 0): RFEdge<RFEdgeData> {
  return {
    id: `${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    type: "precondition",
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
