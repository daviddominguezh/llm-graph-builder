import type { CallAgentOutput, NodeProcessedEvent } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { NodeProcessedData } from './edgeFunctionClient.js';
import { executeAgent } from './edgeFunctionClient.js';
import { dispatchIfNeeded } from './executeCoreDispatch.js';
import {
  type BuildCoreParamsOptions,
  buildCoreExecuteParams,
  fetchAllCoreData,
  persistMessagingPostExecution,
  persistMessagingPreExecution,
  resolveVfsCorePayload,
} from './executeCoreHelpers.js';
import { type FetchedData, type OverrideAgentConfig, fetchChildMessages } from './executeFetcher.js';
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
  const model = (configModel !== undefined && configModel !== '') ? configModel : (input.model ?? DEFAULT_MODEL);

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

  /* On continue, the parent's message history already contains the tool result — skip adding a user message */
  if (params.continueExecutionId !== undefined) {
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
  // The new user message was already appended to messageHistory by setupExecution — preserve it.
  const newUserMessage = fetched.messageHistory[fetched.messageHistory.length - 1];
  const stackExecId = fetched.stackTop.execution_id;
  const childMessages = await fetchChildMessages(
    params.supabase,
    parentExecId,
    params.input.channel,
    stackExecId
  );
  fetched.messageHistory = newUserMessage !== undefined ? [...childMessages, newUserMessage] : childMessages;

  // Switch to agent mode and clear parent's agentConfig so the child override takes effect cleanly
  fetched.appType = 'agent';
  fetched.agentConfig = null;
  // Mark this execution as a child so its messages are findable on subsequent turns
  params.parentExecutionId = parentExecId;

  return extractChildConfig(fetched.stackTop.agent_config);
}

/* ─── Core execution function ─── */

export async function executeAgentCore(
  params: ExecuteCoreInput,
  callbacks?: ExecuteCoreCallbacks
): Promise<ExecuteCoreOutput> {
  const { supabase, input } = params;

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
    // Dispatch BEFORE persisting — dispatchIfNeeded suspends the parent,
    // and persistCoreResult completes it. Wrong order = completed before suspended.
    await dispatchIfNeeded({ supabase, params, executionId, fetched, output });

    // Skip completion persistence when dispatch happened — parent is now suspended
    if (output.dispatchResult === undefined) {
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
    }
  }

  logExec('core:complete', { executionId, durationMs, hasOutput: output !== null });
  return { executionId, output, nodeData, durationMs, appType: fetched.appType };
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
