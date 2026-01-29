import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";
import type {
  Node as SchemaNode,
  Edge as SchemaEdge,
  Precondition,
  ContextPreconditions,
} from "../schemas/graph.schema";

export interface RFNodeData extends Record<string, unknown> {
  text: string;
  description: string;
  agent?: string;
  nextNodeIsUser?: boolean;
}

export interface RFEdgeData extends Record<string, unknown> {
  preconditions?: Precondition[];
  contextPreconditions?: ContextPreconditions;
}

export function schemaNodeToRFNode(node: SchemaNode): RFNode<RFNodeData> {
  return {
    id: node.id,
    type: node.kind,
    position: node.position,
    data: {
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

export function schemaEdgeToRFEdge(edge: SchemaEdge): RFEdge<RFEdgeData> {
  return {
    id: `${edge.from}-${edge.to}`,
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
