import type { AssistantModelMessage, ModelMessage, Tool, ToolModelMessage, TypedToolCall } from 'ai';

import type { MESSAGES_PROVIDER, Message, TokenLog, ToolModelConfig } from '@src/types/ai/index.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { logExecutionSummary, processResponseMessages } from './agentExecutorHelpers.js';
import { runExecutionLoop } from './attemptExecutor.js';
import type { AttemptExecParams } from './attemptExecutor.js';
import { AGENT_CONSTANTS } from './constants.js';
import { MessageProcessor } from './messageProcessor.js';
import { createEmptyTokenLog } from './tokenTracker.js';
import type { AgentExecutionResult, ExecutionState } from './types.js';

const INCREMENT_STEP = 1;

export interface ExecuteAgentOptions {
  context: Context;
  provider: MESSAGES_PROVIDER;
  config: ToolModelConfig;
  messages: Message[];
  step: string;
  expectedTool?: string;
}

function getLastMessage(
  processedMsgs: Array<AssistantModelMessage | ToolModelMessage>
): AssistantModelMessage {
  const lastMessageIndex = processedMsgs.length - INCREMENT_STEP;
  const [lastMessageFromMsgs] = processedMsgs.slice(lastMessageIndex);
  if (lastMessageFromMsgs?.role === 'assistant') {
    return lastMessageFromMsgs;
  }
  return { role: 'assistant', content: '' };
}

function createExecParams(
  options: ExecuteAgentOptions,
  sessionId: string,
  executionStartTime: number
): AttemptExecParams {
  const tokens: TokenLog = createEmptyTokenLog();
  const copyMsgs: ModelMessage[][] = [];
  const allToolCalls: Array<TypedToolCall<Record<string, Tool<unknown, unknown>>>> = [];

  return {
    context: options.context,
    provider: options.provider,
    config: options.config,
    messages: options.messages,
    step: options.step,
    expectedTool: options.expectedTool,
    sessionId,
    executionStartTime,
    tokens,
    allToolCalls,
    copyMsgs,
  };
}

function logAgentStart(context: Context, sessionId: string, step: string, expectedTool?: string): void {
  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Starting`, {
    sessionId,
    step,
    expectedTool: expectedTool ?? 'none',
    maxAttempts: AGENT_CONSTANTS.MAX_RETRY_ATTEMPTS,
  });
}

function logAgentComplete(execParams: AttemptExecParams, state: ExecutionState): void {
  logExecutionSummary({
    context: execParams.context,
    sessionId: execParams.sessionId,
    modelWorkedFine: state.modelWorkedFine,
    attemptCount: state.attemptCount,
    executionStartTime: execParams.executionStartTime,
    expectedTool: execParams.expectedTool,
    tokens: execParams.tokens,
    allToolCalls: execParams.allToolCalls,
    lastError: state.lastError,
  });
}

function buildResult(
  execParams: AttemptExecParams,
  state: ExecutionState,
  processedMsgs: Array<AssistantModelMessage | ToolModelMessage>
): AgentExecutionResult {
  return {
    messages: processedMsgs,
    tokens: execParams.tokens,
    toolCalls: execParams.allToolCalls,
    lastMessage: getLastMessage(processedMsgs),
    copyMsgs: execParams.copyMsgs,
    error: !state.modelWorkedFine,
  };
}

/**
 * Executes agent with retry logic for tool calls
 */
export async function executeAgent(options: ExecuteAgentOptions): Promise<AgentExecutionResult> {
  const { context, provider, messages, step, expectedTool } = options;
  const executionStartTime = Date.now();
  const sessionId = `${context.tenantID}-${context.userID}-${executionStartTime}`;

  logAgentStart(context, sessionId, step, expectedTool);

  const execParams = createExecParams(options, sessionId, executionStartTime);
  const state = await runExecutionLoop(execParams);

  logger.info(
    `[EXECUTOR] Loop done: modelWorkedFine=${String(state.modelWorkedFine)}, attempts=${state.attemptCount}, msgs=${state.msgs.length}`
  );
  if (state.lastError !== undefined) {
    logger.info(`[EXECUTOR] lastError: ${state.lastError.name}: ${state.lastError.message}`);
  }

  logAgentComplete(execParams, state);

  const processedMsgs = processResponseMessages(state.msgs);
  logger.info(`[EXECUTOR] processedMsgs count: ${processedMsgs.length}`);

  messages.push(...MessageProcessor.convertToAppMessages(processedMsgs, provider));

  const result = buildResult(execParams, state, processedMsgs);
  logger.info(
    `[EXECUTOR] Final result: error=${String(result.error)}, toolCalls=${result.toolCalls.length}, lastMessage role=${result.lastMessage.role}`
  );
  if (typeof result.lastMessage.content === 'string') {
    logger.info(`[EXECUTOR] lastMessage content (string): "${result.lastMessage.content.slice(0, 200)}"`);
  } else if (Array.isArray(result.lastMessage.content)) {
    logger.info(`[EXECUTOR] lastMessage content parts: ${result.lastMessage.content.length}`);
    for (const part of result.lastMessage.content) {
      const p = part as { type?: string; text?: string };
      logger.info(`[EXECUTOR]   part type=${p.type ?? '?'}, text="${(p.text ?? '').slice(0, 100)}"`);
    }
  }

  return result;
}
