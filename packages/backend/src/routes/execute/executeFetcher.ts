import type { RuntimeGraph } from '@daviddh/graph-types';
import { RuntimeGraphSchema } from '@daviddh/graph-types';
import type { Message } from '@daviddh/llm-graph-runner';
import { MESSAGES_PROVIDER } from '@daviddh/llm-graph-runner';

import {
  type DecryptedEnvVars,
  getDecryptedApiKeyValue,
  getDecryptedEnvVariables,
  getPublishedGraphData,
} from '../../db/queries/executionAuthQueries.js';
import {
  getChildExecutionMessages,
  getExecutionMessages,
  getOrCreateSession,
  getSessionMessages,
} from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { type StackEntry, getStackTop } from '../../db/queries/stackQueries.js';
import type { AgentVfsSettings } from '../../db/queries/vfsConfigTypes.js';
import type { AgentExecutionInput } from './executeTypes.js';

const EMPTY_LENGTH = 0;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;
const HTTP_INTERNAL = 500;

/* ─── HTTP error ─── */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/* ─── Agent config for agent-type apps ─── */

export interface AgentConfig {
  systemPrompt: string;
  context: string;
  maxSteps: number | null;
}

export type { OverrideAgentConfig } from './executeOverrideTypes.js';

/* ─── Fetched data shape ─── */

export interface FetchedData {
  graph: RuntimeGraph;
  apiKey: string;
  envVars: DecryptedEnvVars;
  sessionDbId: string;
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
  isNew: boolean;
  messageHistory: Message[];
  appType: string;
  agentConfig: AgentConfig | null;
  vfsSettings: AgentVfsSettings | null;
  stackTop: StackEntry | null;
}

/* ─── Production API key lookup ─── */

interface AgentKeyRow {
  production_api_key_id: string | null;
}

export async function getProductionKeyId(supabase: SupabaseClient, agentId: string): Promise<string> {
  const result = await supabase.from('agents').select('production_api_key_id').eq('id', agentId).single();

  const row: AgentKeyRow | null = result.data;
  if (row?.production_api_key_id === undefined || row.production_api_key_id === null) {
    throw new HttpError(HTTP_UNPROCESSABLE, 'No production API key configured for this agent');
  }
  return row.production_api_key_id;
}

/* ─── Graph + keys fetching ─── */

export interface GraphAndKeys {
  graph: RuntimeGraph;
  apiKey: string;
  envVars: DecryptedEnvVars;
  appType: string;
}

interface GraphFetchParams {
  supabase: SupabaseClient;
  agentId: string;
  version: number;
  orgId: string;
  productionApiKeyId: string;
}

const EMPTY_GRAPH: RuntimeGraph = {
  startNode: 'INITIAL_STEP',
  agents: [],
  nodes: [],
  edges: [],
  initialUserMessage: '',
};

/**
 * Transforms design-time graph data to runtime format.
 *
 * Design-time format: nodes have `outputSchemaId`, schemas in separate `outputSchemas` array.
 * Runtime format: nodes have inline `outputSchema` (resolved fields), no top-level `outputSchemas`.
 */
function isRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null);
}

function toRuntimeFormat(graphData: Record<string, unknown>): Record<string, unknown> {
  const { nodes: rawNodes, outputSchemas: rawSchemas, ...restGraph } = graphData;
  if (!isRecordArray(rawNodes)) return graphData;
  const schemas = isRecordArray(rawSchemas) ? rawSchemas : [];

  const schemaMap = new Map<string, unknown>();
  for (const s of schemas) {
    if (typeof s.id === 'string') schemaMap.set(s.id, s.fields);
  }

  const runtimeNodes = rawNodes.map((node) => {
    const { outputSchemaId, ...rest } = node;
    const fields = typeof outputSchemaId === 'string' ? schemaMap.get(outputSchemaId) : undefined;
    return { ...rest, outputSchema: fields };
  });

  return { ...restGraph, nodes: runtimeNodes };
}

function ensureGraphData(graphData: Record<string, unknown> | null): RuntimeGraph {
  if (graphData === null) throw new HttpError(HTTP_UNPROCESSABLE, 'Graph data not found');
  const runtime = toRuntimeFormat(graphData);
  const parsed = RuntimeGraphSchema.safeParse(runtime);
  if (!parsed.success) {
    process.stdout.write(`[execute] graph validation failed: ${JSON.stringify(parsed.error.issues)}\n`);
    throw new HttpError(HTTP_UNPROCESSABLE, 'Invalid graph data');
  }
  return parsed.data;
}

function ensureApiKey(apiKey: string | null): string {
  if (apiKey === null) throw new HttpError(HTTP_UNPROCESSABLE, 'No production API key configured');
  return apiKey;
}

async function fetchAppType(supabase: SupabaseClient, agentId: string): Promise<string> {
  const result = await supabase.from('agents').select('app_type').eq('id', agentId).single();
  const row = result.data as { app_type?: string } | null;
  return row?.app_type ?? 'workflow';
}

export async function fetchGraphAndKeys(params: GraphFetchParams): Promise<GraphAndKeys> {
  const { supabase, agentId, version, orgId, productionApiKeyId } = params;
  const [graphData, apiKey, envVars, appType] = await Promise.all([
    getPublishedGraphData(supabase, agentId, version),
    getDecryptedApiKeyValue(supabase, productionApiKeyId),
    getDecryptedEnvVariables(supabase, orgId),
    fetchAppType(supabase, agentId),
  ]);

  const graph = appType === 'agent' ? EMPTY_GRAPH : ensureGraphData(graphData);
  return { graph, apiKey: ensureApiKey(apiKey), envVars, appType };
}

