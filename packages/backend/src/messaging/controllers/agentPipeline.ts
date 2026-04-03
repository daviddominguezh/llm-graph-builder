import type { CallAgentOutput, Message } from '@daviddh/llm-graph-runner';

import { failExecution, getOrCreateSession } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type {
  ExecuteAgentParams,
  ExecuteAgentResult,
  NodeProcessedData,
} from '../../routes/execute/edgeFunctionClient.js';
import { executeAgent } from '../../routes/execute/edgeFunctionClient.js';
import type { GraphAndKeys } from '../../routes/execute/executeFetcher.js';
import { fetchGraphAndKeys, getProductionKeyId } from '../../routes/execute/executeFetcher.js';
import { persistPostExecution, persistPreExecution } from '../../routes/execute/executePersistence.js';
import { getLastVisitedNode, mergeStructuredOutputs } from '../../routes/execute/executeResponseBuilders.js';
import { getAiMessages } from '../queries/messageQueries.js';
import type { ConversationRow } from '../types/index.js';
import type { InvokeResult } from './agentInvoker.js';
import { hydrateAiMessages } from './agentInvoker.js';

/* ─── Constants ─── */

const DEFAULT_MODEL = 'x-ai/grok-4.1-fast';

/* ─── Agent info lookup ─── */

interface AgentRow {
  org_id: string;
  current_version: number;
}

async function getAgentInfo(supabase: SupabaseClient, agentId: string): Promise<AgentRow> {
  const result = await supabase.from('agents').select('org_id, current_version').eq('id', agentId).single();

  const row = result.data as AgentRow | null;
  if (row === null) throw new Error('Agent not found');
  return row;
}

/* ─── Fetch graph and keys ─── */

async function fetchAgentGraphAndKeys(
  supabase: SupabaseClient,
  agentId: string,
  version: number,
  orgId: string
): Promise<GraphAndKeys> {
  const productionKeyId = await getProductionKeyId(supabase, agentId);
  return await fetchGraphAndKeys({
    supabase,
    agentId,
    version,
    orgId,
    productionApiKeyId: productionKeyId,
  });
}

/* ─── Session resolution ─── */

interface SessionContext {
  sessionDbId: string;
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
  isNew: boolean;
}

function toSessionContext(
  session: { id: string; current_node_id: string; structured_outputs: Record<string, unknown[]> },
  isNew: boolean
): SessionContext {
  return {
    sessionDbId: session.id,
    currentNodeId: session.current_node_id,
    structuredOutputs: session.structured_outputs,
    isNew,
  };
}

async function resolveSession(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  orgId: string,
  version: number
): Promise<SessionContext | null> {
  const sessionResult = await getOrCreateSession(supabase, {
    agentId: conversation.agent_id,
    orgId,
    version,
    tenantId: conversation.tenant_id,
    userId: conversation.user_channel_id,
    sessionId: conversation.thread_id,
    channel: conversation.channel,
    model: DEFAULT_MODEL,
  });

  if (sessionResult.locked === true) {
    process.stdout.write('[messaging] Session locked, skipping AI invocation\n');
    return null;
  }

  if (sessionResult.session === null) {
    throw new Error('Failed to create session');
  }

  return toSessionContext(sessionResult.session, sessionResult.isNew);
}

/* ─── Execution context ─── */

interface ExecutionContext {
  supabase: SupabaseClient;
  conversation: ConversationRow;
  session: SessionContext;
  graphAndKeys: GraphAndKeys;
  orgId: string;
  version: number;
  userMessageContent: string;
}

/* ─── Pre-execution persistence ─── */

async function createPreExecution(ctx: ExecutionContext): Promise<string> {
  const { executionId } = await persistPreExecution(ctx.supabase, {
    sessionDbId: ctx.session.sessionDbId,
    agentId: ctx.conversation.agent_id,
    orgId: ctx.orgId,
    version: ctx.version,
    model: DEFAULT_MODEL,
    channel: ctx.conversation.channel,
    tenantId: ctx.conversation.tenant_id,
    userId: ctx.conversation.user_channel_id,
    userMessageContent: ctx.userMessageContent,
    currentNodeId: ctx.session.currentNodeId,
  });
  return executionId;
}

