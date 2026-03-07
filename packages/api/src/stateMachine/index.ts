import type { Tool } from 'ai';

import { FIRST_INDEX, INCREMENT_BY_ONE, INITIAL_STEP_NODE } from '@src/constants/index.js';
import type { Graph } from '@src/types/graph.js';
import type { SMConfig, SMNextOptions } from '@src/types/stateMachine.js';
import type { Context } from '@src/types/tools.js';
import type { Logger } from '@src/utils/logger.js';
import { setLogger } from '@src/utils/logger.js';

import { convertEdgesToStr } from './format/index.js';
import { addNodeSpecificPrompts } from './format/utils.js';
import { getEdgesFromNode, getNode, getToolsFromEdges } from './graph/index.js';
import {
  SM_BASE_PROMPT_NEXT_OPTIONS,
  SM_BASE_PROMPT_NEXT_OPTION_IS_AGENT_DECISION,
  SM_BASE_PROMPT_NEXT_OPTION_IS_TOOL,
  buildOutputFormatPrompt,
} from './prompts/index.js';

const createTerminalNodeOptions = (
  node: ReturnType<typeof getNode>,
  nodes: Record<string, string>
): SMNextOptions => ({
  node,
  edges: [],
  prompt: 'This is a terminal node with no further actions.',
  promptWithoutToolPreconditions: 'This is a terminal node with no further actions.',
  toolsByEdge: {},
  kind: 'user_reply' as const,
  nodes,
});

interface BuildToolCallOptionsParams {
  node: ReturnType<typeof getNode>;
  edges: SMNextOptions['edges'];
  toolsByEdge: SMNextOptions['toolsByEdge'];
  nodes: Record<string, string>;
  toolCallValue: string;
  toolDescription: string | undefined;
  nextNode: string;
}

const buildToolCallOptions = (params: BuildToolCallOptionsParams): SMNextOptions => {
  const { node, edges, toolsByEdge, nodes, toolCallValue, toolDescription, nextNode } = params;
  let prompt = SM_BASE_PROMPT_NEXT_OPTION_IS_TOOL.replaceAll('{toolName}', `"${toolCallValue}"`);
  if (toolDescription !== undefined && toolDescription !== '') {
    prompt += `\n\n${toolDescription}\n\n Call the tool {toolName} RIGHT NOW.`.replaceAll(
      '{toolName}',
      `"${toolCallValue}"`
    );
  }
  return {
    node,
    edges,
    prompt,
    promptWithoutToolPreconditions: prompt,
    toolsByEdge,
    nextNode,
    kind: 'tool_call',
    nodes,
  };
};

interface BuildAgentDecisionOptionsParams {
  node: ReturnType<typeof getNode>;
  edges: SMNextOptions['edges'];
  nodes: Record<string, string>;
  withPreconditions: string;
}

const buildAgentDecisionOptions = (params: BuildAgentDecisionOptionsParams): SMNextOptions => ({
  node: params.node,
  edges: params.edges,
  prompt: `${SM_BASE_PROMPT_NEXT_OPTION_IS_AGENT_DECISION}\n\n${params.withPreconditions}`,
  promptWithoutToolPreconditions: `${SM_BASE_PROMPT_NEXT_OPTION_IS_AGENT_DECISION}\n\n${params.withPreconditions}`,
  toolsByEdge: {},
  kind: 'agent_decision',
  nodes: params.nodes,
});

interface BuildUserReplyOptionsParams {
  node: ReturnType<typeof getNode>;
  edges: SMNextOptions['edges'];
  nodes: Record<string, string>;
  mPrompt: string;
  mPromptWithoutToolPreconditions: string;
}

const buildUserReplyOptions = (params: BuildUserReplyOptionsParams): SMNextOptions => ({
  node: params.node,
  edges: params.edges,
  prompt: params.mPrompt,
  promptWithoutToolPreconditions: params.mPromptWithoutToolPreconditions,
  toolsByEdge: {},
  kind: 'user_reply' as const,
  nodes: params.nodes,
});

