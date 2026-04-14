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
import type { FetchedData, OverrideAgentConfig } from './executeFetcher.js';
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
  const model = params.overrideAgentConfig?.modelId ?? input.model ?? DEFAULT_MODEL;

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

/* ─── Core execution function ─── */

export async function executeAgentCore(
  params: ExecuteCoreInput,
  callbacks?: ExecuteCoreCallbacks
): Promise<ExecuteCoreOutput> {
  const { supabase, input } = params;

  const { fetched, executionId, conversationId, model } = await setupExecution(params);
  const vfsPayload = await resolveVfsCorePayload(supabase, fetched, params.agentId, params.orgId);
  const buildOptions: BuildCoreParamsOptions = {
    vfsPayload,
    overrideAgentConfig: params.overrideAgentConfig,
  };
  const edgeParams = buildCoreExecuteParams(fetched, input, model, buildOptions);
  const startTime = Date.now();

  const { output, nodeData } = await executeAgent(edgeParams, {
    onNodeVisited: callbacks?.onNodeVisited ?? noop,
    onNodeProcessed: callbacks?.onNodeProcessed ?? noop,
  });

  const durationMs = Date.now() - startTime;

  if (output !== null) {
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

    await dispatchIfNeeded({ supabase, params, executionId, fetched, output });
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
