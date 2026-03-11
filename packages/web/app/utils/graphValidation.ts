import type { Edge as RFFlowEdge, Node as RFFlowNode } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from './graphTransformers';
import { validateOutputSchemaNodes, validateReferences } from './graphValidationOutputSchemas';

const START_NODE_ID = 'INITIAL_STEP';
const EMPTY = 0;
const EXACTLY_ONE = 1;

export interface ValidationError {
  message: string;
  nodeId?: string;
}

type FlowNode = RFFlowNode<RFNodeData>;
type FlowEdge = RFFlowEdge<RFEdgeData>;

function groupEdgesBySource(edges: FlowEdge[]): Map<string, FlowEdge[]> {
  const map = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const list = map.get(edge.source) ?? [];
    list.push(edge);
    map.set(edge.source, list);
  }
  return map;
}

function getPreconditionType(edge: FlowEdge): string {
  const preconditions = edge.data?.preconditions;
  if (preconditions !== undefined && preconditions.length > EMPTY) {
    return preconditions[EMPTY].type;
  }
  return 'none';
}

function validateInitialStep(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const startNode = nodes.find((n) => n.id === START_NODE_ID);
  if (startNode === undefined) {
    errors.push({ message: 'Missing initial step node (INITIAL_STEP)' });
    return errors;
  }

  const outgoing = edges.filter((e) => e.source === START_NODE_ID);
  if (outgoing.length !== EXACTLY_ONE) {
    errors.push({
      message: `Initial step: must have exactly 1 outgoing edge (found ${outgoing.length})`,
      nodeId: START_NODE_ID,
    });
  }

  const incoming = edges.filter((e) => e.target === START_NODE_ID);
  if (incoming.length > EMPTY) {
    errors.push({
      message: 'Initial step: must have 0 incoming edges',
      nodeId: START_NODE_ID,
    });
  }

  return errors;
}

function hasContextPreconditionsOnly(edge: FlowEdge): boolean {
  const hasContext = edge.data?.contextPreconditions !== undefined;
  const hasNoPreconditions = getPreconditionType(edge) === 'none';
  return hasContext && hasNoPreconditions;
}

function validatePreconditionConsistency(edgesBySource: Map<string, FlowEdge[]>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [nodeId, nodeEdges] of edgesBySource) {
    if (nodeId === START_NODE_ID) continue;

    // Exclude edges that only have contextPreconditions (no regular preconditions)
    const edgesWithPreconditions = nodeEdges.filter((e) => !hasContextPreconditionsOnly(e));
    const types = new Set(edgesWithPreconditions.map(getPreconditionType));
    if (types.size > EXACTLY_ONE) {
      errors.push({
        message: `Node "${nodeId}": all outgoing edges must have the same precondition type`,
        nodeId,
      });
    }
  }

  return errors;
}

function validateAgentDecision(edgesBySource: Map<string, FlowEdge[]>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [nodeId, nodeEdges] of edgesBySource) {
    if (nodeId === START_NODE_ID) continue;

    const agentDecisionEdges = nodeEdges.filter((e) => getPreconditionType(e) === 'agent_decision');
    if (agentDecisionEdges.length === EXACTLY_ONE) {
      errors.push({
        message: `Node "${nodeId}": agent_decision requires more than one outgoing edge`,
        nodeId,
      });
    }
  }

  return errors;
}

function validateUserSaid(nodes: FlowNode[], edgesBySource: Map<string, FlowEdge[]>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [nodeId, nodeEdges] of edgesBySource) {
    if (nodeId === START_NODE_ID) continue;

    const hasUserSaid = nodeEdges.some((e) => getPreconditionType(e) === 'user_said');
    if (!hasUserSaid) continue;

    const node = nodes.find((n) => n.id === nodeId);
    if (node !== undefined && node.data.nextNodeIsUser !== true) {
      errors.push({
        message: `Node "${nodeId}": user_said requires nextNodeIsUser to be enabled`,
        nodeId,
      });
    }
  }

  return errors;
}

function collectReachableNodes(edges: FlowEdge[]): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [START_NODE_ID];

  while (queue.length > EMPTY) {
    const current = queue.shift();
    if (current === undefined || reachable.has(current)) continue;
    reachable.add(current);
    enqueueTargets(current, edges, reachable, queue);
  }

  return reachable;
}

function enqueueTargets(source: string, edges: FlowEdge[], visited: Set<string>, queue: string[]): void {
  for (const edge of edges) {
    if (edge.source === source && !visited.has(edge.target)) {
      queue.push(edge.target);
    }
  }
}

function validateReachability(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const reachable = collectReachableNodes(edges);

  for (const node of nodes) {
    const isGlobal = node.data.global === true;
    if (node.id !== START_NODE_ID && !isGlobal && !reachable.has(node.id)) {
      errors.push({
        message: `Node "${node.id}": not reachable from the initial step`,
        nodeId: node.id,
      });
    }
  }

  return errors;
}

export function validateGraph(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
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
    ...validateOutputSchemaNodes(nodes, edgesBySource),
    ...validateReferences(nodes, edges),
  ];
}
