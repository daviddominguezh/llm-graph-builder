import type { Edge as RFFlowEdge, Node as RFFlowNode } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from './graphTransformers';

type FlowNode = RFFlowNode<RFNodeData>;
type FlowEdge = RFFlowEdge<RFEdgeData>;

const START_NODE_ID = 'INITIAL_STEP';
const EMPTY = 0;

/**
 * Check if `target` is reachable from START when `excludedNode` is removed.
 * If NOT reachable → `excludedNode` dominates `target` (100% coverage).
 */
export function isDominator(edges: FlowEdge[], excludedNode: string, target: string): boolean {
  const reachable = bfsReachable(edges, START_NODE_ID, excludedNode);
  return !reachable.has(target);
}

function bfsReachable(edges: FlowEdge[], start: string, exclude: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [start];

  while (queue.length > EMPTY) {
    const current = queue.shift();
    if (current === undefined || visited.has(current) || current === exclude) continue;
    visited.add(current);
    for (const edge of edges) {
      if (edge.source === current && !visited.has(edge.target) && edge.target !== exclude) {
        queue.push(edge.target);
      }
    }
  }
  return visited;
}

/**
 * Find all output-schema nodes upstream of `sourceNode`.
 * A node R is upstream if R is an ancestor of sourceNode (reachable via reverse edges).
 */
export function findUpstreamOutputNodes(
  nodes: FlowNode[],
  edges: FlowEdge[],
  sourceNode: string
): FlowNode[] {
  const ancestors = reverseBfsAncestors(edges, sourceNode);
  return nodes.filter(
    (n) => n.id !== sourceNode && ancestors.has(n.id) && n.data.outputSchemaId !== undefined
  );
}

function reverseBfsAncestors(edges: FlowEdge[], target: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [target];

  while (queue.length > EMPTY) {
    const current = queue.shift();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }
  return visited;
}

export interface CoverageResult {
  covered: boolean;
  reason?: string;
}

/**
 * Validate path coverage for a reference from target T to output node R.
 * Uses the dominator check algorithm from the design spec (section 3.1-3.2).
 */
export function checkPathCoverage(edges: FlowEdge[], target: string, refNodeId: string): CoverageResult {
  if (isDominator(edges, refNodeId, target)) {
    return { covered: true };
  }
  return {
    covered: false,
    reason: `Some paths to this node don't pass through "${refNodeId}"`,
  };
}

/**
 * Validate a fallback reference in the reduced graph.
 * Per spec section 3.2:
 * - If R's field is REQUIRED: remove R from graph (paths through R have a value).
 * - If R's field is OPTIONAL: validate in full graph (R may be on path but produce null).
 */
export function checkFallbackCoverage(
  edges: FlowEdge[],
  target: string,
  primaryRefNodeId: string,
  fallbackNodeId: string,
  primaryFieldRequired: boolean
): CoverageResult {
  if (primaryFieldRequired) {
    // Remove primary ref node — only consider paths that bypass it
    const reducedEdges = edges.filter((e) => e.source !== primaryRefNodeId && e.target !== primaryRefNodeId);
    if (isDominator(reducedEdges, fallbackNodeId, target)) {
      return { covered: true };
    }
    return {
      covered: false,
      reason: `Fallback node "${fallbackNodeId}" doesn't cover all bypass paths`,
    };
  }

  // Optional field: validate in full graph
  if (isDominator(edges, fallbackNodeId, target)) {
    return { covered: true };
  }
  return {
    covered: false,
    reason: `Fallback node "${fallbackNodeId}" doesn't cover all paths (source field is optional)`,
  };
}
