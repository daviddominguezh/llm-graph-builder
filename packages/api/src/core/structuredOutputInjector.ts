/**
 * Injects synthetic tool-call / tool-result message pairs into the
 * conversation history when a node produces a structured output.
 * This lets downstream nodes "see" the structured data.
 */
import { MESSAGES_PROVIDER, type Message } from '@src/types/ai/messages.js';

const FIRST_CHAR = 0;
const AFTER_FIRST = 1;

/**
 * Converts a node ID like "create_recipe" or "my-node" to a tool name
 * like "generateSchemaCreateRecipe" or "generateSchemaMyNode".
 */
function nodeIdToToolName(nodeId: string): string {
  const camelized = nodeId.replace(/[\-_](?<ch>.)/gv, (_match, char: string) => char.toUpperCase());
  const capitalized = camelized.charAt(FIRST_CHAR).toUpperCase() + camelized.slice(AFTER_FIRST);
  return `generateSchema${capitalized}`;
}

function buildToolCallId(nodeId: string): string {
  return `schema-${nodeId}-${String(Date.now())}`;
}

export function injectStructuredOutputMessages(messages: Message[], nodeId: string, data: unknown): void {
  const toolName = nodeIdToToolName(nodeId);
  const toolCallId = buildToolCallId(nodeId);
  const outputJson = JSON.stringify(data);
  const now = Date.now();

  const assistantMsg: Message = {
    provider: MESSAGES_PROVIDER.WEB,
    id: `synthetic-call-${nodeId}`,
    timestamp: now,
    originalId: `synthetic-call-${nodeId}`,
    type: 'text',
    message: {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId, toolName, input: {} }],
    },
  };

  const toolResultMsg: Message = {
    provider: MESSAGES_PROVIDER.WEB,
    id: `synthetic-result-${nodeId}`,
    timestamp: now,
    originalId: `synthetic-result-${nodeId}`,
    type: 'text',
    message: {
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId, toolName, output: { type: 'text', value: outputJson } }],
    },
  };

  messages.push(assistantMsg, toolResultMsg);
}
