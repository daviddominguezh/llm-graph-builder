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
import type { NodeProcessedData } from './edgeFunctionClient.js';

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
  executionId?: string;
  parentExecutionId?: string;
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
    executionId: params.executionId,
    parentExecutionId: params.parentExecutionId,
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
  nodeData: NodeProcessedData[];
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

interface ParsedResultEntry {
  nextNodeID: string;
  messageToUser?: string;
}

interface StructuredOutputEntry {
  nodeId: string;
  data: unknown;
}

interface NodeResponseContext {
  parsedResult: ParsedResultEntry | undefined;
  structuredOutput: StructuredOutputEntry | undefined;
  processed: NodeProcessedData | undefined;
}

function getNodeResponseContext(
  result: CallAgentOutput,
  nodeId: string,
  index: number,
  nodeData: NodeProcessedData[]
): NodeResponseContext {
  const raw = result.parsedResults?.[index] as ParsedResultEntry | undefined;
  const so = result.structuredOutputs?.find((s) => s.nodeId === nodeId) as StructuredOutputEntry | undefined;
  return { parsedResult: raw, structuredOutput: so, processed: nodeData.find((n) => n.nodeId === nodeId) };
}

function parsedResultFields(parsedResult: ParsedResultEntry | undefined): Record<string, unknown> {
  const { messageToUser, nextNodeID } = parsedResult ?? {};
  const fields: Record<string, unknown> = {};
  if (messageToUser !== undefined && messageToUser !== '') {
    fields.text = messageToUser;
  }
  if (nextNodeID !== undefined && nextNodeID !== '') {
    fields.nextNodeID = nextNodeID;
  }
  return fields;
}

function processedFields(processed: NodeProcessedData | undefined): Record<string, unknown> {
  if (processed === undefined) return {};
  const { toolCalls, error } = processed;
  const fields: Record<string, unknown> = {};
  if (toolCalls.length > ZERO) {
    fields.tool_calls = toolCalls;
  }
  if (error !== undefined && error !== '') {
    fields.error = error;
  }
  return fields;
}

function buildNodeResponse(ctx: NodeResponseContext): unknown {
  if (ctx.processed?.responseMessages !== undefined) {
    return ctx.processed.responseMessages;
  }
  const { parsedResult, structuredOutput, processed } = ctx;
  return {
    ...parsedResultFields(parsedResult),
    ...(structuredOutput === undefined ? {} : { structured_output: structuredOutput.data }),
    ...processedFields(processed),
  };
}

interface PersistNodeVisitsParams {
  supabase: SupabaseClient;
  executionId: string;
  result: CallAgentOutput;
  model: string;
  nodeData: NodeProcessedData[];
}

async function persistNodeVisits(params: PersistNodeVisitsParams): Promise<void> {
  const { supabase, executionId, result, model, nodeData } = params;
  const saves = result.tokensLogs.map(async (log, index) => {
    const ctx = getNodeResponseContext(result, log.action, index, nodeData);
    await saveNodeVisit(supabase, {
      executionId,
      nodeId: log.action,
      stepOrder: index,
      messagesSent: result.debugMessages[log.action] ?? [],
      response: buildNodeResponse(ctx),
      inputTokens: log.tokens.input,
      outputTokens: log.tokens.output,
      cachedTokens: log.tokens.cached,
      cost: log.tokens.costUSD ?? ZERO,
      durationMs: ctx.processed?.durationMs ?? ZERO,
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
    await persistNodeVisits({
      supabase,
      executionId: params.executionId,
      result: params.result,
      model: params.model,
      nodeData: params.nodeData,
    });
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
