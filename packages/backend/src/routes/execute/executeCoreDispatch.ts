import type { CallAgentOutput } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ExecuteCoreInput } from './executeCore.js';
import { handleDispatchResult } from './executeDispatchHandler.js';
import type { FetchedData } from './executeFetcher.js';

/* ─── Types ─── */

interface DispatchCheckParams {
  supabase: SupabaseClient;
  params: ExecuteCoreInput;
  executionId: string;
  fetched: FetchedData;
  output: CallAgentOutput;
}

/* ─── Map tool calls to the simpler shape for dispatch ─── */

function mapToolCalls(
  output: CallAgentOutput
): Array<{ toolName: string; toolCallId?: string; input?: unknown }> {
  return output.toolCalls.map((tc) => ({
    toolName: tc.toolName,
    toolCallId: tc.toolCallId,
    input: tc.input as unknown,
  }));
}

/* ─── Dispatch if output contains a dispatch result ─── */

export async function dispatchIfNeeded(ctx: DispatchCheckParams): Promise<void> {
  if (ctx.output.dispatchResult === undefined) return;

  await handleDispatchResult({
    supabase: ctx.supabase,
    sessionId: ctx.fetched.sessionDbId,
    parentExecutionId: ctx.executionId,
    dispatchResult: ctx.output.dispatchResult,
    parentSessionState: {
      currentNodeId: ctx.fetched.currentNodeId,
      structuredOutputs: ctx.fetched.structuredOutputs,
    },
    orgId: ctx.params.orgId,
    agentId: ctx.params.agentId,
    version: ctx.params.version,
    apiKey: ctx.fetched.apiKey,
    channel: ctx.params.input.channel,
    tenantId: ctx.params.input.tenantId,
    userId: ctx.params.input.userId,
    parentToolCalls: mapToolCalls(ctx.output),
    rootExecutionId: ctx.params.rootExecutionId ?? ctx.executionId,
  });
}
