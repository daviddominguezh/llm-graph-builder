import { MESSAGES_PROVIDER, type Message } from '@daviddh/llm-graph-runner';

import type { PushChildParams } from '../useCompositionStack';

let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

export function makeUserMessage(text: string, id?: string): Message {
  return {
    provider: MESSAGES_PROVIDER.WEB,
    id: id ?? nextId('user'),
    timestamp: Date.now(),
    originalId: id ?? nextId('user-orig'),
    type: 'text',
    message: { role: 'user', content: text },
  } as Message;
}

export function makeAssistantMessage(text: string, id?: string): Message {
  return {
    provider: MESSAGES_PROVIDER.WEB,
    id: id ?? nextId('asst'),
    timestamp: Date.now(),
    originalId: id ?? nextId('asst-orig'),
    type: 'text',
    message: { role: 'assistant', content: text },
  } as Message;
}

export function makeToolCallMessage(toolCallId: string, toolName = 'invoke_agent'): Message {
  return {
    provider: MESSAGES_PROVIDER.WEB,
    id: nextId('tc'),
    timestamp: Date.now(),
    originalId: nextId('tc-orig'),
    type: 'text',
    message: {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId, toolName, input: {} }],
    },
  } as Message;
}

export function defaultPushParams(overrides?: Partial<PushChildParams>): PushChildParams {
  return {
    appType: 'agent',
    dispatchParams: {},
    parentToolCallId: 'tc-default',
    toolName: 'invoke_agent',
    task: 'child task',
    parentMessages: [],
    ...overrides,
  };
}

interface ToolResultInfo {
  toolCallId: string;
  toolName: string;
  value: string;
}

interface ToolResultContent {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: { type: 'text'; value: string };
}

export function getTextFromMessage(msg: Message): string | null {
  const { content } = msg.message;
  if (typeof content === 'string') return content;
  return null;
}

function isToolResultContent(part: unknown): part is ToolResultContent {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    (part as ToolResultContent).type === 'tool-result'
  );
}

export function getToolResultFromMessage(msg: Message): ToolResultInfo | null {
  if (msg.message.role !== 'tool') return null;
  const { content } = msg.message;
  if (!Array.isArray(content)) return null;
  const part = content[0] as unknown;
  if (!isToolResultContent(part)) return null;
  return {
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    value: part.output.value,
  };
}