/* ─── Session fetching ─── */

interface SessionData {
  sessionDbId: string;
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
  isNew: boolean;
  messageHistory: Message[];
  stackTop: StackEntry | null;
}

export interface SessionFetchParams {
  supabase: SupabaseClient;
  agentId: string;
  orgId: string;
  version: number;
  input: AgentExecutionInput;
  model: string;
}

interface MessageRow {
  id: string;
  role: string;
  content: Record<string, unknown>;
  created_at: string;
}

const CHANNEL_PROVIDERS: Record<string, MESSAGES_PROVIDER> = {
  whatsapp: MESSAGES_PROVIDER.WHATSAPP,
  web: MESSAGES_PROVIDER.WEB,
};

function resolveChannelProvider(channel: string): MESSAGES_PROVIDER {
  return CHANNEL_PROVIDERS[channel] ?? MESSAGES_PROVIDER.WEB;
}

function extractContentText(content: Record<string, unknown>): string {
  const { text } = content as { text?: unknown };
  return typeof text === 'string' ? text : JSON.stringify(content);
}

function buildModelMessage(role: string, content: string): Message['message'] {
  if (role === 'assistant') return { role: 'assistant', content };
  return { role: 'user', content };
}

export function messageRowToMessage(row: MessageRow, provider: MESSAGES_PROVIDER): Message {
  return {
    provider,
    id: row.id,
    timestamp: new Date(row.created_at).getTime(),
    originalId: row.id,
    type: 'text',
    message: buildModelMessage(row.role, extractContentText(row.content)),
  };
}

export async function fetchSessionData(params: SessionFetchParams): Promise<SessionData> {
  const sessionResult = await getOrCreateSession(params.supabase, {
    agentId: params.agentId,
    orgId: params.orgId,
    version: params.version,
    tenantId: params.input.tenantId,
    userId: params.input.userId,
    sessionId: params.input.sessionId,
    channel: params.input.channel,
    model: params.model,
  });

  if (sessionResult.locked === true) throw new HttpError(HTTP_TOO_MANY, 'Session is currently locked');
  if (sessionResult.session === null) throw new HttpError(HTTP_INTERNAL, 'Failed to create session');

  const { session } = sessionResult;
  const [rows, stackTop] = await Promise.all([
    getSessionMessages(params.supabase, session.id),
    getStackTop(params.supabase, session.id),
  ]);
  const channel = resolveChannelProvider(params.input.channel);

  return {
    sessionDbId: session.id,
    currentNodeId: session.current_node_id,
    structuredOutputs: session.structured_outputs,
    isNew: sessionResult.isNew,
    messageHistory: rows.map((row) => messageRowToMessage(row, channel)),
    stackTop,
  };
}

export async function fetchExecutionMessages(
  supabase: SupabaseClient,
  executionId: string,
  channel: string
): Promise<Message[]> {
  const rows = await getExecutionMessages(supabase, executionId);
  const provider = resolveChannelProvider(channel);
  return rows.map((row) => messageRowToMessage(row, provider));
}

export async function fetchChildMessages(
  supabase: SupabaseClient,
  parentExecutionId: string,
  channel: string,
  excludeExecutionId?: string
): Promise<Message[]> {
  const rows = await getChildExecutionMessages(supabase, parentExecutionId, excludeExecutionId);
  const provider = resolveChannelProvider(channel);
  return rows.map((row) => messageRowToMessage(row, provider));
}

/* ─── Resume messages: execution-scoped with structured content pass-through ─── */

function isStructuredModelMsg(
  content: Record<string, unknown>
): content is Record<string, unknown> & Message['message'] {
  return (content.role === 'assistant' || content.role === 'tool') && Array.isArray(content.content);
}

function rowToStructuredMessage(row: MessageRow, provider: MESSAGES_PROVIDER): Message {
  if (isStructuredModelMsg(row.content)) {
    return {
      provider,
      id: row.id,
      timestamp: new Date(row.created_at).getTime(),
      originalId: row.id,
      type: 'text',
      message: row.content,
    };
  }
  return messageRowToMessage(row, provider);
}

export async function fetchResumeMessages(
  supabase: SupabaseClient,
  executionId: string,
  channel: string
): Promise<Message[]> {
  const rows = await getExecutionMessages(supabase, executionId);
  const provider = resolveChannelProvider(channel);
  return rows.map((row) => rowToStructuredMessage(row, provider));
}

/* ─── Agent config from published version snapshot ─── */

interface AgentGraphData {
  systemPrompt?: string;
  maxSteps?: number | null;
  contextItems?: Array<{ sortOrder?: number; content: string }>;
}

function isAgentGraphData(val: unknown): val is AgentGraphData {
  return typeof val === 'object' && val !== null;
}

function flattenContextItems(items: Array<{ content: string }> | undefined): string {
  if (items === undefined || items.length === EMPTY_LENGTH) return '';
  return items.map((item) => item.content).join('\n\n');
}

export async function fetchAgentConfig(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<AgentConfig> {
  const result = await supabase
    .from('agent_versions')
    .select('graph_data')
    .eq('agent_id', agentId)
    .eq('version', version)
    .single();

  const row = result.data as { graph_data?: unknown } | null;
  const graphData = row?.graph_data;

  if (!isAgentGraphData(graphData)) {
    return { systemPrompt: '', context: '', maxSteps: null };
  }

  return {
    systemPrompt: graphData.systemPrompt ?? '',
    context: flattenContextItems(graphData.contextItems),
    maxSteps: graphData.maxSteps ?? null,
  };
}
