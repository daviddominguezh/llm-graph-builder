import type { CallAgentOutput, NodeProcessedEvent } from '@daviddh/llm-graph-runner';

import { saveExecutionMessageRaw } from '../../db/queries/executionQueries.js';
import { getOrCreateSession } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { getStackTop } from '../../db/queries/stackQueries.js';
import type { NodeProcessedData } from './edgeFunctionClient.js';
import { executeAgent } from './edgeFunctionClient.js';
import {
  type BuildCoreParamsOptions,
  buildCoreExecuteParams,
  fetchAllCoreData,
  persistMessagingPostExecution,
  persistMessagingPreExecution,
  resolveVfsCorePayload,
} from './executeCoreHelpers.js';
import {
  type FetchedData,
  type OverrideAgentConfig,
  fetchChildMessages,
  fetchResumeMessages,
} from './executeFetcher.js';
import { buildUserMessage, extractTextFromInput, logExec } from './executeHelpers.js';
import { persistPostExecution, persistPreExecution } from './executePersistence.js';
import { getLastVisitedNode, mergeStructuredOutputs } from './executeResponseBuilders.js';
import type { AgentExecutionInput } from './executeTypes.js';

/* ─── Public types ─── */

export type { OverrideAgentConfig };

export interface ExecuteCoreInput {
  supabase: SupabaseClient;
  orgId: string;
  agentId: string;
  version: number;
  input: AgentExecutionInput;
  /** Pre-existing conversation ID (webhook channels pass this to skip messaging pre-writes) */
  conversationId?: string;
  /** When set, reuse an existing execution record instead of creating a new one */
  continueExecutionId?: string;
  /**
   * When set, overrides the agent config loaded from the published agent version.
   * Used for dynamically created children (create_agent) which have no published agent.
   */
  overrideAgentConfig?: OverrideAgentConfig;
  /** Pre-generated execution ID (enables subscribe-before-dispatch) */
  executionId?: string;
  /** Root execution ID for composition notification routing */
  rootExecutionId?: string;
  /** Parent execution ID — set for child executions so they're findable by parent */
  parentExecutionId?: string;
}

export interface ExecuteCoreOutput {
  executionId: string;
  output: CallAgentOutput | null;
  nodeData: NodeProcessedData[];
  durationMs: number;
  appType: string;
}

export interface ExecuteCoreCallbacks {
  onNodeVisited: (nodeId: string) => void;
  onNodeProcessed: (event: NodeProcessedEvent) => void;
}

/* ─── No-op callback ─── */

function noop(): void {
  // intentionally empty
}

const DEFAULT_MODEL = 'x-ai/grok-4.1-fast';

/* ─── Pre-execution setup ─── */

interface SetupResult {
  fetched: FetchedData;
  executionId: string;
  conversationId: string | null;
  model: string;
}

async function setupExecution(params: ExecuteCoreInput): Promise<SetupResult> {
  const { supabase, orgId, agentId, version, input } = params;
  const configModel = params.overrideAgentConfig?.modelId;
  const model =
    configModel !== undefined && configModel !== '' ? configModel : (input.model ?? DEFAULT_MODEL);

  const fetched = await fetchAllCoreData({
    supabase,
    agentId,
    orgId,
    version,
    input,
    model,
    overrideAgentConfig: params.overrideAgentConfig,
  });
  logExec('core:fetched', { appType: fetched.appType, node: fetched.currentNodeId });

  /* On continue (parent resume after child finishes), load only the parent execution's own messages.
     This prevents child multi-turn conversation from leaking into the parent's message array. */
  if (params.continueExecutionId !== undefined) {
    fetched.messageHistory = await fetchResumeMessages(supabase, params.continueExecutionId, input.channel);
    return { fetched, executionId: params.continueExecutionId, conversationId: null, model };
  }

  fetched.messageHistory = [...fetched.messageHistory, buildUserMessage(input)];

  const [{ executionId }, conversationId] = await Promise.all([
    persistPreExecution(supabase, {
      sessionDbId: fetched.sessionDbId,
      agentId,
      orgId,
      version,
      model,
      channel: input.channel,
      tenantId: input.tenantId,
      userId: input.userId,
      userMessageContent: extractTextFromInput(input),
      currentNodeId: fetched.currentNodeId,
      executionId: params.executionId,
      parentExecutionId: params.parentExecutionId,
    }),
    resolveConversationId(supabase, params),
  ]);

  return { fetched, executionId, conversationId, model };
}

/* ─── Resolve conversation ID ─── */

