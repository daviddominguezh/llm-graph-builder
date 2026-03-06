import { addNodeSpecificPrompts } from '@src/ai/actions/callAgent/nodeProcessor.js';

import { FIRST_INDEX, INCREMENT_BY_ONE, INITIAL_STEP_NODE } from '@constants/index.js';

import type { SMNextOptions, SMPrompt } from '@globalTypes/ai/stateMachine.js';
import type { Context } from '@globalTypes/ai/tools.js';

import { convertEdgesToStr } from './format/index.js';
import { getEdgesFromNode, getNode, getToolsFromEdges } from './graph/index.js';
import {
  AGENT_DECISION_PROMPT,
  REPLY_PROMPT,
  SM_BASE_PROMPT_NEXT_OPTIONS,
  SM_BASE_PROMPT_NEXT_OPTION_IS_AGENT_DECISION,
  SM_BASE_PROMPT_NEXT_OPTION_IS_TOOL,
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
  context: Context,
  currentNode: string,
  isTest = false
): Promise<SMNextOptions> => {
  const node = getNode(currentNode);
  const edges = await getEdgesFromNode(context, currentNode);
  const toolsByEdge = getToolsFromEdges(context, edges, isTest);

  if (edges.length === FIRST_INDEX) {
    return createTerminalNodeOptions(node, {});
  }

  const { [FIRST_INDEX]: firstEdgeEntry } = edges;
  if (firstEdgeEntry === undefined) {
    return createTerminalNodeOptions(node, {});
  }

  const firstEdge = firstEdgeEntry.preconditions ?? [];
  const toolCall = firstEdge.find((edge) => edge.type === 'tool_call');
  const agentDecision = firstEdge.find((edge) => edge.type === 'agent_decision');

  const { withPreconditions, withoutToolPreconditions, nodes } = await convertEdgesToStr(context, edges);

  const availableNextNodeIDs = edges.map((_, i) => `- "${i + INCREMENT_BY_ONE}"`).join('\n');
  const nodeIdsSuffix = `\n\n**IMPORTANT**: The ONLY available nextNodeID's are:\n${availableNextNodeIDs}`;
  const mPrompt = `${SM_BASE_PROMPT_NEXT_OPTIONS}\n\n${withPreconditions}${nodeIdsSuffix}`;
  const mPromptWithoutToolPreconditions = `${SM_BASE_PROMPT_NEXT_OPTIONS}\n\n${withoutToolPreconditions}${nodeIdsSuffix}`;

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

export const generateUserContextPrompt = (context: Context): string | null => {
  const strings: string[] = [];
  const { businessName, businessDescription } = context.businessSetup.info;
  if (businessName !== '') {
    strings.push(`- Business Name: ${businessName}`);
  }
  if (businessDescription !== '') {
    strings.push(`- Business Context: ${businessDescription}`);
  }
  if (context.userName !== undefined && context.userName !== '') {
    strings.push(`- User Name: ${context.userName}`);
  }

  const userContext = strings.length === FIRST_INDEX ? null : strings.join('\n');
  if (userContext === null) {
    return userContext;
  }
  return `CONTEXT:\n${userContext}`;
};

const buildDecisionEnforcement = (edges: SMNextOptions['edges']): string => `

═══════════════════════════════════════
MANDATORY: JSON OUTPUT REQUIRED
═══════════════════════════════════════
## THE ONLY POSSIBLE NEXT NODE IDs ARE: [${edges.map((_, i) => i + INCREMENT_BY_ONE).join(', ')}]
## RETURN ONLY USING THIS JSON TEMPLATE:
{
  "nextNodeID": "Number of the nextNodeID",
  "messageToUser": "Message with acknowledgment of user's choice"
}

═══════════════════════════════════════
MANDATORY: REMEMBER YOU CAN NOT CALL ANY TOOL OR FUNCTION, DO NOT DO IT.
═══════════════════════════════════════`;

const appendKindSpecificPrompts = (
  kind: SMNextOptions['kind'],
  edges: SMNextOptions['edges'],
  basePrompt: string,
  basePromptWithoutTools: string
): { prompt: string; promptWithoutTools: string } => {
  if (kind === 'agent_decision') {
    const extraEnforcement = buildDecisionEnforcement(edges);
    return {
      prompt: `${basePrompt}\n\n${AGENT_DECISION_PROMPT}${extraEnforcement}`,
      promptWithoutTools: `${basePromptWithoutTools}\n\n${AGENT_DECISION_PROMPT}${extraEnforcement}`,
    };
  }
  if (kind === 'user_reply') {
    return {
      prompt: `${basePrompt}\n\n${REPLY_PROMPT}`,
      promptWithoutTools: `${basePromptWithoutTools}\n\n${REPLY_PROMPT}`,
    };
  }
  return { prompt: basePrompt, promptWithoutTools: basePromptWithoutTools };
};

export const buildNextPromptConfig = async (
  context: Context,
  cn?: string,
  isTest = false
): Promise<SMPrompt> => {
  const currentNode = cn ?? INITIAL_STEP_NODE;
  const nextOptions = await getNextOptions(context, currentNode, isTest);

  const { kind } = nextOptions;
  const { prompt: mPrompt, promptWithoutTools: mPromptWithoutToolPreconditions } = appendKindSpecificPrompts(
    kind,
    nextOptions.edges,
    nextOptions.prompt,
    nextOptions.promptWithoutToolPreconditions
  );

  const userContext = generateUserContextPrompt(context);
  const finalPrompt = userContext === null ? mPrompt : `${mPrompt}\n\n${userContext}`;
  const finalPromptWithoutTools =
    userContext === null
      ? mPromptWithoutToolPreconditions
      : `${mPromptWithoutToolPreconditions}\n\n${userContext}`;

  const promptConfig: SMPrompt = {
    node: nextOptions.node,
    prompt: finalPrompt,
    promptWithoutToolPreconditions: finalPromptWithoutTools,
    toolsByEdge: nextOptions.toolsByEdge,
    nextNode: nextOptions.nextNode,
    kind: nextOptions.kind,
    nodes: nextOptions.nodes,
  };

  promptConfig.promptWithoutToolPreconditions = await addNodeSpecificPrompts(
    context,
    currentNode,
    promptConfig.prompt
  );

  return promptConfig;
};
