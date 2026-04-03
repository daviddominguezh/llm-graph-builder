import type {
  ActionTokenUsage,
  AgentLoopResult,
  AgentStepEvent,
  AgentToolCallRecord,
} from '@daviddh/llm-graph-runner';

import {
  completeExecution,
  refreshExecutionSummary,
  saveExecutionMessage,
  saveNodeVisit,
  updateSessionState,
} from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

const ZERO = 0;

interface StepResponse {
  text: string;
  toolCalls: AgentToolCallRecord[];
  responseMessages: unknown[];
  reasoning: string | undefined;
  stepError: string | undefined;
}

/* ─── Agent step persistence ─── */
interface AgentStepPersistenceParams {
  supabase: SupabaseClient;
  executionId: string;
  stepEvents: AgentStepEvent[];
  tokensLogs: ActionTokenUsage[];
  model: string;
}

function buildStepResponse(stepEvent: AgentStepEvent | undefined): StepResponse | Record<string, never> {
  if (stepEvent === undefined) return {};
  const responseMessages: unknown[] = stepEvent.responseMessages;
  const reasoning: string | undefined = stepEvent.reasoning;
  const stepError: string | undefined = stepEvent.error;
  return {
    text: stepEvent.responseText,
    toolCalls: stepEvent.toolCalls,
    responseMessages,
    reasoning,
    stepError,
  };
}

async function persistAgentSteps(params: AgentStepPersistenceParams): Promise<void> {
  const { supabase, executionId, stepEvents, tokensLogs, model } = params;
  const saves = tokensLogs.map(async (log, index) => {
    const stepEvent = stepEvents.at(index);
    const messagesSent = stepEvent === undefined ? [] : stepEvent.messagesSent;
    await saveNodeVisit(supabase, {
      executionId,
      nodeId: log.action,
      stepOrder: index,
      messagesSent,
      response: buildStepResponse(stepEvent),
      inputTokens: log.tokens.input,
      outputTokens: log.tokens.output,
      cachedTokens: log.tokens.cached,
      cost: log.tokens.costUSD ?? ZERO,
      durationMs: stepEvent?.durationMs ?? ZERO,
      model,
    });
  });
  await Promise.all(saves);
}

/* ─── Assistant message persistence ─── */
interface AssistantMessageParams {
  sessionDbId: string;
  executionId: string;
  nodeId: string;
  text: string;
}

async function persistAssistantMessage(
  supabase: SupabaseClient,
  params: AssistantMessageParams
): Promise<void> {
  if (params.text === '') return;
  await saveExecutionMessage(supabase, {
    sessionId: params.sessionDbId,
    executionId: params.executionId,
    nodeId: params.nodeId,
    role: 'assistant',
    content: params.text,
  });
}

/* ─── Completion persistence ─── */
async function persistCompletion(
  supabase: SupabaseClient,
  executionId: string,
  totals: { input: number; output: number; cached: number; costUSD?: number },
  durationMs: number
): Promise<void> {
  await completeExecution(supabase, executionId, {
    inputTokens: totals.input,
    outputTokens: totals.output,
    cachedTokens: totals.cached,
    totalCost: totals.costUSD ?? ZERO,
    durationMs,
  });
}

/* ─── Full agent post-execution persistence ─── */
export interface AgentPostExecutionParams {
  executionId: string;
  sessionDbId: string;
  agentResult: AgentLoopResult;
  stepEvents: AgentStepEvent[];
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
  durationMs: number;
  model: string;
}

export async function persistAgentPostExecution(
  supabase: SupabaseClient,
  params: AgentPostExecutionParams
): Promise<void> {
  try {
    await persistAgentSteps({
      supabase,
      executionId: params.executionId,
      stepEvents: params.stepEvents,
      tokensLogs: params.agentResult.tokensLogs,
      model: params.model,
    });
    await persistAssistantMessage(supabase, {
      sessionDbId: params.sessionDbId,
      executionId: params.executionId,
      nodeId: params.currentNodeId,
      text: params.agentResult.finalText,
    });
    await persistCompletion(supabase, params.executionId, params.agentResult.totalTokens, params.durationMs);
    await updateSessionState(supabase, params.sessionDbId, {
      currentNodeId: params.currentNodeId,
      structuredOutputs: params.structuredOutputs,
    });
    refreshExecutionSummary(supabase).catch(() => {
      /* ignore refresh errors */
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown persistence error';
    process.stdout.write(`[execute] persistAgentPostExecution failed: ${msg}\n`);
  }
}
