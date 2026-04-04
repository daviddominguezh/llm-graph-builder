import type { ModelMessage } from 'ai';

import { detectSentinels } from '@src/core/sentinelDetector.js';
import type { ActionTokenUsage } from '@src/types/ai/logs.js';
import { logger, setLogger } from '@src/utils/logger.js';
import type { Logger } from '@src/utils/logger.js';

import { type LlmCallResult, callAgentLlm } from './agentLlmCaller.js';
import {
  accumulateTokens,
  buildInitialMessages,
  buildLoopResult,
  createEmptyTokens,
  resolveMaxSteps,
} from './agentLoopHelpers.js';
import type {
  AgentLoopCallbacks,
  AgentLoopConfig,
  AgentLoopResult,
  AgentToolCallRecord,
} from './agentLoopTypes.js';
import { buildSkillTool } from './skillTool.js';

const INCREMENT = 1;
const ZERO = 0;
const JSON_NO_INDENT = 0;
const TEXT_PREVIEW_LENGTH = 100;
const PROMPT_PREVIEW_LENGTH = 80;

function log(label: string, data?: unknown): void {
  const msg = data === undefined ? label : `${label}: ${JSON.stringify(data, null, JSON_NO_INDENT)}`;
  logger.debug('[agentLoop]', msg);
}

interface LoopState {
  messages: ModelMessage[];
  step: number;
  totalTokens: ReturnType<typeof createEmptyTokens>;
  tokensLogs: ActionTokenUsage[];
  allToolCalls: AgentToolCallRecord[];
}

function createInitialState(config: AgentLoopConfig): LoopState {
  return {
    messages: buildInitialMessages(config),
    step: ZERO,
    totalTokens: createEmptyTokens(),
    tokensLogs: [],
    allToolCalls: [],
  };
}

interface StepResult {
  text: string;
  toolCalls: AgentToolCallRecord[];
  responseMessages: LlmCallResult['responseMessages'];
  done: boolean;
}

interface StepRecordParams {
  stepNum: number;
  result: LlmCallResult;
  durationMs: number;
}

function recordStepResult(state: LoopState, params: StepRecordParams, callbacks: AgentLoopCallbacks): void {
  accumulateTokens(state.totalTokens, params.result.tokens);
  state.tokensLogs.push({ action: `step-${String(params.stepNum)}`, tokens: { ...params.result.tokens } });
  callbacks.onStepProcessed({
    step: params.stepNum,
    messagesSent: [...state.messages],
    responseText: params.result.text,
    responseMessages: params.result.responseMessages,
    reasoning: params.result.reasoning,
    toolCalls: params.result.toolCalls,
    tokens: params.result.tokens,
    durationMs: params.durationMs,
  });
}

async function executeStep(
  config: AgentLoopConfig,
  state: LoopState,
  callbacks: AgentLoopCallbacks
): Promise<StepResult> {
  const stepNum = state.step + INCREMENT;
  log(`step ${String(stepNum)} starting`, {
    messageCount: state.messages.length,
    toolCount: Object.keys(config.tools).length,
  });
  callbacks.onStepStarted?.(stepNum);

  const startTime = Date.now();
  const result = await callAgentLlm({
    apiKey: config.apiKey,
    modelId: config.modelId,
    messages: state.messages,
    tools: config.tools,
  });

  const durationMs = Date.now() - startTime;
  log(`step ${String(stepNum)} completed`, {
    durationMs,
    text: result.text.slice(ZERO, TEXT_PREVIEW_LENGTH),
    toolCallCount: result.toolCalls.length,
    tokens: result.tokens,
  });
  recordStepResult(state, { stepNum, result, durationMs }, callbacks);

  return {
    text: result.text,
    toolCalls: result.toolCalls,
    responseMessages: result.responseMessages,
    done: result.toolCalls.length === ZERO,
  };
}

