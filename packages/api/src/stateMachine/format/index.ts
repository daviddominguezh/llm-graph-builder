import { FIRST_INDEX, INCREMENT_BY_ONE } from '@src/constants/index.js';
import type { Edge, Graph, Precondition } from '@src/types/graph.js';
import type { Context } from '@src/types/tools.js';

import { getEdgesFromNode, getNode, getNodeDescription } from '../graph/index.js';
import { insertValuesInText } from './utils.js';

const getPreconditionPrefix = (type: string): string => {
  if (type === 'user_said') return 'the user says something similar to';
  if (type === 'tool_call') return 'execute the tool';
  return '';
};

export const formatPrecondition = (precondition: Precondition): string => {
  const prefix = getPreconditionPrefix(precondition.type);
  if (prefix === '') return precondition.value;
  return `${prefix} "${precondition.value}"`;
};

interface FormatOptionParams {
  index: number;
  description?: string;
  nodeText?: string;
  example?: string;
  precondition?: Precondition;
}

export const formatOption = (params: FormatOptionParams): string => {
  const { index, description, nodeText, example, precondition } = params;
  const parts: string[] = [];
  parts.push(`**Option ${index}** — \`nextNodeID: ${index}\``);
  const label = description !== undefined && description !== '' ? description : nodeText;
  if (label !== undefined && label !== '') {
    parts.push(`Description: ${label}`);
  }
  if (precondition !== undefined) {
    parts.push(`Select when: ${formatPrecondition(precondition)}`);
  }
  if (example !== undefined && example !== '') {
    const escapedExample = example.replace(/\n/gv, '\\n');
    parts.push(`Response: ${escapedExample}`);
  }
  return parts.join('\n');
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

interface ConvertEdgeParams {
  graph: Graph;
  context: Context;
  index: number;
  edge: Edge;
  isAgentDecision?: boolean;
}

export const convertEdgeToStr = async (
  params: ConvertEdgeParams
): Promise<{ withPreconditions: string; withoutToolPreconditions: string }> => {
  const { graph, context, index, edge, isAgentDecision } = params;
  const { to } = edge;
  const node = getNode(graph, to);
  const description = getNodeDescription(graph, edge.to);
  const { [FIRST_INDEX]: firstPrecondition } = edge.preconditions ?? [];
  let example: string | undefined = undefined;

  if (isAgentDecision !== true && node.nextNodeIsUser === true) {
    example = insertValuesInText(context, node.text);
    await getUserSaidExamples(graph, context, node.id);
  }

  const optionDescription = isAgentDecision === true ? undefined : description;
  const optionNodeText = isAgentDecision === true ? undefined : node.text;

  const withPreconditions = formatOption({
    index,
    description: optionDescription,
    nodeText: optionNodeText,
    example,
    precondition: firstPrecondition,
  });

  const nonToolPrecondition =
    edge.preconditions === undefined ? undefined : edge.preconditions.find((pre) => pre.type !== 'tool_call');

  const withoutToolPreconditions = formatOption({
    index,
    description: optionDescription,
    nodeText: optionNodeText,
    example,
    precondition: nonToolPrecondition,
  });

  return { withPreconditions, withoutToolPreconditions };
};

export const convertEdgesToStr = async (
  graph: Graph,
  context: Context,
  edges: Edge[],
  isAgentDecision?: boolean
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
      const res = await convertEdgeToStr({ graph, context, index: edgeIndex, edge, isAgentDecision });
      return { index: edgeIndex, res, to: edge.to };
    })
  );

  edgeResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      const { value: resultValue } = result;
      const { index, res, to } = resultValue;
      nodes[index.toString()] = to;
      withPreconditions.push(res.withPreconditions);
      withoutToolPreconditions.push(res.withoutToolPreconditions);
    }
  });

  return {
    withPreconditions: withPreconditions.join('\n\n'),
    withoutToolPreconditions: withoutToolPreconditions.join('\n\n'),
    nodes,
  };
};