async function resolveConversationId(
  supabase: SupabaseClient,
  params: ExecuteCoreInput
): Promise<string | null> {
  if (params.conversationId !== undefined) return params.conversationId;

  return await persistMessagingPreExecution(supabase, {
    orgId: params.orgId,
    agentId: params.agentId,
    tenantId: params.input.tenantId,
    userChannelId: params.input.userId,
    sessionId: params.input.sessionId,
    channel: params.input.channel,
    messageContent: extractTextFromInput(params.input),
  });
}

/* ─── Child routing: when a child is active on the stack, route to it ─── */

function extractChildConfig(config: Record<string, unknown>): OverrideAgentConfig {
  return {
    systemPrompt: typeof config['systemPrompt'] === 'string' ? config['systemPrompt'] : '',
    context: typeof config['context'] === 'string' ? config['context'] : '',
    maxSteps: typeof config['maxSteps'] === 'number' ? config['maxSteps'] : null,
    modelId: typeof config['modelId'] === 'string' ? config['modelId'] : undefined,
    isChildAgent: true,
  };
}

async function resolveChildOverride(
  fetched: FetchedData,
  params: ExecuteCoreInput
): Promise<OverrideAgentConfig | undefined> {
  // Only redirect if there's an active child AND this is NOT already a child/resume execution
  if (fetched.stackTop === null) return undefined;
  if (params.continueExecutionId !== undefined) return undefined;

  const parentExecId = fetched.stackTop.parent_execution_id ?? '';
  logExec('routing to active child', { parentExecId });

  // Load ONLY messages from child executions (not the parent workflow's messages).
  // The current user message is already persisted by setupExecution with parent_execution_id set,
  // so the DB query will include it — no need to append manually.
  const stackExecId = fetched.stackTop.execution_id;
  fetched.messageHistory = await fetchChildMessages(
    params.supabase,
    parentExecId,
    params.input.channel,
    stackExecId
  );

  // Switch to agent mode and clear parent's agentConfig so the child override takes effect cleanly
  fetched.appType = 'agent';
  fetched.agentConfig = null;
  // Mark this execution as a child so its messages are findable on subsequent turns
  params.parentExecutionId = parentExecId;

  return extractChildConfig(fetched.stackTop.agent_config);
}

/* ─── Pre-check: set parentExecutionId before setupExecution ─── */

async function presetParentExecutionId(supabase: SupabaseClient, params: ExecuteCoreInput): Promise<void> {
  if (params.parentExecutionId !== undefined) return; // Already set (child worker or recursive)
  if (params.continueExecutionId !== undefined) return; // Resume path

  // Quick check: does this session have an active child on the stack?
  const sessionResult = await getOrCreateSession(supabase, {
    agentId: params.agentId,
    orgId: params.orgId,
    version: params.version,
    tenantId: params.input.tenantId,
    userId: params.input.userId,
    sessionId: params.input.sessionId,
    channel: params.input.channel,
    model: '',
  });
  if (sessionResult.session === null) return;

  const stackTop = await getStackTop(supabase, sessionResult.session.id);
  if (stackTop === null) return;

  // Active child exists — mark this execution as a child of the parent
  params.parentExecutionId = stackTop.parent_execution_id ?? undefined;
}

/* ─── Inline dispatch: resolve child and execute recursively ─── */

const DISPATCH_TOOLS = new Set(['invoke_agent', 'create_agent', 'invoke_workflow']);

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

async function handleInlineDispatch(
  supabase: SupabaseClient,
  params: ExecuteCoreInput,
  parentExecutionId: string,
  fetched: FetchedData,
  output: CallAgentOutput,
  startTime: number
): Promise<ExecuteCoreOutput> {
  const dispatch = output.dispatchResult!;
  logExec('inline dispatch', { type: dispatch.type, parentExecId: parentExecutionId });

  // Resolve child agent config (same as what the worker/simulation does)
  const { resolveChildConfig } = await import('../simulateChildResolver.js');
  const childConfig = await resolveChildConfig({
    supabase,
    dispatchType: dispatch.type as 'invoke_agent' | 'invoke_workflow' | 'create_agent',
    params: dispatch.params,
    orgId: params.orgId,
  });

  // Save the assistant's tool-call message (the invoke_agent/invoke_workflow call)
  await saveAssistantToolCallMsg(supabase, fetched, parentExecutionId, output);

  // Write placeholder tool result (will be updated with real output when child finishes)
  const placeholderMsgId = await writePlaceholder(supabase, fetched.sessionDbId, parentExecutionId, output);

  // Suspend the parent
  await suspendExecution(supabase, parentExecutionId);

  // Push stack entry for composition tracking
  await pushStackForInlineDispatch(
    supabase,
    params,
    parentExecutionId,
    fetched,
    dispatch,
    childConfig,
    placeholderMsgId,
    output
  );

  // Build child execution input
  const childInput: ExecuteCoreInput = {
    supabase,
    orgId: params.orgId,
    agentId: childConfig.agentId ?? params.agentId,
    version: childConfig.version ?? params.version,
    input: {
      ...params.input,
      message: { text: childConfig.task },
    },
    rootExecutionId: params.rootExecutionId ?? parentExecutionId,
    parentExecutionId,
    overrideAgentConfig: extractChildConfig(childConfigToRecord(childConfig)),
  };

  // Recursive call — if the child dispatches too, this recurses
  const childResult = await executeAgentCore(childInput);

  const totalDuration = Date.now() - startTime;
  return { ...childResult, durationMs: totalDuration, appType: fetched.appType };
}

