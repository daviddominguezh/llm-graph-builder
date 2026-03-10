import type { Edge, Node } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import {
  buildDeleteEdgeOp,
  buildDeleteNodeOp,
  buildInsertEdgeOp,
  buildInsertNodeOp,
  buildUpdateNodeOp,
} from '../../utils/operationBuilders';
import type { PushOperation } from '../../utils/operationBuilders';

export function pushUpdateNode(
  node: Node<RFNodeData>,
  updates: Partial<RFNodeData>,
  pushOp: PushOperation
): void {
  const updated: Node<RFNodeData> = { ...node, data: { ...node.data, ...updates } };
  pushOp(buildUpdateNodeOp(updated));
}

export function pushDeleteNode(nodeId: string, edges: Array<Edge<RFEdgeData>>, pushOp: PushOperation): void {
  pushOp(buildDeleteNodeOp(nodeId));
  const connected = edges.filter((e) => e.source === nodeId || e.target === nodeId);
  for (const edge of connected) {
    pushOp(buildDeleteEdgeOp(edge.source, edge.target));
  }
}

export function pushRenameNode(
  oldId: string,
  node: Node<RFNodeData>,
  edges: Array<Edge<RFEdgeData>>,
  pushOp: PushOperation
): void {
  pushOp(buildDeleteNodeOp(oldId));
  pushOp(buildInsertNodeOp(node));
  const connected = edges.filter((e) => e.source === oldId || e.target === oldId);
  for (const edge of connected) {
    pushOp(buildDeleteEdgeOp(edge.source, edge.target));
    const newSource = edge.source === oldId ? node.id : edge.source;
    const newTarget = edge.target === oldId ? node.id : edge.target;
    pushOp(buildInsertEdgeOp(newSource, newTarget, edge.data));
  }
}
