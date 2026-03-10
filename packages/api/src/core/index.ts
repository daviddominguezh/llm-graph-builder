import type { ModelMessage } from 'ai';

import type { PipelineStep } from '@src/types/pipeline.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { handleCatchError, handleError } from './errorHandler.js';
import { createInitialFlowState, executeAgentFlowRecursive, extractLastMessage } from './indexHelpers.js';
import { MessageProcessor } from './messageProcessor.js';
import { createEmptyTokenLog } from './tokenTracker.js';
import type { CallAgentInput, CallAgentOutput } from './types.js';

export type * from './types.js';
export { MessageProcessor } from './messageProcessor.js';

const LAST_INDEX_OFFSET = 1;

// Export for backward compatibility - wrap to preserve context
export const cleanMessagesBeforeSending = (msgs: ModelMessage[]): ModelMessage[] =>
  MessageProcessor.cleanMessagesBeforeSending(msgs);

async function executeFlow(context: Context, input: CallAgentInput): Promise<CallAgentOutput> {
  const debugMessages: Record<string, ModelMessage[][]> = {};
  const initialState = createInitialFlowState(input, context.graph);
  logger.info(`[FLOW] Starting flow from node: ${initialState.currentNodeID}`);
  logger.info(`[FLOW] Graph edges: ${context.graph.edges.length}, nodes: ${context.graph.nodes.length}`);

  const { parsedResults, visitedNodes, error, toolCalls } = await executeAgentFlowRecursive(
    context,
    input,
    debugMessages,
    initialState
  );

  logger.info(`[FLOW] Flow complete: visitedNodes=[${visitedNodes.join(', ')}], error=${String(error)}, parsedResults=${parsedResults.length}`);

  if (error) {
    logger.info('[FLOW] Flow ended with error, returning error response');
    return handleError(context, input);
  }

  const lastMessage = extractLastMessage(input);
  const [lastResult] = parsedResults.slice(-LAST_INDEX_OFFSET);

  logger.info(`[FLOW] lastResult: ${JSON.stringify(lastResult)}`);
  logger.info(`[FLOW] text (messageToUser): "${lastResult?.messageToUser ?? 'undefined'}"`);

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

export const CALL_AGENT_STEP_NAME = 'callAgent';

/**
 * Main pipeline step for executing the agent flow
 */
export const callAgentStep: PipelineStep<CallAgentInput, CallAgentOutput> = {
  feature: CALL_AGENT_STEP_NAME,
  execute: async (context: Context, input: CallAgentInput): Promise<CallAgentOutput> => {
    input.tokensLog.push({
      action: CALL_AGENT_STEP_NAME,
      tokens: createEmptyTokenLog(),
    });

    logger.info(
      `callAgentStep/${context.tenantID}/${context.userID}| Processing Current Node: ${input.currentNode}`
    );

    try {
      return await executeFlow(context, input);
    } catch (e) {
      handleCatchError(context, e);
      return handleError(context, input);
    }
  },
};