/* ─── Build edge function params ─── */

function noop(): void {
  // intentionally empty
}

function buildEdgeFunctionParams(ctx: ExecutionContext, messages: Message[]): ExecuteAgentParams {
  return {
    graph: ctx.graphAndKeys.graph,
    apiKey: ctx.graphAndKeys.apiKey,
    modelId: DEFAULT_MODEL,
    currentNodeId: ctx.session.currentNodeId,
    messages,
    structuredOutputs: ctx.session.structuredOutputs,
    data: {},
    quickReplies: {},
    sessionID: ctx.conversation.thread_id,
    tenantID: ctx.conversation.tenant_id,
    userID: ctx.conversation.user_channel_id,
    isFirstMessage: ctx.session.isNew,
  };
}

/* ─── Persist post-execution result ─── */

interface PersistResultParams {
  ctx: ExecutionContext;
  executionId: string;
  output: CallAgentOutput;
  nodeData: NodeProcessedData[];
  durationMs: number;
}

async function persistAgentResult(params: PersistResultParams): Promise<InvokeResult> {
  const { ctx, executionId, output, nodeData, durationMs } = params;
  const newNodeId = getLastVisitedNode(output, ctx.session.currentNodeId);
  const newOutputs = mergeStructuredOutputs(ctx.session.structuredOutputs, output);

  await persistPostExecution(ctx.supabase, {
    executionId,
    sessionDbId: ctx.session.sessionDbId,
    result: output,
    currentNodeId: newNodeId,
    structuredOutputs: newOutputs,
    durationMs,
    model: DEFAULT_MODEL,
    nodeData,
  });

  return { responseText: output.text ?? '' };
}

/* ─── Handle execution result ─── */

async function handleExecutionResult(
  ctx: ExecutionContext,
  executionId: string,
  result: ExecuteAgentResult,
  startTime: number
): Promise<InvokeResult | null> {
  if (result.output === null) {
    await failExecution(ctx.supabase, executionId, 'No output from agent');
    return null;
  }

  const durationMs = Date.now() - startTime;
  return await persistAgentResult({
    ctx,
    executionId,
    output: result.output,
    nodeData: result.nodeData,
    durationMs,
  });
}

/* ─── Call edge function and handle result ─── */

async function callAndPersist(ctx: ExecutionContext): Promise<InvokeResult | null> {
  const aiRows = await getAiMessages(ctx.supabase, ctx.conversation.id);
  // TODO: closer-back calls reorderUnrepliedMessages(messages) here to ensure
  // unreplied user messages appear after the last assistant message.
  // See: closer-back/src/controllers/messages/index.ts lines 1439–1443
  const messageHistory = hydrateAiMessages(aiRows);
  const executionId = await createPreExecution(ctx);
  const startTime = Date.now();

  try {
    const agentParams = buildEdgeFunctionParams(ctx, messageHistory);
    const result = await executeAgent(agentParams, {
      onNodeVisited: noop,
      onNodeProcessed: noop,
    });

    return await handleExecutionResult(ctx, executionId, result, startTime);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'AI invocation failed';
    process.stdout.write(`[messaging] AI execution failed: ${errMsg}\n`);
    await failExecution(ctx.supabase, executionId, errMsg).catch(noop);
    return null;
  }
}

/* ─── Main pipeline function ─── */

interface PipelineParams {
  supabase: SupabaseClient;
  conversation: ConversationRow;
  userMessageContent: string;
}

export async function runAgentPipeline(params: PipelineParams): Promise<InvokeResult | null> {
  const { supabase, conversation, userMessageContent } = params;

  const agentInfo = await getAgentInfo(supabase, conversation.agent_id);
  const { org_id: orgId, current_version: version } = agentInfo;

  const graphAndKeys = await fetchAgentGraphAndKeys(supabase, conversation.agent_id, version, orgId);
  const session = await resolveSession(supabase, conversation, orgId, version);
  if (session === null) return null;

  return await callAndPersist({
    supabase,
    conversation,
    session,
    graphAndKeys,
    orgId,
    version,
    userMessageContent,
  });
}
