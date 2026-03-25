import type { Edge, Graph, Node, Operation, Precondition } from '@daviddh/graph-types';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface ContextFlagUsage {
  flag: string;
  edges: Array<{ from: string; to: string; jumpTo: string | undefined }>;
}

export interface McpToolUsage {
  toolName: string;
  edges: Array<{ from: string; to: string }>;
}

/* ------------------------------------------------------------------ */
/*  Clone node helpers                                                  */
/* ------------------------------------------------------------------ */

export function buildCloneNodeOps(source: Node, newId: string): Operation[] {
  return [
    {
      type: 'insertNode',
      data: {
        nodeId: newId,
        text: source.text,
        kind: source.kind,
        description: source.description,
        agent: source.agent,
        nextNodeIsUser: source.nextNodeIsUser,
        fallbackNodeId: source.fallbackNodeId,
        global: source.global,
        outputSchemaId: source.outputSchemaId,
        outputPrompt: source.outputPrompt,
      },
    },
  ];
}

export function buildCloneEdgeOps(sourceId: string, newId: string, edges: Edge[]): Operation[] {
  return edges
    .filter((e) => e.from === sourceId)
    .map((e) => ({
      type: 'insertEdge' as const,
      data: {
        from: newId,
        to: e.to,
        preconditions: e.preconditions,
        contextPreconditions: e.contextPreconditions,
      },
    }));
}

/* ------------------------------------------------------------------ */
/*  Insert node between helpers                                         */
/* ------------------------------------------------------------------ */

export function buildInsertBetweenOps(
  from: string,
  to: string,
  newNode: NewNodeInput,
  inheritedPreconditions: Precondition[] | undefined
): Operation[] {
  return [
    { type: 'deleteEdge', from, to },
    {
      type: 'insertNode',
      data: {
        nodeId: newNode.id,
        text: newNode.text,
        kind: newNode.kind,
        description: newNode.description,
        agent: newNode.agent,
      },
    },
    {
      type: 'insertEdge',
      data: { from, to: newNode.id, preconditions: inheritedPreconditions },
    },
    {
      type: 'insertEdge',
      data: { from: newNode.id, to },
    },
  ];
}

export interface NewNodeInput {
  id: string;
  text: string;
  kind: 'agent' | 'agent_decision';
  description?: string;
  agent?: string;
}

/* ------------------------------------------------------------------ */
/*  Swap edge target helpers                                            */
/* ------------------------------------------------------------------ */

