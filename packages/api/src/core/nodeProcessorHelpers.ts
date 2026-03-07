import type { AssistantModelMessage, ModelMessage, Tool, ToolModelMessage, TypedToolCall } from 'ai';

import { logger } from '@src/utils/logger.js';
import { isError } from '@globalUtils/typeGuards.js';

import { CloserTool } from '@src/ai/tools/index.js';

import type { Message } from '@src/types/messages/aiMessages.js';

import type { NodeProcessingConfig } from './types.js';

const FIRST_INDEX = 0;
const EMPTY_LENGTH = 0;
const DECREMENT_STEP = 1;

const DEFAULT_RESPONSE = 'No response available';

export type ToolCallsArray = Array<TypedToolCall<Record<string, Tool>>>;

export interface ManualInvokeResult {
  success: boolean;
  messages: Array<AssistantModelMessage | ToolModelMessage>;
  toolCalls: ToolCallsArray;
}

interface ToolResultResponse {
  result?: {
    result?: string;
  };
}

function isToolResultResponse(value: unknown): value is ToolResultResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('result' in value)) {
    return true;
  }
  const { result } = value as { result: unknown };
  if (result === undefined) {
    return true;
  }
  return typeof result === 'object' && result !== null;
}

export function getProviderFromMessages(messages: Message[]): Message['provider'] {
  const [firstMessage] = messages;
  if (firstMessage === undefined) {
    throw new Error('Cannot get provider from empty messages array');
  }
  return firstMessage.provider;
}

export function isProductsEmpty(products: string[] | null): boolean {
  return products === null || products.length === EMPTY_LENGTH;
}

function extractUserContentFromMessage(modelMsg: Message['message']): string | null {
  if (typeof modelMsg.content === 'string') {
    return modelMsg.content;
  }

  if (!Array.isArray(modelMsg.content)) {
    return null;
  }

  const textPart = modelMsg.content.find((part) => part.type === 'text');
  if (textPart !== undefined && 'text' in textPart) {
    return textPart.text;
  }
  return null;
}

export function extractLastUserMessage(messages: Message[]): string | null {
  for (let i = messages.length - DECREMENT_STEP; i >= FIRST_INDEX; i -= DECREMENT_STEP) {
    const [msg] = messages.slice(i, i + DECREMENT_STEP);
    if (msg === undefined) continue;
    const { message: modelMsg } = msg;

    if (modelMsg.role !== 'user') {
      continue;
    }

    const content = extractUserContentFromMessage(modelMsg);
    if (content !== null) {
      return content;
    }
  }
  return null;
}

export function createSyntheticToolMessages(
  toolCallId: string,
  userMessage: string,
  resultString: string
): {
  toolCallMessage: AssistantModelMessage;
  toolResultMessage: ToolModelMessage;
  syntheticToolCall: TypedToolCall<Record<string, Tool>>;
} {
  const toolCallMessage: AssistantModelMessage = {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId,
        toolName: CloserTool.answerBusinessQuestion,
        input: { query: userMessage },
      },
    ],
  };

  const toolResultMessage: ToolModelMessage = {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId,
        toolName: CloserTool.answerBusinessQuestion,
        output: { type: 'text', value: resultString },
      },
    ],
  };

  const syntheticToolCall: TypedToolCall<Record<string, Tool>> = {
    type: 'tool-call',
    toolCallId,
    toolName: CloserTool.answerBusinessQuestion,
    input: { query: userMessage },
  };

  return { toolCallMessage, toolResultMessage, syntheticToolCall };
}

async function executeToolWithResult(
  tool: Tool,
  userMessage: string,
  toolCallId: string,
  modelMessages: ModelMessage[]
): Promise<string> {
  if (tool.execute === undefined) return DEFAULT_RESPONSE;

  const toolResult: unknown = await tool.execute(
    { query: userMessage },
    { toolCallId, messages: modelMessages }
  );

  if (!isToolResultResponse(toolResult)) return DEFAULT_RESPONSE;
  return toolResult.result?.result ?? DEFAULT_RESPONSE;
}

function getToolFromConfig(config: NodeProcessingConfig): Tool | undefined {
  const edgeValues = Object.values(config.toolsByEdge);
  const [firstEdge] = edgeValues;
  if (firstEdge === undefined) return undefined;
  const { tools } = firstEdge;
  if (tools === undefined) return undefined;
  return tools[CloserTool.answerBusinessQuestion];
}

export async function manuallyInvokeAnswerBusinessQuestion(
  context: { namespace: string; userID: string },
  config: NodeProcessingConfig,
  messages: Message[]
): Promise<ManualInvokeResult> {
  const userMessage = extractLastUserMessage(messages);

  if (userMessage === null || userMessage === '') {
    logger.warn(
      `callAgentStep/${context.namespace}/${context.userID}| Could not extract user message for manual FAQ invocation`
    );
    return { success: false, messages: [], toolCalls: [] };
  }

  const tool = getToolFromConfig(config);
  if (tool === undefined) {
    logger.warn(
      `callAgentStep/${context.namespace}/${context.userID}| answerBusinessQuestion tool not found in config`
    );
    return { success: false, messages: [], toolCalls: [] };
  }

  try {
    const toolCallId = `manual-faq-${Date.now()}`;
    logger.info(
      `callAgentStep/${context.namespace}/${context.userID}| Manually invoking answerBusinessQuestion with query: "${userMessage}"`
    );

    const modelMessages: ModelMessage[] = messages.map((m) => m.message);
    const resultString = await executeToolWithResult(tool, userMessage, toolCallId, modelMessages);
    const { toolCallMessage, toolResultMessage, syntheticToolCall } = createSyntheticToolMessages(
      toolCallId,
      userMessage,
      resultString
    );

    return { success: true, messages: [toolCallMessage, toolResultMessage], toolCalls: [syntheticToolCall] };
  } catch (error) {
    const errorMessage = isError(error) ? error.message : 'Unknown error';
    logger.error(`callAgentStep/${context.namespace}/${context.userID}| Manual FAQ tool invocation failed`, {
      error: errorMessage,
    });
    return { success: false, messages: [], toolCalls: [] };
  }
}

function addValuesToTypeMap(
  typesWithValues: Record<string, Set<string>>,
  type: string,
  values: string[]
): void {
  const hasType = Object.hasOwn(typesWithValues, type);
  if (!hasType) {
    Object.assign(typesWithValues, { [type]: new Set<string>() });
  }
  const { [type]: typeSet } = typesWithValues;
  if (typeSet === undefined) return;
  values.forEach((value) => {
    typeSet.add(value);
  });
}

export function aggregatePersonalizations(
  products: Array<{ personalizations?: Array<{ type: string; values: string[] }> } | undefined>
): Record<string, Set<string>> {
  const typesWithValues: Record<string, Set<string>> = {};

  products.forEach((product) => {
    const personalizations = product?.personalizations;
    if (personalizations === undefined || personalizations.length === EMPTY_LENGTH) {
      return;
    }

    personalizations.forEach((personalization) => {
      const { type, values } = personalization;
      addValuesToTypeMap(typesWithValues, type, values);
    });
  });

  return typesWithValues;
}

export function convertSetsToArrays(typesWithValues: Record<string, Set<string>>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  Object.entries(typesWithValues).forEach(([type, valueSet]) => {
    result[type] = Array.from(valueSet);
  });
  return result;
}
