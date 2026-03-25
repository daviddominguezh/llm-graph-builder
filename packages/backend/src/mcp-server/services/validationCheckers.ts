import type { Edge, Graph, Node } from '@daviddh/graph-types';

/* ------------------------------------------------------------------ */
/*  Violation type                                                     */
/* ------------------------------------------------------------------ */

export interface Violation {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeIds?: string[];
  edgeRef?: { from: string; to: string };
}

/* ------------------------------------------------------------------ */
/*  BFS reachability (internal)                                       */
/* ------------------------------------------------------------------ */

const EMPTY_COUNT = 0;

function visitEdgesFrom(nodeId: string, edges: Edge[], visited: Set<string>, queue: string[]): void {
  for (const edge of edges) {
    if (edge.from === nodeId && !visited.has(edge.to)) {
      visited.add(edge.to);
      queue.push(edge.to);
    }
  }
}

function bfsReachableIds(startNode: string, edges: Edge[]): Set<string> {
  const visited = new Set<string>([startNode]);
  const queue: string[] = [startNode];

  while (queue.length > EMPTY_COUNT) {
    const current = queue.shift();
    if (current === undefined) break;
    visitEdgesFrom(current, edges, visited, queue);
  }

  return visited;
}

/* ------------------------------------------------------------------ */
/*  checkOrphanNodes                                                   */
/* ------------------------------------------------------------------ */

