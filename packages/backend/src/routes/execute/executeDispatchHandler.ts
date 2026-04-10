import type { DispatchSentinel } from '@daviddh/llm-graph-runner';

import { createPendingChildExecution } from '../../db/queries/childExecutionQueries.js';
import {
  createExecution,
  saveExecutionMessage,
  saveExecutionMessageRaw,
} from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { getStackDepth, pushStackEntry } from '../../db/queries/stackQueries.js';
import { type ResolvedChildConfig, resolveChildConfig } from '../simulateChildResolver.js';

/* ─── Constants ─── */

const MAX_NESTING_DEPTH = 10;
const DEPTH_INCREMENT = 1;

/* ─── Public types ─── */

interface ParentSessionState {
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
}

interface ParentToolCall {
  toolName: string;
  toolCallId?: string;
  input?: unknown;
}

export interface DispatchHandlerParams {
  supabase: SupabaseClient;
  sessionId: string;
  parentExecutionId: string;
  dispatchResult: DispatchSentinel;
  parentSessionState: ParentSessionState;
  orgId: string;
  agentId: string;
  version: number;
  apiKey: string;
  channel: string;
  tenantId: string;
  userId: string;
  parentToolCalls: ParentToolCall[];
}

/* ─── Depth check ─── */

async function assertDepthLimit(supabase: SupabaseClient, sessionId: string): Promise<number> {
  const depth = await getStackDepth(supabase, sessionId);
  if (depth + DEPTH_INCREMENT > MAX_NESTING_DEPTH) {
    throw new Error(`Max nesting depth (${String(MAX_NESTING_DEPTH)}) exceeded`);
  }
  return depth;
}

/* ─── Resolve child configuration ─── */

async function resolveChild(params: DispatchHandlerParams): Promise<ResolvedChildConfig> {
  return await resolveChildConfig({
    supabase: params.supabase,
    dispatchType: params.dispatchResult.type,
    params: params.dispatchResult.params,
    orgId: params.orgId,
  });
}

/* ─── Create child execution record ─── */

async function createChildExecution(params: DispatchHandlerParams, model: string): Promise<string> {
  return await createExecution(params.supabase, {
    sessionId: params.sessionId,
    agentId: params.agentId,
    orgId: params.orgId,
    version: params.version,
    model,
    channel: params.channel,
    tenantId: params.tenantId,
    userId: params.userId,
    parentExecutionId: params.parentExecutionId,
    isDynamicChild: params.dispatchResult.type === 'create_agent',
  });
}

/* ─── Write child's initial user message ─── */

async function writeChildTask(
  params: DispatchHandlerParams,
  childExecId: string,
  task: string
): Promise<void> {
  await saveExecutionMessage(params.supabase, {
    sessionId: params.sessionId,
    executionId: childExecId,
    nodeId: 'init',
    role: 'user',
    content: task,
  });
}

/* ─── Find dispatch tool call from parent ─── */

interface MatchedToolCall {
  toolName: string;
  toolCallId: string;
}

const DISPATCH_TOOL_NAMES = new Set(['invoke_agent', 'create_agent', 'invoke_workflow']);

function findDispatchToolCall(toolCalls: ParentToolCall[]): MatchedToolCall {
  const match = toolCalls.find((tc) => DISPATCH_TOOL_NAMES.has(tc.toolName));
  if (match === undefined) {
    throw new Error('No dispatch tool call found in parent tool calls');
  }
  return {
    toolName: match.toolName,
    toolCallId: match.toolCallId ?? match.toolName,
  };
}

/* ─── Create placeholder tool result message ─── */

async function writePlaceholderToolResult(
  params: DispatchHandlerParams,
  matched: MatchedToolCall
): Promise<string> {
  return await saveExecutionMessageRaw(params.supabase, {
    sessionId: params.sessionId,
    executionId: params.parentExecutionId,
    nodeId: 'child-dispatch',
    role: 'tool',
    content: {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: matched.toolCallId,
          toolName: matched.toolName,
          output: { type: 'text', value: '__CHILD_PENDING__' },
        },
      ],
    },
  });
}

