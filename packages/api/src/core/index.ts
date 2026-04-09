import type { ModelMessage } from 'ai';

import type { ParsedResult } from '@src/types/ai/index.js';
import type { PipelineStep } from '@src/types/pipeline.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { handleCatchError, handleError } from './errorHandler.js';
import { createInitialFlowState, executeAgentFlowRecursive, extractLastMessage } from './indexHelpers.js';
import { MessageProcessor } from './messageProcessor.js';
import type { CallAgentInput, CallAgentOutput } from './types.js';

export type * from './types.js';
export { MessageProcessor } from './messageProcessor.js';

const LAST_INDEX_OFFSET = 1;
const EMPTY_LENGTH = 0;

// Export for backward compatibility - wrap to preserve context
export const cleanMessagesBeforeSending = (msgs: ModelMessage[]): ModelMessage[] =>
  MessageProcessor.cleanMessagesBeforeSending(msgs);

interface AccumulatedState {
  debugMessages: Record<string, ModelMessage[][]>;
  visitedNodes: string[];
  parsedResults: ParsedResult[];
  structuredOutputs: Array<{ nodeId: string; data: unknown }>;
}

function buildErrorOutput(context: Context, input: CallAgentInput, state: AccumulatedState): CallAgentOutput {
  return {
    ...handleError(context, input),
    debugMessages: state.debugMessages,
    visitedNodes: state.visitedNodes,
    parsedResults: state.parsedResults,
    structuredOutputs: state.structuredOutputs.length > EMPTY_LENGTH ? state.structuredOutputs : undefined,
  };
}

function buildSuccessOutput(
  input: CallAgentInput,
  state: AccumulatedState,
  toolCalls: CallAgentOutput['toolCalls']
): CallAgentOutput {
  const lastMessage = extractLastMessage(input);
  const [lastResult] = state.parsedResults.slice(-LAST_INDEX_OFFSET);

  return {
    message: lastMessage,
    tokensLogs: input.tokensLog,
    toolCalls,
    parsedResults: state.parsedResults,
    visitedNodes: state.visitedNodes,
    text: lastResult?.messageToUser,
    debugMessages: state.debugMessages,
    structuredOutputs: state.structuredOutputs.length > EMPTY_LENGTH ? state.structuredOutputs : undefined,
  };
}

async function executeFlow(context: Context, input: CallAgentInput): Promise<CallAgentOutput> {
  const debugMessages: Record<string, ModelMessage[][]> = {};
  const initialState = createInitialFlowState(input, context.graph);

  try {
    const { visitedNodes, error, toolCalls, newStructuredOutputs, parsedResults, dispatchResult } =
      await executeAgentFlowRecursive(context, input, debugMessages, initialState);

    const accumulated: AccumulatedState = {
      debugMessages,
      visitedNodes,
      parsedResults,
      structuredOutputs: newStructuredOutputs,
    };

    if (error) {
      return buildErrorOutput(context, input, accumulated);
    }

    const output = buildSuccessOutput(input, accumulated, toolCalls);
    if (dispatchResult !== undefined) {
      output.dispatchResult = dispatchResult;
    }
    return output;
  } catch (e) {
    handleCatchError(context, e);
    return buildErrorOutput(context, input, {
      debugMessages,
      visitedNodes: initialState.visitedNodes,
      parsedResults: initialState.parsedResults,
      structuredOutputs: initialState.newStructuredOutputs,
    });
  }
}

export const CALL_AGENT_STEP_NAME = 'callAgent';

/**
 * Main pipeline step for executing the agent flow
 */
export const callAgentStep: PipelineStep<CallAgentInput, CallAgentOutput> = {
  feature: CALL_AGENT_STEP_NAME,
  execute: async (context: Context, input: CallAgentInput): Promise<CallAgentOutput> => {
    logger.info(
      `callAgentStep/${context.tenantID}/${context.userID}| Processing Current Node: ${input.currentNode}`
    );

    return await executeFlow(context, input);
  },
};