export function checkOrphanNodes(graph: Graph): Violation[] {
  const reachable = bfsReachableIds(graph.startNode, graph.edges);
  const orphans = graph.nodes.map((n) => n.id).filter((id) => !reachable.has(id));

  if (orphans.length === EMPTY_COUNT) return [];

  return [
    {
      severity: 'warning',
      code: 'ORPHAN_NODE',
      message: `${orphans.length} node(s) are unreachable from the start node.`,
      nodeIds: orphans,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  checkDeadEnds                                                      */
/* ------------------------------------------------------------------ */

function isTerminalNode(node: Node): boolean {
  return node.nextNodeIsUser === true || node.global;
}

export function checkDeadEnds(graph: Graph): Violation[] {
  const outboundSet = new Set(graph.edges.map((e) => e.from));
  const deadEnds = graph.nodes.filter((n) => !outboundSet.has(n.id) && !isTerminalNode(n)).map((n) => n.id);

  if (deadEnds.length === EMPTY_COUNT) return [];

  return [
    {
      severity: 'warning',
      code: 'DEAD_END',
      message: `${deadEnds.length} node(s) have no outbound edges and are not terminal.`,
      nodeIds: deadEnds,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  checkMissingPreconditions                                          */
/* ------------------------------------------------------------------ */

function isAgentDecisionNode(nodeId: string, nodes: Node[]): boolean {
  return nodes.some((n) => n.id === nodeId && n.kind === 'agent_decision');
}

function edgeHasAgentDecisionPrecondition(edge: Edge): boolean {
  return (edge.preconditions ?? []).some((p) => p.type === 'agent_decision');
}

export function checkMissingPreconditions(graph: Graph): Violation[] {
  const violations: Violation[] = [];

  for (const edge of graph.edges) {
    if (!isAgentDecisionNode(edge.from, graph.nodes)) continue;
    if (edgeHasAgentDecisionPrecondition(edge)) continue;

    violations.push({
      severity: 'error',
      code: 'MISSING_PRECONDITION',
      message: `Edge from agent_decision node '${edge.from}' to '${edge.to}' has no agent_decision precondition.`,
      edgeRef: { from: edge.from, to: edge.to },
    });
  }

  return violations;
}

/* ------------------------------------------------------------------ */
/*  checkUnknownAgents                                                 */
/* ------------------------------------------------------------------ */

export function checkUnknownAgents(graph: Graph): Violation[] {
  const knownAgentIds = new Set(graph.agents.map((a) => a.id));
  const violations: Violation[] = [];

  for (const node of graph.nodes) {
    if (node.agent === undefined) continue;
    if (knownAgentIds.has(node.agent)) continue;

    violations.push({
      severity: 'error',
      code: 'UNKNOWN_AGENT',
      message: `Node '${node.id}' references unknown agent '${node.agent}'.`,
      nodeIds: [node.id],
    });
  }

  return violations;
}

/* ------------------------------------------------------------------ */
/*  checkDuplicateEdges                                                */
/* ------------------------------------------------------------------ */

function edgeSignature(edge: Edge): string {
  return JSON.stringify({
    from: edge.from,
    to: edge.to,
    preconditions: edge.preconditions ?? [],
  });
}

export function checkDuplicateEdges(graph: Graph): Violation[] {
  const seen = new Map<string, Edge>();
  const violations: Violation[] = [];

  for (const edge of graph.edges) {
    const sig = edgeSignature(edge);
    if (seen.has(sig)) {
      violations.push({
        severity: 'warning',
        code: 'DUPLICATE_EDGE',
        message: `Duplicate edge from '${edge.from}' to '${edge.to}'.`,
        edgeRef: { from: edge.from, to: edge.to },
      });
    } else {
      seen.set(sig, edge);
    }
  }

  return violations;
}

/* ------------------------------------------------------------------ */
/*  checkBrokenJumps                                                   */
/* ------------------------------------------------------------------ */

export function checkBrokenJumps(graph: Graph): Violation[] {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const violations: Violation[] = [];

  for (const edge of graph.edges) {
    const jumpTo = edge.contextPreconditions?.jumpTo;
    if (jumpTo === undefined) continue;
    if (nodeIds.has(jumpTo)) continue;

    violations.push({
      severity: 'error',
      code: 'BROKEN_JUMP',
      message: `Edge from '${edge.from}' to '${edge.to}' has jumpTo referencing non-existent node '${jumpTo}'.`,
      edgeRef: { from: edge.from, to: edge.to },
    });
  }

  return violations;
}

/* ------------------------------------------------------------------ */
/*  checkDanglingSchemas                                               */
/* ------------------------------------------------------------------ */

export function checkDanglingSchemas(graph: Graph): Violation[] {
  const schemaIds = new Set((graph.outputSchemas ?? []).map((s) => s.id));
  const violations: Violation[] = [];

  for (const node of graph.nodes) {
    if (node.outputSchemaId === undefined) continue;
    if (schemaIds.has(node.outputSchemaId)) continue;

    violations.push({
      severity: 'error',
      code: 'DANGLING_SCHEMA',
      message: `Node '${node.id}' references non-existent outputSchema '${node.outputSchemaId}'.`,
      nodeIds: [node.id],
    });
  }

  return violations;
}

/* ------------------------------------------------------------------ */
/*  checkDanglingFallbacks                                             */
/* ------------------------------------------------------------------ */

export function checkDanglingFallbacks(graph: Graph): Violation[] {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const violations: Violation[] = [];

  for (const node of graph.nodes) {
    if (node.fallbackNodeId === undefined) continue;
    if (nodeIds.has(node.fallbackNodeId)) continue;

    violations.push({
      severity: 'error',
      code: 'DANGLING_FALLBACK',
      message: `Node '${node.id}' has fallbackNodeId referencing non-existent node '${node.fallbackNodeId}'.`,
      nodeIds: [node.id],
    });
  }

  return violations;
}

/* ------------------------------------------------------------------ */
/*  checkGlobalNodeTools                                               */
/* ------------------------------------------------------------------ */

function hasToolCallOutboundEdge(nodeId: string, edges: Edge[]): boolean {
  return edges.some((e) => e.from === nodeId && (e.preconditions ?? []).some((p) => p.type === 'tool_call'));
}

export function checkGlobalNodeTools(graph: Graph): Violation[] {
  const violations: Violation[] = [];

  for (const node of graph.nodes) {
    if (!node.global) continue;
    if (hasToolCallOutboundEdge(node.id, graph.edges)) continue;

    violations.push({
      severity: 'warning',
      code: 'GLOBAL_NODE_MISSING_TOOL',
      message: `Global node '${node.id}' has no outbound edge with a tool_call precondition.`,
      nodeIds: [node.id],
    });
  }

  return violations;
}