/* ─── Convert ResolvedChildConfig to a plain record ─── */

function childConfigToRecord(config: ResolvedChildConfig): Record<string, unknown> {
  return {
    systemPrompt: config.systemPrompt,
    context: config.context,
    modelId: config.modelId,
    maxSteps: config.maxSteps,
    mcpServers: config.mcpServers,
    isChildAgent: config.isChildAgent,
    task: config.task,
  };
}

/* ─── Push stack and persist pending child ─── */

interface StackAndPendingParams {
  supabase: SupabaseClient;
  sessionId: string;
  depth: number;
  childExecId: string;
  parentExecutionId: string;
  placeholderMsgId: string;
  parentSessionState: ParentSessionState;
  matched: MatchedToolCall;
  childConfig: ResolvedChildConfig;
}

async function pushStackAndPending(params: StackAndPendingParams): Promise<void> {
  const appType = params.childConfig.isChildAgent ? 'agent' : 'workflow';

  await pushStackEntry(params.supabase, {
    sessionId: params.sessionId,
    depth: params.depth + DEPTH_INCREMENT,
    executionId: params.childExecId,
    parentExecutionId: params.parentExecutionId,
    parentToolOutputMessageId: params.placeholderMsgId,
    parentSessionState: {
      ...params.parentSessionState,
      toolCallId: params.matched.toolCallId,
      toolName: params.matched.toolName,
    },
    agentConfig: childConfigToRecord(params.childConfig),
    appType,
  });
}

async function writePendingChild(
  params: DispatchHandlerParams,
  childExecId: string,
  childConfig: ResolvedChildConfig
): Promise<void> {
  const appType = childConfig.isChildAgent ? 'agent' : 'workflow';

  await createPendingChildExecution(params.supabase, {
    sessionId: params.sessionId,
    executionId: childExecId,
    parentExecutionId: params.parentExecutionId,
    agentConfig: childConfigToRecord(childConfig),
    orgId: params.orgId,
    apiKeyEnc: params.apiKey,
    appType,
  });
}

/* ─── Suspend parent execution ─── */

async function suspendParentExecution(supabase: SupabaseClient, executionId: string): Promise<void> {
  const result = await supabase
    .from('agent_executions')
    .update({ status: 'suspended' })
    .eq('id', executionId);

  if (result.error !== null) {
    throw new Error(`Failed to suspend parent execution: ${result.error.message}`);
  }
}

/*
 * ─── Main handler ───
 *
 * Idempotency guarantees:
 * - `pending_child_executions.execution_id` has a UNIQUE constraint, preventing duplicate dispatch
 *   rows for the same child execution.
 * - If a stack entry exists but the pending row was not written (partial failure), the child
 *   will never execute — the pending-child worker only picks up rows from the pending table.
 * - Orphaned "suspended" parent executions are recovered by the resume worker timeout, which
 *   marks them as failed after a configurable interval.
 * - Full transaction wrapping is not possible with the Supabase JS client; the above constraints
 *   provide equivalent safety via idempotent writes and timeout-based recovery.
 */

export async function handleDispatchResult(params: DispatchHandlerParams): Promise<void> {
  const currentDepth = await assertDepthLimit(params.supabase, params.sessionId);
  const childConfig = await resolveChild(params);
  const childExecId = await createChildExecution(params, childConfig.modelId);

  await writeChildTask(params, childExecId, childConfig.task);

  const matched = findDispatchToolCall(params.parentToolCalls);
  const placeholderMsgId = await writePlaceholderToolResult(params, matched);

  await pushStackAndPending({
    supabase: params.supabase,
    sessionId: params.sessionId,
    depth: currentDepth,
    childExecId,
    parentExecutionId: params.parentExecutionId,
    placeholderMsgId,
    parentSessionState: params.parentSessionState,
    matched,
    childConfig,
  });

  await writePendingChild(params, childExecId, childConfig);
  await suspendParentExecution(params.supabase, params.parentExecutionId);
}
