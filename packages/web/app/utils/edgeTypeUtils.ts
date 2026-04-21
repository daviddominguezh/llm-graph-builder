import type { Edge } from '@xyflow/react';

import { START_NODE_ID } from './graphInitializer';
import type { RFEdgeData } from './graphTransformers';

export type ExistingEdgeType = 'none' | 'user_said' | 'agent_decision' | 'tool_call' | 'unset';

const EMPTY = 0;

function hasContextPreconditionsOnly(edge: Edge<RFEdgeData>): boolean {
  const hasContext = edge.data?.contextPreconditions !== undefined;
  const preconditions = edge.data?.preconditions;
  const hasNoPreconditions = preconditions === undefined || preconditions.length === EMPTY;
  return hasContext && hasNoPreconditions;
}

function getEdgePreconditionType(edge: Edge<RFEdgeData>): ExistingEdgeType {
  const preconditions = edge.data?.preconditions;
  if (preconditions !== undefined && preconditions.length > EMPTY) {
    return preconditions[EMPTY].type as ExistingEdgeType;
  }
  return 'none';
}

/**
 * Returns the precondition type of existing outgoing edges from a source node.
 * - 'unset' means no outgoing edges (or only context-precondition edges) — all options valid.
 * - 'none' | 'user_said' | 'agent_decision' | 'tool_call' — only compatible options valid.
 */
export function getSourceEdgeType(sourceNodeId: string, edges: Array<Edge<RFEdgeData>>): ExistingEdgeType {
  const outgoing = edges
    .filter((e) => e.source === sourceNodeId)
    .filter((e) => !hasContextPreconditionsOnly(e));

  if (outgoing.length === EMPTY) return 'unset';
  return getEdgePreconditionType(outgoing[EMPTY]!);
}

export function isStartNode(nodeId: string): boolean {
  return nodeId === START_NODE_ID;
}
