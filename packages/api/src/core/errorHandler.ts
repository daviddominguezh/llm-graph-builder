import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';
import { isError } from '@src/utils/typeGuards.js';

import type { CallAgentInput, CallAgentOutput } from './types.js';

/**
 * Handles error state by pausing the chat
 */
export async function handleError(context: Context, input: CallAgentInput): Promise<CallAgentOutput> {
  logger.error('AI execution failed, attempting human assignment', {
    tenantID: context.tenantID,
    userId: context.userID,
  });

  return {
    message: null,
    tokensLogs: input.tokensLog,
    toolCalls: [],
    visitedNodes: [],
    debugMessages: {},
  };
}

export function handleCatchError(context: Context, e: unknown): void {
  const error = isError(e) ? e : new Error('Unknown error');
  logger.error(`callAgentStep/${context.tenantID}/${context.userID}| ${error.name}`);
  logger.error(`callAgentStep/${context.tenantID}/${context.userID}| ${error.message}`);
  logger.error(`callAgentStep/${context.tenantID}/${context.userID}| ${error.stack ?? 'no stack'}`);
}
