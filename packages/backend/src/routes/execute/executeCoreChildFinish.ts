import type { CallAgentOutput } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { NodeProcessedData } from './edgeFunctionClient.js';
import { persistMessagingPostExecution } from './executeCoreHelpers.js';
import type { ExecuteCoreInput, ExecuteCoreOutput } from './executeCoreTypes.js';
import type { FetchedData } from './executeFetcher.js';
import { logExec } from './executeHelpers.js';
import { persistPostExecution } from './executePersistence.js';
import { getLastVisitedNode, mergeStructuredOutputs } from './executeResponseBuilders.js';
import type { AgentExecutionInput } from './executeTypes.js';

interface ParentState {
  toolCallId: string;
  toolName: string;
  nextNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
}

function isStructuredOutputs(value: unknown): value is Record<string, unknown[]> {
  return typeof value === 'object' && value !== null;
}

function parseParentState(state: Record<string, unknown>): ParentState {
  const structuredOutputs = isStructuredOutputs(state.structuredOutputs) ? state.structuredOutputs : {};
  return {
    toolCallId: typeof state.toolCallId === 'string' ? state.toolCallId : 'dispatch',
    toolName: typeof state.toolName === 'string' ? state.toolName : 'invoke_agent',
    nextNodeId: typeof state.nextNodeId === 'string' ? state.nextNodeId : '',
    structuredOutputs,
  };
}

async function updatePlaceholderMessage(
  supabase: SupabaseClient,
  messageId: string,
  parentState: ParentState,
  finishOutput: unknown
): Promise<void> {
  const { updateToolOutputMessage } = await import('../../db/queries/executionQueries.js');
  await updateToolOutputMessage(supabase, messageId, {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: parentState.toolCallId,
        toolName: parentState.toolName,
        output: { type: 'text', value: finishOutput },
      },
    ],
  });
}

interface HandleChildFinishContext {
  supabase: SupabaseClient;
  params: ExecuteCoreInput;
  fetched: FetchedData;
  output: CallAgentOutput;
  startTime: number;
  executeAgentCore: (input: ExecuteCoreInput) => Promise<ExecuteCoreOutput>;
}

type StackEntry = NonNullable<FetchedData['stackTop']>;

async function applyParentStateUpdates(
  supabase: SupabaseClient,
  stack: StackEntry,
  parentState: ParentState,
  finishOutput: unknown
): Promise<void> {
  const { updateSessionState } = await import('../../db/queries/executionQueries.js');
  if (stack.parent_tool_output_message_id !== null) {
    await updatePlaceholderMessage(supabase, stack.parent_tool_output_message_id, parentState, finishOutput);
  }

  logExec('handleChildFinish session update', {
    parentSessionId: stack.session_id,
    nextNodeId: parentState.nextNodeId,
    parentExecId: stack.parent_execution_id,
  });
  await updateSessionState(supabase, stack.session_id, {
    currentNodeId: parentState.nextNodeId,
    structuredOutputs: parentState.structuredOutputs,
  });

  const { popStackEntry } = await import('../../db/queries/stackQueries.js');
  await popStackEntry(supabase, stack.session_id);
}

export async function handleChildFinish(ctx: HandleChildFinishContext): Promise<ExecuteCoreOutput> {
  const { supabase, params, fetched, output, startTime } = ctx;
  const { stackTop: stack } = fetched;
  if (stack === null) throw new Error('handleChildFinish requires stackTop');
  const { finishResult } = output;
  if (finishResult === undefined) throw new Error('handleChildFinish requires finishResult');

  logExec('child finished, resuming parent', { parentExecId: stack.parent_execution_id });

  const parentState = parseParentState(stack.parent_session_state ?? {});
  await applyParentStateUpdates(supabase, stack, parentState, finishResult.output);

  const parentExecId = stack.parent_execution_id ?? '';
  const parentResult = await ctx.executeAgentCore({
    supabase,
    orgId: params.orgId,
    agentId: params.agentId,
    version: params.version,
    input: { ...params.input, message: { text: '' } },
    continueExecutionId: parentExecId,
    rootExecutionId: params.rootExecutionId,
  });

  return { ...parentResult, durationMs: Date.now() - startTime };
}

export interface PersistCoreParams {
  executionId: string;
  fetched: FetchedData;
  output: CallAgentOutput;
  nodeData: NodeProcessedData[];
  durationMs: number;
  model: string;
  conversationId: string | null;
  input: AgentExecutionInput;
}

export async function persistCoreResult(supabase: SupabaseClient, params: PersistCoreParams): Promise<void> {
  const newNodeId = getLastVisitedNode(params.output, params.fetched.currentNodeId);
  const newOutputs = mergeStructuredOutputs(params.fetched.structuredOutputs, params.output);

  await persistPostExecution(supabase, {
    executionId: params.executionId,
    sessionDbId: params.fetched.sessionDbId,
    result: params.output,
    currentNodeId: newNodeId,
    structuredOutputs: newOutputs,
    durationMs: params.durationMs,
    model: params.model,
    nodeData: params.nodeData,
  });

  if (params.conversationId !== null) {
    await persistMessagingPostExecution(supabase, {
      conversationId: params.conversationId,
      responseText: params.output.text ?? '',
      tenantId: params.input.tenantId,
    });
  }
}
