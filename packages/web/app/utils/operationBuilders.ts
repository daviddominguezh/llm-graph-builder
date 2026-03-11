import type { Operation, OutputSchemaField } from '@daviddh/graph-types';
import type { Node } from '@xyflow/react';

import type { NodeKind } from '../schemas/graph.schema';
import type { RFEdgeData, RFNodeData } from './graphTransformers';

type PushFn = (op: Operation) => void;

export type PushOperation = PushFn;

function mapNodeKind(rfType: string | undefined): NodeKind {
  if (rfType === 'agent_decision') return 'agent_decision';
  return 'agent';
}

export function buildInsertNodeOp(node: Node<RFNodeData>): Operation {
  return {
    type: 'insertNode',
    data: {
      nodeId: node.data.nodeId,
      text: node.data.text,
      kind: mapNodeKind(node.type),
      description: node.data.description,
      agent: node.data.agent,
      nextNodeIsUser: node.data.nextNodeIsUser,
      fallbackNodeId: node.data.fallbackNodeId,
      global: node.data.global,
      defaultFallback: node.data.defaultFallback,
      outputSchemaId: node.data.outputSchemaId,
      position: node.position,
    },
  };
}

export function buildUpdateNodeOp(node: Node<RFNodeData>): Operation {
  return {
    type: 'updateNode',
    data: {
      nodeId: node.data.nodeId,
      text: node.data.text,
      kind: mapNodeKind(node.type),
      description: node.data.description,
      agent: node.data.agent,
      nextNodeIsUser: node.data.nextNodeIsUser,
      fallbackNodeId: node.data.fallbackNodeId,
      global: node.data.global,
      defaultFallback: node.data.defaultFallback,
      outputSchemaId: node.data.outputSchemaId,
      position: node.position,
    },
  };
}

export function buildDeleteNodeOp(nodeId: string): Operation {
  return { type: 'deleteNode', nodeId };
}

export function buildInsertEdgeOp(from: string, to: string, edgeData?: RFEdgeData): Operation {
  return {
    type: 'insertEdge',
    data: {
      from,
      to,
      preconditions: edgeData?.preconditions,
      contextPreconditions: edgeData?.contextPreconditions,
    },
  };
}

export function buildUpdateEdgeOp(from: string, to: string, edgeData?: RFEdgeData): Operation {
  return {
    type: 'updateEdge',
    data: {
      from,
      to,
      preconditions: edgeData?.preconditions,
      contextPreconditions: edgeData?.contextPreconditions,
    },
  };
}

export function buildDeleteEdgeOp(from: string, to: string): Operation {
  return { type: 'deleteEdge', from, to };
}

export function buildInsertOutputSchemaOp(
  schemaId: string,
  name: string,
  fields: OutputSchemaField[]
): Operation {
  return { type: 'insertOutputSchema', data: { schemaId, name, fields } };
}

export function buildUpdateOutputSchemaOp(
  schemaId: string,
  name: string,
  fields: OutputSchemaField[]
): Operation {
  return { type: 'updateOutputSchema', data: { schemaId, name, fields } };
}

export function buildDeleteOutputSchemaOp(schemaId: string): Operation {
  return { type: 'deleteOutputSchema', schemaId };
}
