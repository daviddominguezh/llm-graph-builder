import { assignIncomingMessage } from '@services/agentAssignment.js';
import { setChatPausedState, setModelReplyingFlag, updateLastMessage } from '@services/firebase/firebase.js';

import { logger } from '@src/utils/logger.js';
import { isError } from '@globalUtils/typeGuards.js';

import type { Context } from '@src/types/ai/tools.js';

import type { CallAgentInput, CallAgentOutput } from './types.js';

async function handleAssignedAgent(context: Context, agent: string): Promise<void> {
  await updateLastMessage(context.namespace, context.userID, {
    currentAssignee: agent,
    assignmentType: 'human',
    enabled: false,
    aiError: 'AI execution failed',
  });

  logger.info('Chat reassigned to human after AI error', {
    namespace: context.namespace,
    userId: context.userID,
    agent,
  });
}

async function handleNoAgentAvailable(context: Context, reason: string | undefined): Promise<void> {
  await Promise.allSettled([
    setModelReplyingFlag(context.namespace, context.userID, false),
    setChatPausedState(context.namespace, context.userID),
  ]);

  logger.warn('Could not assign to human after AI error, chat paused', {
    namespace: context.namespace,
    userId: context.userID,
    reason: reason ?? 'unknown',
  });
}

/**
 * Handles error state by pausing the chat
 */
export async function handleError(context: Context, input: CallAgentInput): Promise<CallAgentOutput> {
  logger.error('AI execution failed, attempting human assignment', {
    namespace: context.namespace,
    userId: context.userID,
  });

  if (context.isTest !== true) {
    const assignment = await assignIncomingMessage(context.namespace, context.userID, false, {
      preventAIFallback: true,
    });

    const { assigned: isAssigned, agent } = assignment;
    const hasAgent = agent !== undefined && agent !== '';

    if (isAssigned && hasAgent) {
      await handleAssignedAgent(context, agent);
    } else {
      const { reason } = assignment;
      await handleNoAgentAvailable(context, reason);
    }

    await setModelReplyingFlag(context.namespace, context.userID, false);
  }

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
  logger.error(`callAgentStep/${context.namespace}/${context.userID}| ${error.name}`);
  logger.error(`callAgentStep/${context.namespace}/${context.userID}| ${error.message}`);
  logger.error(`callAgentStep/${context.namespace}/${context.userID}| ${error.stack ?? 'no stack'}`);
}
