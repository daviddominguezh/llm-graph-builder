import type { Context } from '@src/types/tools.js';

import { insertValuesInText } from '../format/utils.js';
import { getNode } from '../graph/index.js';

export const buildAgentReplySchema = (ids: string): string => `\`\`\`json
{
  "nextNodeID": "${ids}",
  "messageToUser": "Your reply in the same language the user is writing"
}
\`\`\``;

export const SM_BASE_PROMPT_NEXT_OPTIONS = `You are a routing node. Your only job is to classify the user's message and return a JSON object.

## Options`;

export const buildOutputFormatPrompt = (ids: string): string => `## Output format

Return ONLY valid JSON. No tools. No extra text.

${buildAgentReplySchema(ids)}`;

export const buildDecisionOnlySchema = (ids: string): string => `\`\`\`json
{
  "nextNodeID": "${ids}"
}
\`\`\``;

export const buildDecisionOnlyOutputFormatPrompt = (ids: string): string => `## Output format

Return ONLY valid JSON. No tools. No extra text.

${buildDecisionOnlySchema(ids)}`;

export const buildTerminalNodeSchema = (): string => `\`\`\`json
{
  "messageToUser": "Your reply in the same language the user is writing"
}
\`\`\``;

export const buildTerminalOutputFormatPrompt = (): string => `## Output format

Return ONLY valid JSON. No tools. No extra text.

${buildTerminalNodeSchema()}`;

export const SM_BASE_PROMPT_NEXT_OPTION_IS_AGENT_DECISION = `You are a routing node. Your only job is to classify the user's message and return a JSON object.

## Options`;

export const SM_BASE_PROMPT_NEXT_OPTION_IS_TOOL = `You must immediately call the tool {toolName}.

Do not reply with text.
DO NOT REPLY TO THE USER, JUST CALL THE TOOL.
Do not explain or confirm.
Do not do anything else.

Just call the tool {toolName} right now and pass the required parameters.
This is mandatory. Failure to do so means the task fails.
`;

export const SM_TOOLREPLY_NOTOOLS_REPLY = `**DO NOT CALL ANY TOOL AT THIS STEP**`;
export const SM_TOOLREPLY_NODE_REPLY = `Use the following nodeID as the "nextNodeID" parameter in your response`;
export const SM_TOOLREPLY_EXAMPLE_REPLY = `This is an example of the reply you should give to the user, replace the values within tags <> or braces {} with their appropiated values. For example: "Hello <NAME>" with "Hello Joe", and "Hello {NAME}" with "Hello Joe". Replacing the values within braces and tags is MANDATORY, you HAVE TO REPLACE THEM. Example`;

export const SM_BASE_JSON_PROMPT = `Return ONLY valid JSON:`;

export const buildSchemaAgentReplyPrompt = (ids: string): string =>
  `${SM_BASE_JSON_PROMPT}\n\n${buildAgentReplySchema(ids)}`;

interface GenerateToolReplyPromptParams {
  ctx: Context;
  nodeId: string;
  nodeName: string;
  textExample: string;
  description?: string;
}

export const generateToolReplyPrompt = (params: GenerateToolReplyPromptParams): string => {
  const { ctx, nodeId, nodeName, textExample, description } = params;

  const promptNode = `${SM_TOOLREPLY_NODE_REPLY}: "${nodeId}"`;
  const promptInstruction = `${SM_TOOLREPLY_EXAMPLE_REPLY}: "${insertValuesInText(ctx, textExample)}"`;
  const hasDescription = description !== undefined && description !== '';
  const promptDescription = hasDescription ? `Node description: ${description}` : '';

  let promptUserExample: string | undefined = undefined;

  const node = getNode(ctx.graph, nodeName);
  if (node.nextNodeIsUser === true) {
    promptUserExample = `- Ask the user an open-ended question to understand what they need`;
  }

  const descriptionPart = hasDescription ? `${promptDescription}\n` : '';
  const hasUserExample = promptUserExample !== undefined;
  const userExamplePart = hasUserExample ? `\n${promptUserExample}\n\n` : '';

  return `${SM_TOOLREPLY_NOTOOLS_REPLY}\n${promptNode}\n${descriptionPart}${userExamplePart}${promptInstruction}\n\n${buildSchemaAgentReplyPrompt(nodeId)}`;
};
