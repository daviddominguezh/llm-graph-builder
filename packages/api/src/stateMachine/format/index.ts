import { FIRST_INDEX, INCREMENT_BY_ONE } from '@src/constants/index.js';
import type { Edge, Graph, Precondition } from '@src/types/graph.js';
import {
  EDGE_SKILLS,
  SKILL_DESCRIPTIONS,
  SKILL_PRECONDITION,
  SPECIAL_EDGE,
} from '@src/types/stateMachine.js';
import type { Context } from '@src/types/tools.js';

import { getEdgesFromNode, getNode, getNodeDescription } from '../graph/index.js';
import { insertValuesInText } from './utils.js';

const getPreconditionPrefix = (type: string): string => {
  if (type === 'user_said') {
    return 'Select this option when the user says something similar to';
  }
  if (type === 'agent_decision') {
    return 'Select this option when';
  }
  if (type === 'tool_call') {
    return 'This node will execute the tool';
  }
  return type;
};

export const formatPrecondition = (precondition: Precondition): string => {
  const { type } = precondition;
  const preffix = getPreconditionPrefix(type);
  return `${preffix}: "${precondition.value}"`;
};

interface FormatOptionParams {
  index: number;
  description?: string;
  example?: string;
  precondition?: Precondition;
}

export const formatOption = (params: FormatOptionParams): string => {
  const { index, description, example, precondition } = params;
  const parts: string[] = [];
  parts.push(`- **nextNodeID**: ${index}`);
  if (precondition !== undefined) {
    parts.push(`- **Precondition**: ${formatPrecondition(precondition)}`);
  }
  if (description !== undefined && description !== '') {
    parts.push(`- **Purpose**: ${description}`);
  }
  if (example !== undefined && example !== '') {
    const escapedExample = example.replace(/\n/gv, '\\n');
    parts.push(`- **Response example**: ${escapedExample}`);
  }
  return parts.join('\n').trim();
};

export const convertEspecialEdgeToStr = (
  index: number,
  edge: SPECIAL_EDGE
): { withPreconditions: string; withoutToolPreconditions: string } => {
  const { [edge]: skill } = EDGE_SKILLS;
  return {
    withPreconditions: formatOption({
      index,
      description: SKILL_DESCRIPTIONS[skill].value,
      precondition: SKILL_PRECONDITION[skill],
    }),
    withoutToolPreconditions: formatOption({
      index,
      description: SKILL_DESCRIPTIONS[skill].value,
    }),
  };
};

const getUserSaidExamples = async (
  graph: Graph,
  context: Context,
  nodeId: string
): Promise<string | undefined> => {
  const edges = await getEdgesFromNode(graph, context, nodeId);
  const userEdges = edges.filter(
    (mEdge) => (mEdge.preconditions ?? []).filter((pre) => pre.type === 'user_said').length > FIRST_INDEX
  );
  const userSaid = userEdges
    .map((mEdge) => (mEdge.preconditions ?? [])[FIRST_INDEX]?.value)
    .filter((value): value is string => value !== undefined);
  if (userSaid.length > FIRST_INDEX) {
    return `\n  - ${userSaid.join('\n  - ')}`;
  }
  return undefined;
};

export const convertEdgeToStr = async (
  graph: Graph,
  context: Context,
  index: number,
  edge: Edge
): Promise<{ withPreconditions: string; withoutToolPreconditions: string }> => {
  const { to } = edge;
  if (to === 'AnswerBusinessQuestion') {
    return convertEspecialEdgeToStr(index, SPECIAL_EDGE.AnswerBusinessQuestion);
  }
  const node = getNode(graph, to);
  const description = getNodeDescription(graph, edge.to);
  const { [FIRST_INDEX]: firstPrecondition } = edge.preconditions ?? [];
  let example: string | undefined = undefined;

  if (node.nextNodeIsUser === true) {
    example = insertValuesInText(context, node.text);
    await getUserSaidExamples(graph, context, node.id);
  }

  const withPreconditions = formatOption({
    index,
    description,
    example,
    precondition: firstPrecondition,
  });

  const nonToolPrecondition =
    edge.preconditions === undefined ? undefined : edge.preconditions.find((pre) => pre.type !== 'tool_call');

  const withoutToolPreconditions = formatOption({
    index,
    description,
    example,
    precondition: nonToolPrecondition,
  });

  return { withPreconditions, withoutToolPreconditions };
};

export const convertEdgesToStr = async (
  graph: Graph,
  context: Context,
  edges: Edge[]
): Promise<{
  withPreconditions: string;
  withoutToolPreconditions: string;
  nodes: Record<string, string>;
}> => {
  const withPreconditions: string[] = [];
  const withoutToolPreconditions: string[] = [];

  const nodes: Record<string, string> = {};

  const edgeResults = await Promise.allSettled(
    edges.map(async (edge, i) => {
      const edgeIndex = i + INCREMENT_BY_ONE;
      const res = await convertEdgeToStr(graph, context, edgeIndex, edge);
      return { index: edgeIndex, res, to: edge.to };
    })
  );

  edgeResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      const { value: resultValue } = result;
      const { index, res, to } = resultValue;
      nodes[index.toString()] = to;
      withPreconditions.push(`### Option ${index}:\n${res.withPreconditions}`);
      withoutToolPreconditions.push(`### Option ${index}:\n${res.withoutToolPreconditions}`);
    }
  });

  return {
    withPreconditions: withPreconditions.join('\n\n'),
    withoutToolPreconditions: withoutToolPreconditions.join('\n\n'),
    nodes,
  };
};
