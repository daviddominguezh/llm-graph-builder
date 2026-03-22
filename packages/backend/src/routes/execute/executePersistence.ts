import type { CallAgentOutput } from '@daviddh/llm-graph-runner';

import {
  completeExecution,
  createExecution,
  refreshExecutionSummary,
  saveExecutionMessage,
  saveNodeVisit,
  updateSessionState,
} from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ─── Pre-execution persistence ─── */

interface PreExecutionParams {
  sessionDbId: string;
  agentId: string;
  orgId: string;
  version: number;
  model: string;
  channel: string;
  tenantId: string;
  userId: string;
  userMessageContent: string;
  currentNodeId: string;
}

interface PreExecutionResult {
  executionId: string;
}

export async function persistPreExecution(
  supabase: SupabaseClient,
  params: PreExecutionParams
): Promise<PreExecutionResult> {
  const executionId = await createExecution(supabase, {
    sessionId: params.sessionDbId,
    agentId: params.agentId,
    orgId: params.orgId,
    version: params.version,
    model: params.model,
    channel: params.channel,
    tenantId: params.tenantId,
    userId: params.userId,
  });

  await saveExecutionMessage(supabase, {
    sessionId: params.sessionDbId,
    executionId,
    nodeId: params.currentNodeId,
    role: 'user',
    content: params.userMessageContent,
  });

  return { executionId };
}

/* ─── Post-execution persistence ─── */

export interface PostExecutionParams {
  executionId: string;
  sessionDbId: string;
  result: CallAgentOutput;
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
  durationMs: number;
  model: string;
}

const ZERO = 0;

function sumTokenTotals(result: CallAgentOutput): { input: number; output: number; cached: number } {
  let input = ZERO;
  let output = ZERO;
  let cached = ZERO;
  for (const log of result.tokensLogs) {
    input += log.tokens.input;
    output += log.tokens.output;
    cached += log.tokens.cached;
  }
  return { input, output, cached };
}

function sumTotalCost(result: CallAgentOutput): number {
  let total = ZERO;
  for (const log of result.tokensLogs) {
    total += log.tokens.costUSD ?? ZERO;
  }
  return total;
}

async function persistNodeVisits(
  supabase: SupabaseClient,
  executionId: string,
  result: CallAgentOutput,
  model: string
): Promise<void> {
  const saves = result.tokensLogs.map(async (log, index) => {
    await saveNodeVisit(supabase, {
      executionId,
      nodeId: log.action,
      stepOrder: index,
      messagesSent: result.debugMessages[log.action] ?? [],
      response: { text: result.text ?? '' },
      inputTokens: log.tokens.input,
      outputTokens: log.tokens.output,
      cachedTokens: log.tokens.cached,
      cost: log.tokens.costUSD ?? ZERO,
      durationMs: ZERO,
      model,
    });
  });
  await Promise.all(saves);
}

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

async function persistCompletion(
  supabase: SupabaseClient,
  executionId: string,
  result: CallAgentOutput,
  durationMs: number
): Promise<void> {
  const totals = sumTokenTotals(result);
  await completeExecution(supabase, executionId, {
    inputTokens: totals.input,
    outputTokens: totals.output,
    cachedTokens: totals.cached,
    totalCost: sumTotalCost(result),
    durationMs,
  });
}

export async function persistPostExecution(
  supabase: SupabaseClient,
  params: PostExecutionParams
): Promise<void> {
  try {
    await persistNodeVisits(supabase, params.executionId, params.result, params.model);
    await persistAssistantMessage(supabase, {
      sessionDbId: params.sessionDbId,
      executionId: params.executionId,
      nodeId: params.currentNodeId,
      text: params.result.text ?? '',
    });
    await persistCompletion(supabase, params.executionId, params.result, params.durationMs);
    await updateSessionState(supabase, params.sessionDbId, {
      currentNodeId: params.currentNodeId,
      structuredOutputs: params.structuredOutputs,
    });

    // Fire and forget — refresh materialized view for dashboards
    refreshExecutionSummary(supabase).catch(() => {
      /* ignore refresh errors */
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown persistence error';
    process.stdout.write(`[execute] persistPostExecution failed: ${msg}\n`);
  }
}
