import type { CallAgentOutput } from '@daviddh/llm-graph-runner';

import { saveExecutionMessageRaw } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ResolvedChildConfig } from '../simulateChildResolver.js';
import type { ExecuteCoreInput, ExecuteCoreOutput, OverrideAgentConfig } from './executeCoreTypes.js';
import type { FetchedData } from './executeFetcher.js';
import { logExec } from './executeHelpers.js';

export const DISPATCH_TOOLS = new Set(['invoke_agent', 'create_agent', 'invoke_workflow']);
const MAX_DEPTH = 10;
const INCREMENT = 1;
const LAST_OFFSET = 1;
const NO_VISITED = 0;

export function extractChildConfig(config: Record<string, unknown>): OverrideAgentConfig {
  return {
    systemPrompt: typeof config.systemPrompt === 'string' ? config.systemPrompt : '',
    context: typeof config.context === 'string' ? config.context : '',
    maxSteps: typeof config.maxSteps === 'number' ? config.maxSteps : null,
    modelId: typeof config.modelId === 'string' ? config.modelId : undefined,
    isChildAgent: true,
  };
}

export function getDispatchNode(output: CallAgentOutput, fallback: string): string {
  const { visitedNodes } = output;
  if (visitedNodes.length === NO_VISITED) return fallback;
  return visitedNodes[visitedNodes.length - LAST_OFFSET] ?? fallback;
}

function findToolCallId(output: CallAgentOutput): string {
  const match = output.toolCalls.find((tc) => DISPATCH_TOOLS.has(tc.toolName));
  return match?.toolCallId ?? match?.toolName ?? 'dispatch';
}

function childConfigToRecord(config: ResolvedChildConfig): Record<string, unknown> {
  return {
    systemPrompt: config.systemPrompt,
    context: config.context,
    modelId: config.modelId,
    maxSteps: config.maxSteps,
    isChildAgent: true,
  };
}

function findNextNodeAfterDispatch(
  graph: { edges: Array<{ from: string; to: string; preconditions?: Array<{ type: string }> }> },
  sourceNode: string
): string | undefined {
  const edge = graph.edges.find(
    (e) => e.from === sourceNode && (e.preconditions ?? []).some((p) => p.type === 'tool_call')
  );
  return edge?.to;
}

async function saveAssistantToolCallMsg(
  supabase: SupabaseClient,
  fetched: FetchedData,
  executionId: string,
  output: CallAgentOutput
): Promise<void> {
  const tc = output.toolCalls.find((t) => DISPATCH_TOOLS.has(t.toolName));
  if (tc === undefined) return;
  const callId = findToolCallId(output);
  const toolInput: unknown = tc.input;
  await saveExecutionMessageRaw(supabase, {
    sessionId: fetched.sessionDbId,
    executionId,
    nodeId: getDispatchNode(output, fetched.currentNodeId),
    role: 'assistant',
    content: {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: callId, toolName: tc.toolName, input: toolInput }],
    },
  });
}

async function writePlaceholder(
  supabase: SupabaseClient,
  sessionId: string,
  executionId: string,
  output: CallAgentOutput
): Promise<string> {
  const toolCallId = findToolCallId(output);
  const toolName = output.dispatchResult?.type ?? 'invoke_agent';
  return await saveExecutionMessageRaw(supabase, {
    sessionId,
    executionId,
    nodeId: 'child-dispatch',
    role: 'tool',
    content: {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId,
          toolName,
          output: { type: 'text', value: '__CHILD_PENDING__' },
        },
      ],
    },
  });
}

async function suspendExecution(supabase: SupabaseClient, executionId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_executions')
    .update({ status: 'suspended' })
    .eq('id', executionId);
  if (error !== null) logExec('suspend error', { executionId, error: error.message });
}

interface PushStackParams {
  supabase: SupabaseClient;
  params: ExecuteCoreInput;
  parentExecutionId: string;
  fetched: FetchedData;
  dispatch: { type: string; params: Record<string, unknown> };
  childConfig: ResolvedChildConfig;
  placeholderMsgId: string;
  output: CallAgentOutput;
}

