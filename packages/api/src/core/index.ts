import type { ModelMessage } from 'ai';

import type { PipelineStep } from '@src/types/pipeline.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { handleCatchError, handleError } from './errorHandler.js';
import {
  createInitialFlowState,
  executeAgentFlowRecursive,
  extractLastMessage,
  saveIntermediateMessages,
} from './indexHelpers.js';
import { MessageProcessor } from './messageProcessor.js';
import { createEmptyTokenLog } from './tokenTracker.js';
import type { CallAgentInput, CallAgentOutput } from './types.js';

export type * from './types.js';
export { MessageProcessor } from './messageProcessor.js';

const LAST_INDEX_OFFSET = 1;

// Export for backward compatibility - wrap to preserve context
export const cleanMessagesBeforeSending = (msgs: ModelMessage[]): ModelMessage[] =>
  MessageProcessor.cleanMessagesBeforeSending(msgs);

async function executeFlow(
  context: Context,
  input: CallAgentInput,
  initialMsgsLength: number
): Promise<CallAgentOutput> {
  const debugMessages: Record<string, ModelMessage[][]> = {};
  const initialState = createInitialFlowState(input);

  const { parsedResults, visitedNodes, error, toolCalls } = await executeAgentFlowRecursive(
    context,
    input,
    debugMessages,
    initialState
  );

  if (error) {
    return await handleError(context, input);
  }

  await saveIntermediateMessages(context, input, initialMsgsLength);

  const lastMessage = extractLastMessage(input);
  const [lastResult] = parsedResults.slice(-LAST_INDEX_OFFSET);

  return {
    message: lastMessage,
    tokensLogs: input.tokensLog,
    toolCalls,
    parsedResults,
    visitedNodes,
    text: lastResult?.messageToUser,
    debugMessages,
  };
}

/**
 * Main pipeline step for executing the agent flow
 */
export const callAgentStep: PipelineStep<CallAgentInput, CallAgentOutput> = {
  feature: TEXT_FEATURE_ACTION.CALL_AGENT,
  execute: async (context: Context, input: CallAgentInput): Promise<CallAgentOutput> => {
    const { messages } = input;
    const { length: initialMsgsLength } = messages;

    input.tokensLog.push({
      action: TEXT_FEATURE_ACTION.CALL_AGENT,
      tokens: createEmptyTokenLog(),
    });

    logger.info(
      `callAgentStep/${context.tenantID}/${context.userID}| Processing Current Node: ${input.currentNode}`
    );

    try {
      return await executeFlow(context, input, initialMsgsLength);
    } catch (e) {
      handleCatchError(context, e);
      return await handleError(context, input);
    }
  },
};
