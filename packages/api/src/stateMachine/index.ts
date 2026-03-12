import type { Tool } from 'ai';

import { FIRST_INDEX, INCREMENT_BY_ONE, INITIAL_STEP_NODE } from '@src/constants/index.js';
import type { Graph, ToolFieldValue } from '@src/types/graph.js';
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
import { buildResolvedFieldsPrompt } from './referenceResolver.js';
import { buildStructuredOutputOptions, hasOutputSchema } from './structuredOutputOptions.js';

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
  toolFields: Record<string, ToolFieldValue> | undefined;
  nextNode: string;
  structuredOutputs?: Record<string, unknown[]>;
}

function buildFixedFieldsPrompt(
  toolFields: Record<string, ToolFieldValue> | undefined,
  structuredOutputs?: Record<string, unknown[]>
): string {
  if (toolFields === undefined) return '';
  return buildResolvedFieldsPrompt(toolFields, structuredOutputs ?? {});
}

const buildToolCallOptions = (params: BuildToolCallOptionsParams): SMNextOptions => {
  const { node, edges, toolsByEdge, nodes, toolCallValue, toolDescription, toolFields, nextNode } = params;
  let prompt = SM_BASE_PROMPT_NEXT_OPTION_IS_TOOL.replaceAll('{toolName}', `"${toolCallValue}"`);
  if (toolDescription !== undefined && toolDescription !== '') {
    prompt += `\n\n${toolDescription}\n\n Call the tool {toolName} RIGHT NOW.`.replaceAll(
      '{toolName}',
      `"${toolCallValue}"`
    );
  }
  prompt += buildFixedFieldsPrompt(toolFields, params.structuredOutputs);
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

interface GetNextOptionsParams {
  toolsOverride?: Record<string, Tool>;
  structuredOutputs?: Record<string, unknown[]>;
}

interface StandardEdgeContext {
  node: ReturnType<typeof getNode>;
  edges: SMNextOptions['edges'];
  toolsByEdge: SMNextOptions['toolsByEdge'];
  nodes: Record<string, string>;
  withPreconditions: string;
  withoutToolPreconditions: string;
  firstEdgeEntry: SMNextOptions['edges'][number];
  structuredOutputs?: Record<string, unknown[]>;
}

function buildStandardEdgeOptions(ctx: StandardEdgeContext): SMNextOptions {
  const { node, edges, toolsByEdge, nodes, withPreconditions, withoutToolPreconditions } = ctx;
  const { firstEdgeEntry, structuredOutputs } = ctx;
  const firstEdge = firstEdgeEntry.preconditions ?? [];
  const toolCall = firstEdge.find((edge) => edge.type === 'tool_call');
  const agentDecision = firstEdge.find((edge) => edge.type === 'agent_decision');
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
      toolFields: toolCall.toolFields,
      nextNode: firstEdgeEntry.to,
      structuredOutputs,
    });
  }
  if (agentDecision !== undefined) {
    return buildAgentDecisionOptions({ node, edges, nodes, withPreconditions });
  }
  return buildUserReplyOptions({ node, edges, nodes, mPrompt, mPromptWithoutToolPreconditions });
}

async function resolveEdgeOptions(
  graph: Graph,
  context: Context,
  currentNode: string,
  params: GetNextOptionsParams
): Promise<SMNextOptions> {
  const node = getNode(graph, currentNode);

  if (hasOutputSchema(node)) {
    const edges = await getEdgesFromNode(graph, context, currentNode);
    return buildStructuredOutputOptions(node, edges);
  }

  const edges = await getEdgesFromNode(graph, context, currentNode);
  const toolsByEdge = getToolsFromEdges(context, edges, params.toolsOverride);

  if (edges.length === FIRST_INDEX) return createTerminalNodeOptions(node, {});
  const { [FIRST_INDEX]: firstEdgeEntry } = edges;
  if (firstEdgeEntry === undefined) return createTerminalNodeOptions(node, {});

  const firstPreconditions = firstEdgeEntry.preconditions ?? [];
  const isAgentDecision = firstPreconditions.some((p) => p.type === 'agent_decision');
  const { withPreconditions, withoutToolPreconditions, nodes } = await convertEdgesToStr(
    graph,
    context,
    edges,
    isAgentDecision
  );
  return buildStandardEdgeOptions({
    node,
    edges,
    toolsByEdge,
    nodes,
    withPreconditions,
    withoutToolPreconditions,
    firstEdgeEntry,
    structuredOutputs: params.structuredOutputs,
  });
}

export const getNextOptions = async (
  graph: Graph,
  context: Context,
  currentNode: string,
  opts?: GetNextOptionsParams
): Promise<SMNextOptions> => await resolveEdgeOptions(graph, context, currentNode, opts ?? {});

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

function applyUserContext(prompt: string, userContext: string | null): string {
  return userContext === null ? prompt : `${prompt}\n\n${userContext}`;
}

function buildPromptConfig(
  graph: Graph,
  context: Context,
  currentNode: string,
  nextOptions: SMNextOptions
): SMConfig {
  const { prompt: mPrompt, promptWithoutTools: mPromptWithoutTools } = appendKindSpecificPrompts({
    kind: nextOptions.kind,
    edges: nextOptions.edges,
    basePrompt: nextOptions.prompt,
    basePromptWithoutTools: nextOptions.promptWithoutToolPreconditions,
    fallbackNodeId: nextOptions.node.fallbackNodeId,
  });
  const userContext = generateUserContextPrompt(context);
  const config: SMConfig = {
    node: nextOptions.node,
    prompt: applyUserContext(mPrompt, userContext),
    promptWithoutToolPreconditions: applyUserContext(mPromptWithoutTools, userContext),
    toolsByEdge: nextOptions.toolsByEdge,
    nextNode: nextOptions.nextNode,
    kind: nextOptions.kind,
    nodes: nextOptions.nodes,
    outputSchema: nextOptions.outputSchema,
  };
  config.promptWithoutToolPreconditions = addNodeSpecificPrompts(graph, context, currentNode, config.prompt);
  return config;
}

export const buildNextAgentConfig = async (
  graph: Graph,
  context: Context,
  cn?: string,
  options?: {
    logger?: Logger;
    toolsOverride?: Record<string, Tool>;
    structuredOutputs?: Record<string, unknown[]>;
  }
): Promise<SMConfig> => {
  if (options?.logger !== undefined) setLogger(options.logger);
  const currentNode = cn ?? INITIAL_STEP_NODE;
  const nextOptions = await getNextOptions(graph, context, currentNode, {
    toolsOverride: options?.toolsOverride,
    structuredOutputs: options?.structuredOutputs,
  });
  return buildPromptConfig(graph, context, currentNode, nextOptions);
};