async function pushStackForInlineDispatch(ctx: PushStackParams): Promise<void> {
  const { getStackDepth, pushStackEntry } = await import('../../db/queries/stackQueries.js');
  const depth = await getStackDepth(ctx.supabase, ctx.fetched.sessionDbId);
  if (depth + INCREMENT > MAX_DEPTH) {
    throw new Error(`Max nesting depth (${String(MAX_DEPTH)}) exceeded`);
  }
  const dispatchNode = getDispatchNode(ctx.output, ctx.fetched.currentNodeId);
  await pushStackEntry(ctx.supabase, {
    sessionId: ctx.fetched.sessionDbId,
    depth: depth + INCREMENT,
    executionId: ctx.parentExecutionId,
    parentExecutionId: ctx.parentExecutionId,
    parentToolOutputMessageId: ctx.placeholderMsgId,
    parentSessionState: {
      currentNodeId: ctx.fetched.currentNodeId,
      structuredOutputs: ctx.fetched.structuredOutputs,
      nextNodeId: findNextNodeAfterDispatch(ctx.fetched.graph, dispatchNode) ?? ctx.fetched.currentNodeId,
      toolCallId: findToolCallId(ctx.output),
      toolName: ctx.dispatch.type,
    },
    agentConfig: childConfigToRecord(ctx.childConfig),
    appType: ctx.dispatch.type === 'invoke_workflow' ? 'workflow' : 'agent',
    rootExecutionId: ctx.params.rootExecutionId ?? ctx.parentExecutionId,
  });
}

interface InlineDispatchContext {
  supabase: SupabaseClient;
  params: ExecuteCoreInput;
  parentExecutionId: string;
  fetched: FetchedData;
  output: CallAgentOutput;
  startTime: number;
  executeAgentCore: (input: ExecuteCoreInput) => Promise<ExecuteCoreOutput>;
}

function buildChildInput(ctx: InlineDispatchContext, childConfig: ResolvedChildConfig): ExecuteCoreInput {
  return {
    supabase: ctx.supabase,
    orgId: ctx.params.orgId,
    agentId: childConfig.agentId ?? ctx.params.agentId,
    version: childConfig.version ?? ctx.params.version,
    input: {
      ...ctx.params.input,
      message: { text: childConfig.task },
    },
    rootExecutionId: ctx.params.rootExecutionId ?? ctx.parentExecutionId,
    parentExecutionId: ctx.parentExecutionId,
    overrideAgentConfig: extractChildConfig(childConfigToRecord(childConfig)),
  };
}

export async function handleInlineDispatch(ctx: InlineDispatchContext): Promise<ExecuteCoreOutput> {
  const { output, parentExecutionId, fetched, supabase, params, startTime } = ctx;
  const { dispatchResult } = output;
  if (dispatchResult === undefined) throw new Error('handleInlineDispatch called without dispatchResult');

  logExec('inline dispatch', { type: dispatchResult.type, parentExecId: parentExecutionId });

  const { resolveChildConfig } = await import('../simulateChildResolver.js');
  const childConfig = await resolveChildConfig({
    supabase,
    dispatchType: dispatchResult.type,
    params: dispatchResult.params,
    orgId: params.orgId,
  });

  await saveAssistantToolCallMsg(supabase, fetched, parentExecutionId, output);
  const placeholderMsgId = await writePlaceholder(supabase, fetched.sessionDbId, parentExecutionId, output);
  await suspendExecution(supabase, parentExecutionId);
  await pushStackForInlineDispatch({
    supabase,
    params,
    parentExecutionId,
    fetched,
    dispatch: dispatchResult,
    childConfig,
    placeholderMsgId,
    output,
  });

  const childInput = buildChildInput(ctx, childConfig);
  const childResult = await ctx.executeAgentCore(childInput);
  const totalDuration = Date.now() - startTime;
  return { ...childResult, durationMs: totalDuration, appType: fetched.appType };
}