export function buildSwapEdgeOps(from: string, oldTo: string, newTo: string, edge: Edge): Operation[] {
  return [
    { type: 'deleteEdge', from, to: oldTo },
    {
      type: 'insertEdge',
      data: {
        from,
        to: newTo,
        preconditions: edge.preconditions,
        contextPreconditions: edge.contextPreconditions,
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  listContextFlags helpers                                            */
/* ------------------------------------------------------------------ */

export function extractFlagUsages(graph: Graph): ContextFlagUsage[] {
  const flagMap = new Map<string, Array<{ from: string; to: string; jumpTo: string | undefined }>>();

  for (const edge of graph.edges) {
    const flags = edge.contextPreconditions?.preconditions ?? [];
    const jumpTo = edge.contextPreconditions?.jumpTo;
    for (const flag of flags) {
      const existing = flagMap.get(flag) ?? [];
      existing.push({ from: edge.from, to: edge.to, jumpTo });
      flagMap.set(flag, existing);
    }
  }

  return Array.from(flagMap.entries()).map(([flag, edges]) => ({ flag, edges }));
}

/* ------------------------------------------------------------------ */
/*  getMcpToolUsage helpers                                             */
/* ------------------------------------------------------------------ */

function extractToolName(value: string): string {
  return value;
}

export function extractMcpToolUsages(graph: Graph): McpToolUsage[] {
  const toolMap = new Map<string, Array<{ from: string; to: string }>>();

  for (const edge of graph.edges) {
    const toolPreconditions = (edge.preconditions ?? []).filter((p) => p.type === 'tool_call');
    for (const p of toolPreconditions) {
      const tool = extractToolName(p.value);
      const existing = toolMap.get(tool) ?? [];
      existing.push({ from: edge.from, to: edge.to });
      toolMap.set(tool, existing);
    }
  }

  return Array.from(toolMap.entries()).map(([toolName, edges]) => ({ toolName, edges }));
}

/* ------------------------------------------------------------------ */
/*  scaffoldAgentDomain helpers                                         */
/* ------------------------------------------------------------------ */

export type ScaffoldPattern = 'linear' | 'decision_tree' | 'tool_loop';

function buildLinearOps(domainKey: string): Operation[] {
  const entryId = `${domainKey}_Entry`;
  const step1Id = `${domainKey}_Step1`;
  const step2Id = `${domainKey}_End`;

  return [
    { type: 'insertAgent', data: { agentKey: domainKey, description: domainKey } },
    { type: 'insertNode', data: { nodeId: entryId, text: `${domainKey} entry`, kind: 'agent', agent: domainKey } },
    { type: 'insertNode', data: { nodeId: step1Id, text: `${domainKey} step`, kind: 'agent', agent: domainKey } },
    { type: 'insertNode', data: { nodeId: step2Id, text: `${domainKey} end`, kind: 'agent', agent: domainKey } },
    { type: 'insertEdge', data: { from: entryId, to: step1Id, preconditions: [{ type: 'user_said', value: 'continue' }] } },
    { type: 'insertEdge', data: { from: step1Id, to: step2Id, preconditions: [{ type: 'user_said', value: 'done' }] } },
  ];
}

function buildDecisionTreeOps(domainKey: string): Operation[] {
  const entryId = `${domainKey}_Entry`;
  const pathAId = `${domainKey}_PathA`;
  const pathBId = `${domainKey}_PathB`;

  return [
    { type: 'insertAgent', data: { agentKey: domainKey, description: domainKey } },
    { type: 'insertNode', data: { nodeId: entryId, text: `${domainKey} decision`, kind: 'agent_decision', agent: domainKey } },
    { type: 'insertNode', data: { nodeId: pathAId, text: `${domainKey} path A`, kind: 'agent', agent: domainKey } },
    { type: 'insertNode', data: { nodeId: pathBId, text: `${domainKey} path B`, kind: 'agent', agent: domainKey } },
    { type: 'insertEdge', data: { from: entryId, to: pathAId, preconditions: [{ type: 'agent_decision', value: 'path_a' }] } },
    { type: 'insertEdge', data: { from: entryId, to: pathBId, preconditions: [{ type: 'agent_decision', value: 'path_b' }] } },
  ];
}

function buildToolLoopOps(domainKey: string): Operation[] {
  const entryId = `${domainKey}_Entry`;
  const toolId = `${domainKey}_Tool`;
  const processId = `${domainKey}_Process`;

  return [
    { type: 'insertAgent', data: { agentKey: domainKey, description: domainKey } },
    { type: 'insertNode', data: { nodeId: entryId, text: `${domainKey} entry`, kind: 'agent', agent: domainKey } },
    { type: 'insertNode', data: { nodeId: toolId, text: `${domainKey} tool call`, kind: 'agent', agent: domainKey } },
    { type: 'insertNode', data: { nodeId: processId, text: `${domainKey} process`, kind: 'agent', agent: domainKey } },
    { type: 'insertEdge', data: { from: entryId, to: toolId, preconditions: [{ type: 'user_said', value: 'start' }] } },
    { type: 'insertEdge', data: { from: toolId, to: processId, preconditions: [{ type: 'tool_call', value: `${domainKey}_tool` }] } },
    { type: 'insertEdge', data: { from: processId, to: toolId, preconditions: [{ type: 'user_said', value: 'retry' }] } },
  ];
}

export function buildScaffoldOps(domainKey: string, pattern: ScaffoldPattern): Operation[] {
  if (pattern === 'decision_tree') return buildDecisionTreeOps(domainKey);
  if (pattern === 'tool_loop') return buildToolLoopOps(domainKey);
  return buildLinearOps(domainKey);
}
