import { getOrCreateSession } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { getStackTop } from '../../db/queries/stackQueries.js';
import { fetchAllCoreData, persistMessagingPreExecution } from './executeCoreHelpers.js';
import { extractChildConfig } from './executeCoreInlineDispatch.js';
import type { ExecuteCoreInput, OverrideAgentConfig } from './executeCoreTypes.js';
import { type FetchedData, fetchChildMessages, fetchResumeMessages } from './executeFetcher.js';
import { buildUserMessage, extractTextFromInput, logExec } from './executeHelpers.js';
import { persistPreExecution } from './executePersistence.js';

const DEFAULT_MODEL = 'x-ai/grok-4.1-fast';

export interface SetupResult {
  fetched: FetchedData;
  executionId: string;
  conversationId: string | null;
  model: string;
  parentExecutionId: string | undefined;
}

function resolveModel(input: ExecuteCoreInput): string {
  const configModel = input.overrideAgentConfig?.modelId;
  if (configModel !== undefined && configModel !== '') return configModel;
  return input.input.model ?? DEFAULT_MODEL;
}

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

export async function presetParentExecutionId(
  supabase: SupabaseClient,
  params: ExecuteCoreInput
): Promise<string | undefined> {
  if (params.parentExecutionId !== undefined) return params.parentExecutionId;
  if (params.continueExecutionId !== undefined) return undefined;

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
  if (sessionResult.session === null) return undefined;

  const stackTop = await getStackTop(supabase, sessionResult.session.id);
  if (stackTop === null) return undefined;

  return stackTop.parent_execution_id ?? undefined;
}

async function buildContinueResult(
  supabase: SupabaseClient,
  params: ExecuteCoreInput,
  fetched: FetchedData,
  model: string
): Promise<SetupResult> {
  const { continueExecutionId: continueExecId } = params;
  if (continueExecId === undefined) throw new Error('buildContinueResult requires continueExecutionId');
  const messageHistory = await fetchResumeMessages(supabase, continueExecId, params.input.channel);
  return {
    fetched: { ...fetched, messageHistory },
    executionId: continueExecId,
    conversationId: null,
    model,
    parentExecutionId: params.parentExecutionId,
  };
}

interface CreateExecutionRecordArgs {
  supabase: SupabaseClient;
  params: ExecuteCoreInput;
  fetched: FetchedData;
  model: string;
  parentExecutionId: string | undefined;
}

async function createExecutionRecord(args: CreateExecutionRecordArgs): Promise<{ executionId: string }> {
  const { supabase, params, fetched, model, parentExecutionId } = args;
  return await persistPreExecution(supabase, {
    sessionDbId: fetched.sessionDbId,
    agentId: params.agentId,
    orgId: params.orgId,
    version: params.version,
    model,
    channel: params.input.channel,
    tenantId: params.input.tenantId,
    userId: params.input.userId,
    userMessageContent: extractTextFromInput(params.input),
    currentNodeId: fetched.currentNodeId,
    executionId: params.executionId,
    parentExecutionId,
  });
}

export async function setupExecution(
  params: ExecuteCoreInput,
  parentExecutionId: string | undefined
): Promise<SetupResult> {
  const { supabase, orgId, agentId, version, input } = params;
  const model = resolveModel(params);

  const baseFetched = await fetchAllCoreData({
    supabase,
    agentId,
    orgId,
    version,
    input,
    model,
    overrideAgentConfig: params.overrideAgentConfig,
  });
  logExec('core:fetched', { appType: baseFetched.appType, node: baseFetched.currentNodeId });

  if (params.continueExecutionId !== undefined) {
    return await buildContinueResult(supabase, params, baseFetched, model);
  }

  const fetched: FetchedData = {
    ...baseFetched,
    messageHistory: [...baseFetched.messageHistory, buildUserMessage(input)],
  };

  const [{ executionId }, conversationId] = await Promise.all([
    createExecutionRecord({ supabase, params, fetched, model, parentExecutionId }),
    resolveConversationId(supabase, params),
  ]);

  return { fetched, executionId, conversationId, model, parentExecutionId };
}

export interface ChildOverrideResult {
  fetched: FetchedData;
  parentExecutionId: string | undefined;
  override: OverrideAgentConfig | undefined;
}

export async function resolveChildOverride(
  fetched: FetchedData,
  params: ExecuteCoreInput,
  parentExecutionId: string | undefined
): Promise<ChildOverrideResult> {
  if (fetched.stackTop === null || params.continueExecutionId !== undefined) {
    return { fetched, parentExecutionId, override: undefined };
  }

  const { stackTop } = fetched;
  const parentExecId = stackTop.parent_execution_id ?? '';
  logExec('routing to active child', { parentExecId });

  const { execution_id: stackExecId } = stackTop;
  const messageHistory = await fetchChildMessages(
    params.supabase,
    parentExecId,
    params.input.channel,
    stackExecId
  );

  const updatedFetched: FetchedData = {
    ...fetched,
    messageHistory,
    appType: 'agent',
    agentConfig: null,
  };

  return {
    fetched: updatedFetched,
    parentExecutionId: parentExecId,
    override: extractChildConfig(stackTop.agent_config),
  };
}
