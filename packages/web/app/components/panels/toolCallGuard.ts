import type { Edge } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';

/** Returns true if any edge has a tool_call precondition. */
export function hasToolCallEdge(edges: Array<Edge<RFEdgeData>>): boolean {
  return edges.some((e) => e.data?.preconditions?.some((p) => p.type === 'tool_call'));
}

/** Returns true if the node has a non-empty text or description. */
export function nodeHasContent(data: RFNodeData | undefined): boolean {
  if (!data) return false;
  return (data.text ?? '').trim() !== '' || (data.description ?? '').trim() !== '';
}
