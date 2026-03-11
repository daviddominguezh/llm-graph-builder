import type { Edge as RFFlowEdge, Node as RFFlowNode } from '@xyflow/react';

import type { ToolFieldValue } from '../schemas/graph.schema';
import type { RFEdgeData, RFNodeData } from './graphTransformers';
import type { ValidationError } from './graphValidation';

type FlowNode = RFFlowNode<RFNodeData>;
type FlowEdge = RFFlowEdge<RFEdgeData>;

const MAX_EDGES = 1;
const EMPTY = 0;

function checkEdgeCount(node: FlowNode, nodeEdges: FlowEdge[]): ValidationError[] {
  if (nodeEdges.length > MAX_EDGES) {
    return [
      {
        message: `Node "${node.id}": output schema nodes must have at most one outgoing edge`,
        nodeId: node.id,
      },
    ];
  }
  return [];
}

function checkNextNodeIsUser(node: FlowNode): ValidationError[] {
  if (node.data.nextNodeIsUser === true) {
    return [
      {
        message: `Node "${node.id}": output schema and nextNodeIsUser are mutually exclusive`,
        nodeId: node.id,
      },
    ];
  }
  return [];
}

function hasForbiddenPreconditions(nodeEdges: FlowEdge[]): boolean {
  return nodeEdges.some((e) => {
    const pType = e.data?.preconditions?.[EMPTY]?.type;
    return pType === 'user_said' || pType === 'agent_decision' || pType === 'tool_call';
  });
}

function hasContextPreconditions(nodeEdges: FlowEdge[]): boolean {
  return nodeEdges.some(
    (e) =>
      e.data?.contextPreconditions !== undefined && e.data.contextPreconditions.preconditions.length > EMPTY
  );
}

function checkPreconditions(node: FlowNode, nodeEdges: FlowEdge[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (hasForbiddenPreconditions(nodeEdges)) {
    errors.push({
      message: `Node "${node.id}": output schema nodes must not have routing preconditions`,
      nodeId: node.id,
    });
  }

  if (hasContextPreconditions(nodeEdges)) {
    errors.push({
      message: `Node "${node.id}": output schema nodes must not have context preconditions`,
      nodeId: node.id,
    });
  }

  return errors;
}

function checkOutputPrompt(node: FlowNode): ValidationError[] {
  if (!node.data.outputPrompt || node.data.outputPrompt.trim() === '') {
    return [
      {
        message: `Node "${node.id}": output schema nodes must have an extraction prompt`,
        nodeId: node.id,
      },
    ];
  }
  return [];
}

function validateSingleOutputSchemaNode(node: FlowNode, nodeEdges: FlowEdge[]): ValidationError[] {
  return [
    ...checkEdgeCount(node, nodeEdges),
    ...checkNextNodeIsUser(node),
    ...checkPreconditions(node, nodeEdges),
    ...checkOutputPrompt(node),
  ];
}

export function validateOutputSchemaNodes(
  nodes: FlowNode[],
  edgesBySource: Map<string, FlowEdge[]>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    if (node.data.outputSchemaId === undefined) continue;
    const nodeEdges = edgesBySource.get(node.id) ?? [];
    errors.push(...validateSingleOutputSchemaNode(node, nodeEdges));
  }
  return errors;
}

function validateSingleReference(
  nodes: FlowNode[],
  sourceNode: string,
  fieldName: string,
  field: ToolFieldValue
): ValidationError[] {
  if (field.type !== 'reference') return [];

  const errors: ValidationError[] = [];
  const refNode = nodes.find((n) => n.id === field.nodeId);

  if (refNode === undefined) {
    errors.push({
      message: `Edge from "${sourceNode}": reference "${fieldName}" points to non-existent node "${field.nodeId}"`,
      nodeId: sourceNode,
    });
    return errors;
  }

  if (refNode.data.outputSchemaId === undefined) {
    errors.push({
      message: `Edge from "${sourceNode}": reference "${fieldName}" points to node "${field.nodeId}" which has no output schema`,
      nodeId: sourceNode,
    });
  }

  return errors;
}

function validateEdgeReferences(edge: FlowEdge, nodes: FlowNode[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const preconditions = edge.data?.preconditions ?? [];

  for (const p of preconditions) {
    if (p.toolFields === undefined) continue;
    for (const [fieldName, field] of Object.entries(p.toolFields)) {
      errors.push(...validateSingleReference(nodes, edge.source, fieldName, field));
    }
  }

  return errors;
}

export function validateReferences(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const edge of edges) {
    errors.push(...validateEdgeReferences(edge, nodes));
  }
  return errors;
}
