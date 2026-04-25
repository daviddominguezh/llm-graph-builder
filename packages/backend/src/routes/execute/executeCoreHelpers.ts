import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { getAgentVfsSettings } from '../../db/queries/vfsConfigQueries.js';
import { resolveGoogleAccessTokenOptional } from '../../google/calendar/tokenResolver.js';
import { updateConversationLastMessage } from '../../messaging/queries/conversationMutations.js';
import { findOrCreateConversation } from '../../messaging/queries/conversationQueries.js';
import { insertMessage, insertMessageAi } from '../../messaging/queries/messageQueries.js';
import { publishToTenant } from '../../messaging/services/redis.js';
import type {
  ExecuteAgentParams,
  GoogleCalendarEdgePayload,
  VfsEdgeFunctionPayload,
} from './edgeFunctionClient.js';
import type { AgentConfig, FetchedData, OverrideAgentConfig } from './executeFetcher.js';
import {
  fetchAgentConfig,
  fetchGraphAndKeys,
  fetchSessionData,
  getProductionKeyId,
} from './executeFetcher.js';
import { logExec, resolveMcpTransportVariables, resolveOAuthForExecution } from './executeHelpers.js';
import type { AgentExecutionInput } from './executeTypes.js';
import { buildVfsPayload } from './vfsDispatch.js';

const ZERO_UNANSWERED = 0;
const INCREMENT = 1;

/* ─── Data fetching ─── */

interface FetchAllParams {
  supabase: SupabaseClient;
  agentId: string;
  orgId: string;
  version: number;
  input: AgentExecutionInput;
  model: string;
  overrideAgentConfig?: OverrideAgentConfig;
}

function resolveAgentConfig(params: FetchAllParams, appType: string): Promise<AgentConfig> | null {
  const { overrideAgentConfig } = params;
  if (overrideAgentConfig !== undefined) {
    const { systemPrompt, context, maxSteps } = overrideAgentConfig;
    return Promise.resolve({ systemPrompt, context, maxSteps });
  }
  if (appType === 'agent') {
    return fetchAgentConfig(params.supabase, params.agentId, params.version);
  }
  return null;
}

export async function fetchAllCoreData(params: FetchAllParams): Promise<FetchedData> {
  const { supabase, agentId, orgId, version, input, model } = params;
  const productionKeyId = await getProductionKeyId(supabase, agentId);
  const [graphAndKeys, sessionData, vfsSettings] = await Promise.all([
    fetchGraphAndKeys({ supabase, agentId, version, orgId, productionApiKeyId: productionKeyId }),
    fetchSessionData({ supabase, agentId, orgId, version, input, model }),
    getAgentVfsSettings(supabase, agentId),
  ]);
  const envResolvedGraph = resolveMcpTransportVariables(
    graphAndKeys.graph,
    graphAndKeys.envVars.byName,
    graphAndKeys.envVars.byId
  );
  const resolvedGraph = await resolveOAuthForExecution(supabase, envResolvedGraph, orgId);
  const agentConfig = await resolveAgentConfig(params, graphAndKeys.appType);
  return { ...graphAndKeys, ...sessionData, graph: resolvedGraph, agentConfig, vfsSettings };
}

/* ─── Google Calendar payload resolution ─── */

