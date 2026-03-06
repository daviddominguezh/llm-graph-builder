import { FIRST_INDEX } from '@constants/index.js';

import type { Context } from '@globalTypes/ai/tools.js';

import { insertValuesInText } from '../format/index.js';
import { getEdgesFromNode, getNode } from '../graph/index.js';

export const AGENT_REPLY_SCHEMA = `
{
  "nextNodeID": "<NODE_ID>",
  "messageToUser": "<YOUR_REPLY>"
}

**IMPORTANT**: Your "messageToUser" must always be in the same language the user is writing
`.trim();

export const SM_BASE_PROMPT_NEXT_OPTIONS = `### YOU ARE IN ROUTING MODE - JSON OUTPUT ONLY
You are a STRICT routing agent. Your SOLE PURPOSE is to route using: {
  "nextNodeID": "<NODE_ID>",
  "messageToUser": "<YOUR_REPLY>"
}

**IMPORTANT**: Your "messageToUser" must always be in the same language the user is writing

## Your Task

1. **Analyze** the user's current message to understand their intent
2. **Match** their intent against the available routing options below
3. **Select** the appropriate nextNodeID
4. **Respond** with a contextual messageToUser that acknowledges their message. Use the business context to make your reply relevant and helpful.
5. **Return** ONLY the "nextNodeID":"<NODE_ID>" in JSON format

## Allowed Routes (choose the nextNodeID that matches)`;

export const SM_BASE_JSON_PROMPT = `Return **ONLY a valid JSON object with this exact structure:**:
`;

export const SM_SCHEMA_AGENTREPLY_PROMPT = `
${SM_BASE_JSON_PROMPT}

\`\`\`json
${AGENT_REPLY_SCHEMA}
\`\`\`
`.trim();

export const SM_SCHEMA_AGENTDECISION_PROMPT = `
${SM_BASE_JSON_PROMPT}

## REQUIRED OUTPUT JSON (MANDATORY)
 Respond with ONLY this structure::

${AGENT_REPLY_SCHEMA}

**Anything else (text before/after, markdown, code fences, extra fields) is a failure.**
`.trim();

export const REPLY_PROMPT = `
## REQUIRED JSON OUTPUT (MANDATORY)
 Respond with ONLY this structure:

${AGENT_REPLY_SCHEMA}

**Anything else (text before/after, markdown, code fences, extra fields) is a failure.**
**IMPORTANT**: Do NOT invoke tools in this step.
Your output MUST be JSON with the provided structure.
`.trim();
export const AGENT_DECISION_PROMPT = `${REPLY_PROMPT}

## CRITICAL REMINDER FOR DECISION NODES:
- Your response will be PARSED AS JSON - any non-JSON text will cause system failure
- The "messageToUser" field should be brief and directly related to the selected nextNodeID

## FAILURE MODE: If you call a tool the system will CRASH

## SUCCESS MODE: Respond with ONLY this structure:
\`\`\`json
${AGENT_REPLY_SCHEMA}
\`\`\``.trim();

// export const SM_BASE_PROMPT_NEXT_OPTION_IS_TOOL = `Emit ONLY valid JSON matching the tool schema. No comments, no trailing commas, no explanations in the inputs. Following this instructions,**CALL NOW THE TOOL:**:`;
export const SM_BASE_PROMPT_NEXT_OPTION_IS_TOOL = `You must immediately call the tool {toolName}.

Do not reply with text.
DO NOT REPLY TO THE USER, JUST CALL THE TOOL.
Do not explain or confirm.
Do not do anything else.

Just call the tool {toolName} right now and pass the required parameters.
This is mandatory. Failure to do so means the task fails.
`;

export const SM_BASE_PROMPT_NEXT_OPTION_IS_AGENT_DECISION = `
=================================================================
### ROUTING DECISION MODE - NO TOOL EXECUTION ALLOWED
=================================================================

## CRITICAL CONSTRAINTS FOR THIS STEP:

** NO TOOLS ARE AVAILABLE AT THIS STEP **
** DO NOT CALL ANY TOOLS **

## YOUR ONLY JOB:
1. Analyze the user's message to understand their intent
2. Select which nextNodeID matches
3. Write a helpful messageToUser that uses business context when relevant
4. Return ONLY the JSON response (no tools, no actions, no execution)

Decide which option applies and SELECT the appropriate "nextNodeID"`;

export const SM_TOOLREPLY_NOTOOLS_REPLY = `**DO NOT CALL ANY TOOL AT THIS STEP**`;
export const SM_TOOLREPLY_NODE_REPLY = `Use the following nodeID as the "nextNodeID" parameter in your response`;
export const SM_TOOLREPLY_EXAMPLE_REPLY = `This is an example of the reply you should give to the user, replace the values within tags <> or braces {} with their appropiated values. For example: "Hello <NAME>" with "Hello Joe", and "Hello {NAME}" with "Hello Joe". Replacing the values within braces and tags is MANDATORY, you HAVE TO REPLACE THEM. Example`;

interface GenerateToolReplyPromptParams {
  ctx: Context;
  nodeId: string;
  nodeName: string;
  textExample: string;
  description?: string;
}

export const generateToolReplyPrompt = async (params: GenerateToolReplyPromptParams): Promise<string> => {
  const { ctx, nodeId, nodeName, textExample, description } = params;

  const promptNode = `${SM_TOOLREPLY_NODE_REPLY}: "${nodeId}"`;
  const promptInstruction = `${SM_TOOLREPLY_EXAMPLE_REPLY}: "${insertValuesInText(ctx, textExample)}"`;
  const hasDescription = description !== undefined && description !== '';
  const promptDescription = hasDescription ? `Node description: ${description}` : '';

  let promptUserExample: string | undefined = undefined;

  const node = getNode(nodeName);
  // THIS IF HANDLES ONLY THE USER EXAMPLES
  if (node.nextNodeIsUser === true) {
    // IMPORTANT: We no longer include specific example phrases in the prompt
    // The AI should ask natural, open-ended questions WITHOUT telling users how to respond
    // Providing examples like "puedes decirme 'Quisiera un producto así'" is robotic and unnatural
    promptUserExample = `- Ask the user an open-ended question to understand what they need`;
  }

  const descriptionPart = hasDescription ? `${promptDescription}\n` : '';
  const hasUserExample = promptUserExample !== undefined;
  const userExamplePart = hasUserExample ? `\n${promptUserExample}\n\n` : '';

  return `${SM_TOOLREPLY_NOTOOLS_REPLY}\n${promptNode}\n${descriptionPart}${userExamplePart}${promptInstruction}\n\n${SM_SCHEMA_AGENTREPLY_PROMPT}`;
};