function appendResponseMessages(
  state: LoopState,
  stepResult: StepResult,
  callbacks: AgentLoopCallbacks,
  stepNum: number
): void {
  for (const msg of stepResult.responseMessages) {
    state.messages.push(msg);
  }

  for (const tc of stepResult.toolCalls) {
    state.allToolCalls.push(tc);
    callbacks.onToolExecuted?.({ step: stepNum, toolCall: tc });
  }
}

function buildResult(state: LoopState, finalText: string): AgentLoopResult {
  return buildLoopResult({
    finalText,
    step: state.step,
    totalTokens: state.totalTokens,
    tokensLogs: state.tokensLogs,
    allToolCalls: state.allToolCalls,
  });
}

function advanceStep(state: LoopState): void {
  Object.assign(state, { step: state.step + INCREMENT });
}

async function runLoopStep(
  config: AgentLoopConfig,
  state: LoopState,
  callbacks: AgentLoopCallbacks
): Promise<AgentLoopResult | null> {
  const stepResult = await executeStep(config, state, callbacks);
  advanceStep(state);

  // Check for sentinels in tool call results
  const sentinel = detectSentinels(stepResult.toolCalls);
  if (sentinel.type === 'finish') {
    return { ...buildResult(state, stepResult.text), finishResult: sentinel.finishSentinel };
  }
  if (sentinel.type === 'dispatch') {
    appendResponseMessages(state, stepResult, callbacks, state.step);
    return { ...buildResult(state, stepResult.text), dispatchResult: sentinel.dispatchSentinel };
  }

  if (stepResult.done) {
    return buildResult(state, stepResult.text);
  }

  appendResponseMessages(state, stepResult, callbacks, state.step);
  return null;
}

async function runLoop(
  config: AgentLoopConfig,
  state: LoopState,
  maxSteps: number,
  callbacks: AgentLoopCallbacks
): Promise<AgentLoopResult> {
  if (state.step >= maxSteps) {
    const result = buildResult(state, '');
    if (config.isChildAgent === true) {
      result.finishResult = {
        __sentinel: 'finish',
        output: 'Agent reached maximum step limit without completing the task.',
        status: 'error',
      };
    }
    return result;
  }

  const stepResult = await runLoopStep(config, state, callbacks);
  if (stepResult !== null) return stepResult;

  return await runLoop(config, state, maxSteps, callbacks);
}

function mergeSkillTools(config: AgentLoopConfig): AgentLoopConfig {
  if (config.skills === undefined || config.skills.length === ZERO) return config;
  const skillTools = buildSkillTool(config.skills);
  return { ...config, tools: { ...config.tools, ...skillTools } };
}

export async function executeAgentLoop(
  config: AgentLoopConfig,
  callbacks: AgentLoopCallbacks,
  loggerInstance?: Logger
): Promise<AgentLoopResult> {
  if (loggerInstance !== undefined) setLogger(loggerInstance);
  const resolved = mergeSkillTools(config);
  const maxSteps = resolveMaxSteps(resolved);
  log('starting', {
    systemPrompt: resolved.systemPrompt.slice(ZERO, PROMPT_PREVIEW_LENGTH),
    context: resolved.context.slice(ZERO, PROMPT_PREVIEW_LENGTH),
    maxSteps,
    modelId: resolved.modelId,
    messageCount: resolved.messages.length,
    toolCount: Object.keys(resolved.tools).length,
    skillCount: resolved.skills?.length ?? ZERO,
    isChildAgent: resolved.isChildAgent ?? false,
  });
  const state = createInitialState(resolved);
  const result = await runLoop(resolved, state, maxSteps, callbacks);
  log('finished', {
    finalText: result.finalText.slice(ZERO, TEXT_PREVIEW_LENGTH),
    totalSteps: result.steps,
    tokens: result.totalTokens,
    hasFinish: result.finishResult !== undefined,
    hasDispatch: result.dispatchResult !== undefined,
  });
  return result;
}

function noopStepProcessed(): void {
  /* intentional no-op callback */
}

export async function executeAgentLoopSimple(config: AgentLoopConfig, loggerInstance?: Logger): Promise<AgentLoopResult> {
  return await executeAgentLoop(config, { onStepProcessed: noopStepProcessed }, loggerInstance);
}
