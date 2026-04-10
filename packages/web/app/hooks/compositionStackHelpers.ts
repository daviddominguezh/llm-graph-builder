import { MESSAGES_PROVIDER, type Message } from '@daviddh/llm-graph-runner';
import { nanoid } from 'nanoid';

import type { TokenTotals } from './useCompositionStack';

export function createUserMessage(text: string): Message {
  return {
    id: nanoid(),
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: nanoid(),
    message: { role: 'user', content: text },
  } as Message;
}

export function createToolCallMessage(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>
): Message {
  return {
    id: nanoid(),
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: nanoid(),
    message: {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId, toolName, input }],
    },
  } as Message;
}

export function createToolResultMessage(
  parentToolCallId: string,
  toolName: string,
  childOutput: string
): Message {
  return {
    id: nanoid(),
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: nanoid(),
    message: {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: parentToolCallId,
          toolName,
          output: { type: 'text', value: childOutput },
        },
      ],
    },
  } as Message;
}

export function sumByDepth(byDepth: Record<number, TokenTotals>): TokenTotals {
  const result: TokenTotals = { input: 0, output: 0, cached: 0 };
  for (const totals of Object.values(byDepth)) {
    result.input += totals.input;
    result.output += totals.output;
    result.cached += totals.cached;
  }
  return result;
}
