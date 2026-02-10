import type { Node as RFFlowNode, Edge as RFFlowEdge } from "@xyflow/react";
import type { RFNodeData, RFEdgeData } from "./graphTransformers";

const START_NODE_ID = "INITIAL_STEP";

export interface ValidationError {
  message: string;
  nodeId?: string;
}

function groupEdgesBySource(
  edges: RFFlowEdge<RFEdgeData>[],
): Map<string, RFFlowEdge<RFEdgeData>[]> {
  const map = new Map<string, RFFlowEdge<RFEdgeData>[]>();
  for (const edge of edges) {
    const list = map.get(edge.source) ?? [];
    list.push(edge);
    map.set(edge.source, list);
  }
  return map;
}

function getPreconditionType(edge: RFFlowEdge<RFEdgeData>): string {
  const preconditions = edge.data?.preconditions;
  if (preconditions && preconditions.length > 0) {
    return preconditions[0].type;
  }
  return "none";
}

function validateInitialStep(
  nodes: RFFlowNode<RFNodeData>[],
  edges: RFFlowEdge<RFEdgeData>[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  const startNode = nodes.find((n) => n.id === START_NODE_ID);
  if (!startNode) {
    errors.push({ message: "Missing initial step node (INITIAL_STEP)" });
    return errors;
  }

  const outgoing = edges.filter((e) => e.source === START_NODE_ID);
  if (outgoing.length !== 1) {
    errors.push({
      message: `Initial step: must have exactly 1 outgoing edge (found ${outgoing.length})`,
      nodeId: START_NODE_ID,
    });
  }

  const incoming = edges.filter((e) => e.target === START_NODE_ID);
  if (incoming.length > 0) {
    errors.push({
      message: "Initial step: must have 0 incoming edges",
      nodeId: START_NODE_ID,
    });
  }

  return errors;
}

function hasContextPreconditionsOnly(edge: RFFlowEdge<RFEdgeData>): boolean {
  const hasContext = edge.data?.contextPreconditions != null;
  const hasNoPreconditions = getPreconditionType(edge) === "none";
  return hasContext && hasNoPreconditions;
}

function validatePreconditionConsistency(
  edgesBySource: Map<string, RFFlowEdge<RFEdgeData>[]>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [nodeId, nodeEdges] of edgesBySource) {
    if (nodeId === START_NODE_ID) continue;

    // Exclude edges that only have contextPreconditions (no regular preconditions)
    const edgesWithPreconditions = nodeEdges.filter(
      (e) => !hasContextPreconditionsOnly(e),
    );
    const types = new Set(edgesWithPreconditions.map(getPreconditionType));
    if (types.size > 1) {
      errors.push({
        message: `Node "${nodeId}": all outgoing edges must have the same precondition type`,
        nodeId,
      });
    }
  }

  return errors;
}

function validateAgentDecision(
  edgesBySource: Map<string, RFFlowEdge<RFEdgeData>[]>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [nodeId, nodeEdges] of edgesBySource) {
    if (nodeId === START_NODE_ID) continue;

    const agentDecisionEdges = nodeEdges.filter(
      (e) => getPreconditionType(e) === "agent_decision",
    );
    if (agentDecisionEdges.length === 1) {
      errors.push({
        message: `Node "${nodeId}": agent_decision requires more than one outgoing edge`,
        nodeId,
      });
    }
  }

  return errors;
}

function validateUserSaid(
  nodes: RFFlowNode<RFNodeData>[],
  edgesBySource: Map<string, RFFlowEdge<RFEdgeData>[]>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [nodeId, nodeEdges] of edgesBySource) {
    if (nodeId === START_NODE_ID) continue;

    const hasUserSaid = nodeEdges.some(
      (e) => getPreconditionType(e) === "user_said",
    );
    if (!hasUserSaid) continue;

    const node = nodes.find((n) => n.id === nodeId);
    if (node && !node.data.nextNodeIsUser) {
      errors.push({
        message: `Node "${nodeId}": user_said requires nextNodeIsUser to be enabled`,
        nodeId,
      });
    }
  }

  return errors;
}

function validateReachability(
  nodes: RFFlowNode<RFNodeData>[],
  edges: RFFlowEdge<RFEdgeData>[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  const reachable = new Set<string>();
  const queue: string[] = [START_NODE_ID];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || reachable.has(current)) continue;
    reachable.add(current);

    for (const edge of edges) {
      if (edge.source === current && !reachable.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  for (const node of nodes) {
    if (node.id !== START_NODE_ID && !reachable.has(node.id)) {
      errors.push({
        message: `Node "${node.id}": not reachable from the initial step`,
        nodeId: node.id,
      });
    }
  }

  return errors;
}

export function validateGraph(
  nodes: RFFlowNode<RFNodeData>[],
  edges: RFFlowEdge<RFEdgeData>[],
): ValidationError[] {
  const initialStepErrors = validateInitialStep(nodes, edges);

  const hasInitialStep = nodes.some((n) => n.id === START_NODE_ID);
  if (!hasInitialStep) return initialStepErrors;

  const edgesBySource = groupEdgesBySource(edges);

  return [
    ...initialStepErrors,
    ...validateAgentDecision(edgesBySource),
    ...validateUserSaid(nodes, edgesBySource),
    ...validatePreconditionConsistency(edgesBySource),
    ...validateReachability(nodes, edges),
  ];
}
