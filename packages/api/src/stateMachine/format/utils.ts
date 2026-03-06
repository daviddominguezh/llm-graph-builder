import type { Graph } from '@src/types/graph.js';
import type { Context } from '@src/types/tools.js';

export const insertValuesInText = (context: Context, str: string): string => {
  const values: Record<string, unknown> = {
    '{BOT_NAME}': 'StateLLM',
    '{BUSINESS_NAME}': context.data.businessName,
    '{BUSINESS_DESCRIPTION}': context.data.businessDescription,
    '{USER_NAME}': context.data.userName,
  };
  let res = str;
  Object.keys(values).forEach((key) => {
    const { [key]: val } = values;
    if (val === undefined || val === null) return;
    const valStr = JSON.stringify(val);
    if (valStr !== '') res = res.replaceAll(key, valStr);
  });
  return res;
};

export function addNodeSpecificPrompts(
  graph: Graph,
  context: Context,
  currentNodeID: string,
  replyPrompt: string
): string {
  const prompt = replyPrompt;

  // TODO: Implement this, we have to get the current node from the graph, and check if it has a specific prompt
  // if so, then append it

  return prompt;
}
