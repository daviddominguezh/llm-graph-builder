import type { ModelMessage } from 'ai';

import type { ActionTokenUsage } from '@src/types/ai/logs.js';

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

const INCREMENT = 1;
const ZERO = 0;

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

async function executeStep(
  config: AgentLoopConfig,
  state: LoopState,
  callbacks: AgentLoopCallbacks
): Promise<StepResult> {
  const stepNum = state.step + INCREMENT;
  callbacks.onStepStarted?.(stepNum);

  const startTime = Date.now();
  const result = await callAgentLlm({
    apiKey: config.apiKey,
    modelId: config.modelId,
    messages: state.messages,
    tools: config.tools,
  });

  const durationMs = Date.now() - startTime;
  accumulateTokens(state.totalTokens, result.tokens);

  const actionLog: ActionTokenUsage = {
    action: `step-${String(stepNum)}`,
    tokens: { ...result.tokens },
  };
  state.tokensLogs.push(actionLog);

  callbacks.onStepProcessed({
    step: stepNum,
    messagesSent: [...state.messages],
    responseText: result.text,
    toolCalls: result.toolCalls,
    tokens: result.tokens,
    durationMs,
  });

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

async function runLoop(
  config: AgentLoopConfig,
  state: LoopState,
  maxSteps: number,
  callbacks: AgentLoopCallbacks
): Promise<AgentLoopResult> {
  while (state.step < maxSteps) {
    const stepResult = await executeStep(config, state, callbacks);
    state.step += INCREMENT;

    if (stepResult.done) {
      return buildLoopResult(
        stepResult.text,
        state.step,
        state.totalTokens,
        state.tokensLogs,
        state.allToolCalls
      );
    }

    appendResponseMessages(state, stepResult, callbacks, state.step);
  }

  return buildLoopResult('', state.step, state.totalTokens, state.tokensLogs, state.allToolCalls);
}

export async function executeAgentLoop(
  config: AgentLoopConfig,
  callbacks: AgentLoopCallbacks
): Promise<AgentLoopResult> {
  const maxSteps = resolveMaxSteps(config);
  const state = createInitialState(config);
  return await runLoop(config, state, maxSteps, callbacks);
}

export async function executeAgentLoopSimple(config: AgentLoopConfig): Promise<AgentLoopResult> {
  const noop = { onStepProcessed: () => {} };
  return await executeAgentLoop(config, noop);
}