export const getNextOptions = async (
  graph: Graph,
  context: Context,
  currentNode: string,
  toolsOverride?: Record<string, Tool>
): Promise<SMNextOptions> => {
  const node = getNode(graph, currentNode);
  const edges = await getEdgesFromNode(graph, context, currentNode);
  const toolsByEdge = getToolsFromEdges(context, edges, toolsOverride);

  if (edges.length === FIRST_INDEX) return createTerminalNodeOptions(node, {});

  const { [FIRST_INDEX]: firstEdgeEntry } = edges;
  if (firstEdgeEntry === undefined) return createTerminalNodeOptions(node, {});

  const firstEdge = firstEdgeEntry.preconditions ?? [];
  const toolCall = firstEdge.find((edge) => edge.type === 'tool_call');
  const agentDecision = firstEdge.find((edge) => edge.type === 'agent_decision');

  const { withPreconditions, withoutToolPreconditions, nodes } = await convertEdgesToStr(
    graph,
    context,
    edges
  );

  const mPrompt = `${SM_BASE_PROMPT_NEXT_OPTIONS}\n\n${withPreconditions}`;
  const mPromptWithoutToolPreconditions = `${SM_BASE_PROMPT_NEXT_OPTIONS}\n\n${withoutToolPreconditions}`;

  if (toolCall !== undefined) {
    return buildToolCallOptions({
      node,
      edges,
      toolsByEdge,
      nodes,
      toolCallValue: toolCall.value,
      toolDescription: toolCall.description,
      nextNode: firstEdgeEntry.to,
    });
  }

  if (agentDecision !== undefined) {
    return buildAgentDecisionOptions({ node, edges, nodes, withPreconditions });
  }

  return buildUserReplyOptions({ node, edges, nodes, mPrompt, mPromptWithoutToolPreconditions });
};

// TODO: Implement
export const generateUserContextPrompt = (context: Context): string | null => '';

const buildDecisionFallback = (edges: SMNextOptions['edges'], fallbackNodeId?: string): string => {
  const fallbackIndex = resolveFallbackIndex(edges, fallbackNodeId);
  return `**Fallback** — \`nextNodeID: ${fallbackIndex}\`\nIf unclear, default to Option ${fallbackIndex}.`;
};

const resolveFallbackIndex = (edges: SMNextOptions['edges'], fallbackNodeId?: string): number => {
  if (fallbackNodeId === undefined) return INCREMENT_BY_ONE;
  const index = edges.findIndex((e) => e.to === fallbackNodeId);
  return index >= FIRST_INDEX ? index + INCREMENT_BY_ONE : INCREMENT_BY_ONE;
};

const buildEdgeIds = (edges: SMNextOptions['edges']): string =>
  edges.map((_, i) => i + INCREMENT_BY_ONE).join('|');

interface AppendKindParams {
  kind: SMNextOptions['kind'];
  edges: SMNextOptions['edges'];
  basePrompt: string;
  basePromptWithoutTools: string;
  fallbackNodeId?: string;
}

const appendKindSpecificPrompts = (
  params: AppendKindParams
): { prompt: string; promptWithoutTools: string } => {
  const { kind, edges, basePrompt, basePromptWithoutTools, fallbackNodeId } = params;
  if (kind === 'agent_decision') {
    const fallback = buildDecisionFallback(edges, fallbackNodeId);
    const outputFormat = buildOutputFormatPrompt(buildEdgeIds(edges));
    return {
      prompt: `${basePrompt}\n\n${fallback}\n\n${outputFormat}`,
      promptWithoutTools: `${basePromptWithoutTools}\n\n${fallback}\n\n${outputFormat}`,
    };
  }
  if (kind === 'user_reply') {
    const outputFormat = buildOutputFormatPrompt(buildEdgeIds(edges));
    return {
      prompt: `${basePrompt}\n\n${outputFormat}`,
      promptWithoutTools: `${basePromptWithoutTools}\n\n${outputFormat}`,
    };
  }
  return { prompt: basePrompt, promptWithoutTools: basePromptWithoutTools };
};

export const buildNextAgentConfig = async (
  graph: Graph,
  context: Context,
  cn?: string,
  options?: { logger?: Logger; toolsOverride?: Record<string, Tool> }
): Promise<SMConfig> => {
  if (options?.logger !== undefined) setLogger(options.logger);
  const currentNode = cn ?? INITIAL_STEP_NODE;
  const nextOptions = await getNextOptions(graph, context, currentNode, options?.toolsOverride);

  const { kind } = nextOptions;
  const { prompt: mPrompt, promptWithoutTools: mPromptWithoutToolPreconditions } = appendKindSpecificPrompts({
    kind,
    edges: nextOptions.edges,
    basePrompt: nextOptions.prompt,
    basePromptWithoutTools: nextOptions.promptWithoutToolPreconditions,
    fallbackNodeId: nextOptions.node.fallbackNodeId,
  });

  const userContext = generateUserContextPrompt(context);
  const finalPrompt = userContext === null ? mPrompt : `${mPrompt}\n\n${userContext}`;
  const finalPromptWithoutTools =
    userContext === null
      ? mPromptWithoutToolPreconditions
      : `${mPromptWithoutToolPreconditions}\n\n${userContext}`;

  const promptConfig: SMConfig = {
    node: nextOptions.node,
    prompt: finalPrompt,
    promptWithoutToolPreconditions: finalPromptWithoutTools,
    toolsByEdge: nextOptions.toolsByEdge,
    nextNode: nextOptions.nextNode,
    kind: nextOptions.kind,
    nodes: nextOptions.nodes,
  };

  promptConfig.promptWithoutToolPreconditions = addNodeSpecificPrompts(
    graph,
    context,
    currentNode,
    promptConfig.prompt
  );

  return promptConfig;
};