async function suspendExecution(supabase: SupabaseClient, executionId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_executions')
    .update({ status: 'suspended' })
    .eq('id', executionId);
  if (error !== null) logExec('suspend error', { executionId, error: error.message });
}

function childConfigToRecord(config: {
  systemPrompt: string;
  context: string;
  modelId: string;
  maxSteps: number | null;
}): Record<string, unknown> {
  return {
    systemPrompt: config.systemPrompt,
    context: config.context,
    modelId: config.modelId,
    maxSteps: config.maxSteps,
    isChildAgent: true,
  };
}

function findToolCallId(output: CallAgentOutput): string {
  const match = output.toolCalls.find((tc) => DISPATCH_TOOLS.has(tc.toolName));
  return match?.toolCallId ?? match?.toolName ?? 'dispatch';
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

async function pushStackForInlineDispatch(
  supabase: SupabaseClient,
  params: ExecuteCoreInput,
  parentExecutionId: string,
  fetched: FetchedData,
  dispatch: { type: string; params: Record<string, unknown> },
  childConfig: { task: string },
  placeholderMsgId: string,
  output: CallAgentOutput
): Promise<void> {
  const { getStackDepth, pushStackEntry } = await import('../../db/queries/stackQueries.js');
  const depth = await getStackDepth(supabase, fetched.sessionDbId);
  const MAX_DEPTH = 10;
  const INCREMENT = 1;
  if (depth + INCREMENT > MAX_DEPTH) {
    throw new Error(`Max nesting depth (${String(MAX_DEPTH)}) exceeded`);
  }
  await pushStackEntry(supabase, {
    sessionId: fetched.sessionDbId,
    depth: depth + INCREMENT,
    executionId: parentExecutionId,
    parentExecutionId,
    parentToolOutputMessageId: placeholderMsgId,
    parentSessionState: {
      currentNodeId: fetched.currentNodeId,
      structuredOutputs: fetched.structuredOutputs,
      // Use the LAST visited node (the actual dispatch node), not fetched.currentNodeId (session start)
      nextNodeId:
        findNextNodeAfterDispatch(fetched.graph, getDispatchNode(output, fetched.currentNodeId)) ??
        fetched.currentNodeId,
      toolCallId: findToolCallId(output),
      toolName: dispatch.type,
    },
    agentConfig: childConfigToRecord(
      childConfig as unknown as {
        systemPrompt: string;
        context: string;
        modelId: string;
        maxSteps: number | null;
      }
    ),
    appType: dispatch.type === 'invoke_workflow' ? 'workflow' : 'agent',
    rootExecutionId: params.rootExecutionId ?? parentExecutionId,
  });
}

/* ─── Core execution function ─── */

export async function executeAgentCore(
  params: ExecuteCoreInput,
  callbacks?: ExecuteCoreCallbacks
): Promise<ExecuteCoreOutput> {
  const { supabase, input } = params;

  // Pre-check: if there's already an active child from a previous turn, set parentExecutionId
  // BEFORE setupExecution so the new execution record gets parent_execution_id set correctly.
  await presetParentExecutionId(supabase, params);

  const { fetched, executionId, conversationId, model } = await setupExecution(params);

  // When there's an active child on the stack, route to the child agent instead of the parent
  const childOverride = await resolveChildOverride(fetched, params);

  const vfsPayload = await resolveVfsCorePayload(supabase, fetched, params.agentId, params.orgId);
  const buildOptions: BuildCoreParamsOptions = {
    vfsPayload,
    overrideAgentConfig: childOverride ?? params.overrideAgentConfig,
  };
  const edgeParams = buildCoreExecuteParams(fetched, input, model, buildOptions);
  const startTime = Date.now();

  const { output, nodeData } = await executeAgent(edgeParams, {
    onNodeVisited: callbacks?.onNodeVisited ?? noop,
    onNodeProcessed: callbacks?.onNodeProcessed ?? noop,
  });

  const durationMs = Date.now() - startTime;

  if (output !== null) {
    if (output.dispatchResult !== undefined) {
      // Child dispatch detected — handle inline (recursive execution, no workers)
      return await handleInlineDispatch(supabase, params, executionId, fetched, output, startTime);
    }

    await persistCoreResult(supabase, {
      executionId,
      fetched,
      output,
      nodeData,
      durationMs,
      model,
      conversationId,
      input,
    });

    // Child called finish — pop stack, resume parent workflow
    if (output.finishResult !== undefined && fetched.stackTop !== null) {
      return await handleChildFinish(supabase, params, fetched, output, startTime);
    }
  }

  logExec('core:complete', { executionId, durationMs, hasOutput: output !== null });
  return { executionId, output, nodeData, durationMs, appType: fetched.appType };
}

/* ─── Handle child finish: pop stack, resume parent ─── */

async function handleChildFinish(
  supabase: SupabaseClient,
  params: ExecuteCoreInput,
  fetched: FetchedData,
  output: CallAgentOutput,
  startTime: number
): Promise<ExecuteCoreOutput> {
  const stack = fetched.stackTop!;
  const finishOutput = output.finishResult!.output;
  logExec('child finished, resuming parent', { parentExecId: stack.parent_execution_id });

  // Read pre-computed values from the stack's parentSessionState
  const state = stack.parent_session_state ?? {};
  const toolCallId = typeof state['toolCallId'] === 'string' ? state['toolCallId'] : 'dispatch';
  const toolName = typeof state['toolName'] === 'string' ? state['toolName'] : 'invoke_agent';
  const nextNodeId = typeof state['nextNodeId'] === 'string' ? state['nextNodeId'] : '';
  const structuredOutputs =
    typeof state['structuredOutputs'] === 'object' && state['structuredOutputs'] !== null
      ? (state['structuredOutputs'] as Record<string, unknown[]>)
      : {};

  // Use the PARENT's session (from the stack entry, not the child's fetched data)
  const parentSessionId = stack.session_id;

  // Update placeholder tool result with the child's actual output
  const { updateToolOutputMessage, updateSessionState } =
    await import('../../db/queries/executionQueries.js');
  if (stack.parent_tool_output_message_id !== null) {
    await updateToolOutputMessage(supabase, stack.parent_tool_output_message_id, {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId,
          toolName,
          output: { type: 'text', value: finishOutput },
        },
      ],
    });
  }

  // Advance parent session to the next node (pre-computed from parent's graph during dispatch)
  logExec('handleChildFinish session update', {
    parentSessionId,
    nextNodeId,
    parentExecId: stack.parent_execution_id,
  });
  await updateSessionState(supabase, parentSessionId, {
    currentNodeId: nextNodeId,
    structuredOutputs,
  });

  // Pop stack
  const { popStackEntry } = await import('../../db/queries/stackQueries.js');
  await popStackEntry(supabase, parentSessionId);

  // Resume parent workflow
  const parentExecId = stack.parent_execution_id ?? '';
  const parentResult = await executeAgentCore({
    supabase,
    orgId: params.orgId,
    agentId: params.agentId,
    version: params.version,
    input: { ...params.input, message: { text: '' } },
    continueExecutionId: parentExecId,
    rootExecutionId: params.rootExecutionId,
  });

  const totalDuration = Date.now() - startTime;
  return { ...parentResult, durationMs: totalDuration };
}