export async function resolveGoogleCalendarPayload(
  supabase: SupabaseClient,
  orgId: string
): Promise<GoogleCalendarEdgePayload | undefined> {
  try {
    const accessToken = await resolveGoogleAccessTokenOptional(supabase, orgId);
    if (accessToken === null) return undefined;
    return { accessToken, orgId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    logExec('google calendar token resolution failed (non-fatal)', { error: msg });
    return undefined;
  }
}

/* ─── VFS payload resolution ─── */

export async function resolveVfsCorePayload(
  supabase: SupabaseClient,
  fetched: FetchedData,
  agentId: string,
  orgId: string
): Promise<VfsEdgeFunctionPayload | undefined> {
  if (fetched.vfsSettings === null) return undefined;
  const payload = await buildVfsPayload(supabase, {
    agentId,
    orgId,
    vfsSettings: fetched.vfsSettings,
    userJwt: '',
    ref: undefined,
  });
  return { ...payload, settings: payload.settings as Record<string, unknown> };
}

/* ─── Build edge function params ─── */

export interface BuildCoreParamsOptions {
  vfsPayload: VfsEdgeFunctionPayload | undefined;
  overrideAgentConfig?: OverrideAgentConfig;
  conversationId?: string;
  googleCalendar?: GoogleCalendarEdgePayload;
}

function buildAgentExecuteParams(
  base: ExecuteAgentParams,
  fetched: FetchedData,
  options: BuildCoreParamsOptions
): ExecuteAgentParams {
  const { overrideAgentConfig } = options;
  const agentParams = fetched.agentConfig === null ? base : { ...base, ...fetched.agentConfig };
  if (overrideAgentConfig === undefined) return agentParams;
  const { modelId, ...rest } = overrideAgentConfig;
  const override = modelId !== undefined && modelId !== '' ? { ...rest, modelId } : rest;
  return { ...agentParams, ...override };
}

export function buildCoreExecuteParams(
  fetched: FetchedData,
  input: AgentExecutionInput,
  model: string,
  options: BuildCoreParamsOptions
): ExecuteAgentParams {
  const base: ExecuteAgentParams = {
    appType: fetched.appType === 'agent' ? 'agent' : 'workflow',
    graph: fetched.graph,
    apiKey: fetched.apiKey,
    modelId: model,
    currentNodeId: fetched.currentNodeId,
    messages: fetched.messageHistory,
    structuredOutputs: fetched.structuredOutputs,
    data: input.context ?? {},
    quickReplies: {},
    sessionID: input.sessionId,
    tenantID: input.tenantId,
    userID: input.userId,
    isFirstMessage: fetched.isNew,
    vfs: options.vfsPayload,
    conversationId: options.conversationId,
    googleCalendar: options.googleCalendar,
  };

  if (fetched.appType === 'agent') {
    return buildAgentExecuteParams(base, fetched, options);
  }

  return base;
}

/* ─── Save message pair to messaging tables ─── */

interface SavePairParams {
  supabase: SupabaseClient;
  conversationId: string;
  role: string;
  content: string;
  timestamp: number;
}

async function saveMessagePair(params: SavePairParams): Promise<void> {
  const { supabase, conversationId, role, content, timestamp } = params;
  await Promise.all([
    insertMessage(supabase, { conversationId, role, type: 'text', content, timestamp }),
    insertMessageAi(supabase, { conversationId, role, type: 'text', content, timestamp }),
  ]);
}

/* ─── Update conversation and publish ─── */

interface UpdatePublishParams {
  supabase: SupabaseClient;
  conversationId: string;
  content: string;
  role: string;
  read: boolean;
  unansweredCount: number;
  tenantId: string;
}

async function updateAndPublish(params: UpdatePublishParams): Promise<void> {
  await updateConversationLastMessage(params.supabase, params.conversationId, {
    lastMessageContent: params.content,
    lastMessageRole: params.role,
    lastMessageType: 'text',
    lastMessageAt: new Date().toISOString(),
    read: params.read,
    unansweredCount: params.unansweredCount,
  });
  await publishRedisUpdate(params.tenantId, params.conversationId);
}

/* ─── Messaging table persistence: pre-execution ─── */

export interface MessagingPreParams {
  orgId: string;
  agentId: string;
  tenantId: string;
  userChannelId: string;
  sessionId: string;
  channel: string;
  messageContent: string;
  metadata?: Record<string, unknown>;
}

async function doMessagingPreExecution(
  supabase: SupabaseClient,
  params: MessagingPreParams
): Promise<string> {
  const conversation = await findOrCreateConversation(supabase, {
    orgId: params.orgId,
    agentId: params.agentId,
    tenantId: params.tenantId,
    userChannelId: params.userChannelId,
    threadId: params.sessionId,
    channel: params.channel,
    metadata: params.metadata,
  });

  const now = Date.now();
  await saveMessagePair({
    supabase,
    conversationId: conversation.id,
    role: 'user',
    content: params.messageContent,
    timestamp: now,
  });
  const newCount = conversation.unanswered_count + INCREMENT;
  await updateAndPublish({
    supabase,
    conversationId: conversation.id,
    content: params.messageContent,
    role: 'user',
    read: false,
    unansweredCount: newCount,
    tenantId: params.tenantId,
  });
  return conversation.id;
}

export async function persistMessagingPreExecution(
  supabase: SupabaseClient,
  params: MessagingPreParams
): Promise<string | null> {
  try {
    return await doMessagingPreExecution(supabase, params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    logExec('messaging pre-execution failed (non-fatal)', { error: msg });
    return null;
  }
}

/* ─── Messaging table persistence: post-execution ─── */

interface MessagingPostParams {
  conversationId: string | null;
  responseText: string;
  tenantId: string;
}

export async function persistMessagingPostExecution(
  supabase: SupabaseClient,
  params: MessagingPostParams
): Promise<void> {
  if (params.conversationId === null || params.responseText === '') return;

  try {
    const now = Date.now();
    await saveMessagePair({
      supabase,
      conversationId: params.conversationId,
      role: 'assistant',
      content: params.responseText,
      timestamp: now,
    });
    await updateAndPublish({
      supabase,
      conversationId: params.conversationId,
      content: params.responseText,
      role: 'assistant',
      read: true,
      unansweredCount: ZERO_UNANSWERED,
      tenantId: params.tenantId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    logExec('messaging post-execution failed (non-fatal)', { error: msg });
  }
}

/* ─── Redis publish helper ─── */

async function publishRedisUpdate(tenantId: string, conversationId: string): Promise<void> {
  await publishToTenant(tenantId, { conversationId, tenantId }).catch(() => {
    logExec('Redis publish failed (non-fatal)');
  });
}
