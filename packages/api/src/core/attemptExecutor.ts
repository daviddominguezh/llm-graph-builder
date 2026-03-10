import type { AssistantModelMessage, ModelMessage, Tool, ToolModelMessage, TypedToolCall } from 'ai';

import type { MESSAGES_PROVIDER, Message, TokenLog, ToolModelConfig } from '@src/types/ai/index.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';
import { isError } from '@src/utils/typeGuards.js';

import { getEscalationReason, getModel } from './agentExecutorHelpers.js';
import { AGENT_CONSTANTS } from './constants.js';
import { MessageProcessor } from './messageProcessor.js';
import { callModel } from './modelCaller.js';
import { processReply } from './replyProcessing.js';
import type { ExecutionState } from './types.js';

const INCREMENT_STEP = 1;
const FIRST_INDEX = 0;

export interface AttemptExecParams {
  context: Context;
  provider: MESSAGES_PROVIDER;
  config: ToolModelConfig;
  messages: Message[];
  step: string;
  expectedTool?: string;
  sessionId: string;
  executionStartTime: number;
  tokens: TokenLog;
  allToolCalls: Array<TypedToolCall<Record<string, Tool<unknown, unknown>>>>;
  copyMsgs: ModelMessage[][];
}

interface AttemptResult {
  modelWorkedFine: boolean;
  msgs: Array<AssistantModelMessage | ToolModelMessage>;
  lastError?: Error;
  shouldBreak: boolean;
}

interface AttemptLogParams {
  context: Context;
  sessionId: string;
  attemptCount: number;
  modelName: string;
}

function logAttemptStart(params: AttemptLogParams): void {
  const { context, sessionId, attemptCount, modelName } = params;
  logger.info(
    `callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Attempt ${attemptCount + INCREMENT_STEP}`,
    { sessionId, modelName, reason: getEscalationReason(attemptCount) }
  );
}

interface AttemptErrorLogParams extends AttemptLogParams {
  err: Error;
  attemptDuration: number;
}

function logAttemptError(params: AttemptErrorLogParams): void {
  const { context, sessionId, attemptCount, modelName, err, attemptDuration } = params;
  logger.error(`callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Model call failed`, {
    sessionId,
    attemptNumber: attemptCount + INCREMENT_STEP,
    modelName,
    errorName: err.name,
    errorMessage: err.message,
    duration: `${attemptDuration}ms`,
    remainingAttempts: AGENT_CONSTANTS.MAX_RETRY_ATTEMPTS - attemptCount - INCREMENT_STEP,
  });
}

function handleRetryableError(context: Context, config: ToolModelConfig, err: Error): AttemptResult {
  logger.warn(
    `callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Will retry with escalation...`
  );
  config.messages.unshift({
    role: 'system',
    content: 'Previous response was invalid. You must respond with valid JSON in the exact format specified.',
  });
  return { modelWorkedFine: false, msgs: [], lastError: err, shouldBreak: false };
}

function handleFinalError(
  context: Context,
  sessionId: string,
  executionStartTime: number,
  err: Error
): AttemptResult {
  logger.error(
    `callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Exhausted all retries`,
    {
      sessionId,
      totalDuration: `${Date.now() - executionStartTime}ms`,
      finalError: err.message,
    }
  );
  return { modelWorkedFine: false, msgs: [], lastError: err, shouldBreak: true };
}

async function tryExecuteAttempt(
  apiKey: string,
  execParams: AttemptExecParams,
  attemptCount: number
): Promise<AttemptResult> {
  const { context, config, expectedTool, tokens, allToolCalls, copyMsgs, sessionId } = execParams;
  const attemptStartTime = Date.now();
  const { model, name: modelName } = getModel(apiKey);

  logAttemptStart({ context, sessionId, attemptCount, modelName });
  logger.info(`[ATTEMPT] Messages count: ${config.messages.length}`);
  logger.info(`[ATTEMPT] Expected tool: ${expectedTool ?? 'none'}`);
  logger.info(`[ATTEMPT] Tools in config: ${Object.keys(config.tools ?? {}).join(', ')}`);
  copyMsgs.push(MessageProcessor.cleanMessagesBeforeSending(MessageProcessor.cloneMessages(config.messages)));

  logger.info('[ATTEMPT] Calling model...');
  const reply: unknown = await callModel(context, config, expectedTool, model);
  logger.info(`[ATTEMPT] Model returned, reply type: ${typeof reply}`);
  logger.info(`[ATTEMPT] Reply keys: ${typeof reply === 'object' && reply !== null ? Object.keys(reply).join(', ') : 'N/A'}`);
  const result = processReply(reply, {
    context,
    sessionId,
    config,
    expectedTool,
    attemptCount,
    attemptStartTime,
    tokens,
    allToolCalls,
    modelName,
  });
  logger.info(`[ATTEMPT] processReply result: modelWorkedFine=${String(result.modelWorkedFine)}, msgs=${result.msgs.length}`);
  return { modelWorkedFine: result.modelWorkedFine, msgs: result.msgs, shouldBreak: false };
}

export async function executeAttempt(
  execParams: AttemptExecParams,
  attemptCount: number
): Promise<AttemptResult> {
  const { context, config, executionStartTime, sessionId } = execParams;
  const attemptStartTime = Date.now();
  const { name: modelName } = getModel(context.apiKey);

  try {
    return await tryExecuteAttempt(context.apiKey, execParams, attemptCount);
  } catch (error) {
    const err = isError(error) ? error : new Error('Unknown error');
    const attemptDuration = Date.now() - attemptStartTime;
    const shouldContinue = attemptCount < AGENT_CONSTANTS.MAX_RETRY_ATTEMPTS - INCREMENT_STEP;

    logAttemptError({ context, sessionId, attemptCount, modelName, err, attemptDuration });

    if (shouldContinue) {
      return handleRetryableError(context, config, err);
    }

    return handleFinalError(context, sessionId, executionStartTime, err);
  }
}

export async function executeWithRetry(
  execParams: AttemptExecParams,
  state: ExecutionState
): Promise<ExecutionState> {
  if (state.modelWorkedFine || state.attemptCount >= AGENT_CONSTANTS.MAX_RETRY_ATTEMPTS) {
    return state;
  }

  const result = await executeAttempt(execParams, state.attemptCount);
  const newMsgs = result.msgs.length > FIRST_INDEX ? result.msgs : state.msgs;
  const nextState: ExecutionState = {
    modelWorkedFine: result.modelWorkedFine,
    msgs: newMsgs,
    attemptCount: state.attemptCount + INCREMENT_STEP,
    lastError: result.lastError ?? state.lastError,
  };

  if (result.shouldBreak) {
    return nextState;
  }

  return await executeWithRetry(execParams, nextState);
}

export async function runExecutionLoop(execParams: AttemptExecParams): Promise<ExecutionState> {
  const initialState: ExecutionState = {
    modelWorkedFine: false,
    msgs: [],
    attemptCount: FIRST_INDEX,
    lastError: undefined,
  };
  return await executeWithRetry(execParams, initialState);
}
