import type { Tool, ToolChoice, ToolSet } from 'ai';

import { generateAllCloserTools } from '@src/ai/tools/index.js';
import { FIRST_INDEX } from '@src/constants/index.js';
import type { Edge, Graph, Node } from '@src/types/graph.js';
import {
  type EdgeTools,
  SKILL,
  SKILL_EDGES,
  SKILL_PRECONDITION,
  type ToolsByEdge,
} from '@src/types/stateMachine.js';
import type { Context } from '@src/types/tools.js';

import { CONTEXT_PRECONDITIONS } from './contextPreconditions.js';

// Type guard to validate the imported JSON structure
const isGraph = (obj: unknown): obj is Graph => {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  return (
    'startNode' in obj &&
    'nodes' in obj &&
    'edges' in obj &&
    typeof obj.startNode === 'string' &&
    Array.isArray(obj.nodes) &&
    Array.isArray(obj.edges)
  );
};

// JSON import with type validation
const STATE_MACHINE: Graph = isGraph(GraphJSON)
  ? GraphJSON
  : (() => {
      throw new Error('Invalid flow graph JSON');
    })();

export const getNode = (nodeID: string): Node => {
  if (nodeID === '') {
    throw new Error('No nodeID provided');
  }
  const id = nodeID.trim();
  if (id.length === FIRST_INDEX) {
    throw new Error('No nodeID provided');
  }
  const node = STATE_MACHINE.nodes.find((mNode) => mNode.id.trim() === id);
  if (node === undefined) {
    throw new Error(`No node found with id ${id}`);
  }
  return node;
};

export const getNodeDescription = (nodeID: string): string | undefined => getNode(nodeID).description;

export const populateSkillEdges = (from: string, edges: Edge[]): Edge[] => {
  const skills: SKILL[] = [SKILL.ReplyUserRequestForInfo];

  for (const skill of skills) {
    const { [skill]: skillEdgeTarget } = SKILL_EDGES;
    const targetStr = skillEdgeTarget.toString();
    const existingEdge = edges.find((edge) => edge.to === targetStr);
    if (existingEdge === undefined) {
      edges.push({
        from,
        to: skillEdgeTarget,
        preconditions: [SKILL_PRECONDITION[skill]],
      });
    }
  }

  return edges;
};

export const getToolsFromEdge = (allTools: Record<string, Tool>, edge: Edge): EdgeTools => {
  const edgeTools: EdgeTools = {
    tools: undefined,
    toolChoice: undefined,
  };
  if (edge.preconditions === undefined) {
    return edgeTools;
  }
  const toolCall = edge.preconditions.find((precondition) => precondition.type === 'tool_call');
  if (toolCall === undefined) {
    return edgeTools;
  }

  const { value: toolName } = toolCall;
  const { [toolName]: closerMatchingTool } = allTools;

  if (closerMatchingTool === undefined) {
    throw new Error(`No tool found with name ${toolName}`);
  }

  const tools: ToolSet = {
    [toolName]: closerMatchingTool,
  };
  const toolChoice: ToolChoice<NoInfer<ToolSet>> = {
    type: 'tool',
    toolName,
  };

  return {
    tools,
    toolChoice,
  };
};

export const getToolsFromEdges = (context: Context, edges: Edge[], isTest = false): ToolsByEdge => {
  const genTools = generateAllCloserTools(context, isTest);
  const tools: ToolsByEdge = {};
  for (const edge of edges) {
    tools[edge.to] = getToolsFromEdge(genTools, edge);
  }
  return tools;
};

const isValidContextPrecondition = (prec: string): prec is ContextPrecondition =>
  prec in CONTEXT_PRECONDITIONS;

const evaluatePreconditions = async (context: Context, preconditions: string[]): Promise<boolean> => {
  const validPreconditions = preconditions.filter(isValidContextPrecondition);
  const preconditionFns = validPreconditions.map((prec) => CONTEXT_PRECONDITIONS[prec]);

  const results = await Promise.allSettled(preconditionFns.map(async (func) => await func(context)));

  const anyFailed = results.find((res) => res.status !== 'fulfilled');
  if (anyFailed !== undefined) {
    return false;
  }

  const fulfilledResults = results.filter(
    (res): res is PromiseFulfilledResult<boolean> => res.status === 'fulfilled'
  );
  return fulfilledResults.every((res) => res.value);
};

const evaluateEdge = async (context: Context, edge: Edge): Promise<{ edge: Edge; isValid: boolean }> => {
  if (
    edge.contextPreconditions?.preconditions === undefined ||
    edge.contextPreconditions.preconditions.length === FIRST_INDEX
  ) {
    return { edge, isValid: true };
  }

  const {
    contextPreconditions: { preconditions },
  } = edge;
  const allPassed = await evaluatePreconditions(context, preconditions);
  return { edge, isValid: allPassed };
};

export const getEdgesFromNode = async (context: Context, nodeID: string): Promise<Edge[]> => {
  const node = getNode(nodeID);
  const mEdges = STATE_MACHINE.edges.filter((edge) => edge.from === node.id);

  const edgeEvaluations = await Promise.allSettled(
    mEdges.map(async (edge) => await evaluateEdge(context, edge))
  );

  const edges = edgeEvaluations
    .filter(
      (result): result is PromiseFulfilledResult<{ edge: Edge; isValid: boolean }> =>
        result.status === 'fulfilled'
    )
    .filter((result) => result.value.isValid)
    .map((result) => result.value.edge);

  if (edges.length === FIRST_INDEX) {
    return [];
  }
  if (node.nextNodeIsUser === false) {
    return edges;
  }
  return populateSkillEdges(nodeID, edges);
};