function getDispatchNode(output: CallAgentOutput, fallback: string): string {
  const visited = output.visitedNodes;
  const LAST_OFFSET = 1;
  return visited.length > 0 ? (visited[visited.length - LAST_OFFSET] ?? fallback) : fallback;
}

function findNextNodeAfterDispatch(
  graph: { edges: Array<{ from: string; to: string; preconditions?: Array<{ type: string }> }> },
  sourceNode: string
): string | undefined {
  const edge = graph.edges.find(
    (e) => e.from === sourceNode && e.preconditions?.some((p) => p.type === 'tool_call')
  );
  return edge?.to;
}

/* ─── Post-execution persistence ─── */

interface PersistCoreParams {
  executionId: string;
  fetched: FetchedData;
  output: CallAgentOutput;
  nodeData: NodeProcessedData[];
  durationMs: number;
  model: string;
  conversationId: string | null;
  input: AgentExecutionInput;
}

async function persistCoreResult(supabase: SupabaseClient, params: PersistCoreParams): Promise<void> {
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

  /* Skip messaging persistence on continue — conversationId is null when resuming a parent */
  if (params.conversationId !== null) {
    await persistMessagingPostExecution(supabase, {
      conversationId: params.conversationId,
      responseText: params.output.text ?? '',
      tenantId: params.input.tenantId,
    });
  }
}
