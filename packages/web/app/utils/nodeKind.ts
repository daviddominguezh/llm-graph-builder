import type { Edge } from '@xyflow/react';

import type { RFEdgeData } from './graphTransformers';

export type NodeKind = 'agent' | 'user_routing' | 'agent_decision' | 'tool_call';

const ROW_MODE_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(['agent_decision', 'user_routing']);

// The start node routes user_said edges (so getNodeKind reads it as user_routing) but is
// rendered by StartNode, which exposes a single `right-source` handle — not per-option row
// handles. It must never be treated as row-mode, or its edges get rewritten to a handle id
// that doesn't exist and disappear. (Declared locally, matching graphValidation.ts.)
const START_NODE_ID = 'INITIAL_STEP';

export function isRowModeNodeKind(kind: NodeKind): boolean {
  return ROW_MODE_KINDS.has(kind);
}

function kindFromPreconditionType(type: string): NodeKind | undefined {
  if (type === 'user_said') return 'user_routing';
  if (type === 'agent_decision') return 'agent_decision';
  if (type === 'tool_call') return 'tool_call';
  return undefined;
}

export function getNodeKind(nodeId: string, edges: Edge<RFEdgeData>[]): NodeKind {
  const outgoing = edges.filter((e) => e.source === nodeId);
  if (outgoing.length === 0) return 'agent';

  for (const edge of outgoing) {
    const first = edge.data?.preconditions?.[0];
    const kind = first === undefined ? undefined : kindFromPreconditionType(first.type);
    if (kind !== undefined) return kind;
  }
  return 'agent';
}

export function getRowModeSourceIds(edges: Edge<RFEdgeData>[]): Set<string> {
  const result = new Set<string>();
  for (const source of new Set(edges.map((e) => e.source))) {
    if (source === START_NODE_ID) continue;
    if (isRowModeNodeKind(getNodeKind(source, edges))) result.add(source);
  }
  return result;
}

export function normalizeRowModeHandles(edges: Edge<RFEdgeData>[]): Edge<RFEdgeData>[] {
  const rowModeSources = getRowModeSourceIds(edges);
  return edges.map((edge) => {
    if (!rowModeSources.has(edge.source)) return edge;
    if (edge.sourceHandle === edge.id && edge.targetHandle === 'left-target') return edge;
    return { ...edge, sourceHandle: edge.id, targetHandle: 'left-target' };
  });
}
