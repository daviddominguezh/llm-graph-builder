import type { RuntimeGraph } from '@daviddh/graph-types';
import { RuntimeGraphSchema } from '@daviddh/graph-types';
import type { Message } from '@daviddh/llm-graph-runner';
import { MESSAGES_PROVIDER } from '@daviddh/llm-graph-runner';

import {
  getDecryptedApiKeyValue,
  getDecryptedEnvVariables,
  getPublishedGraphData,
} from '../../db/queries/executionAuthQueries.js';
import { getOrCreateSession, getSessionMessages } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { AgentExecutionInput } from './executeTypes.js';

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

/* ─── Fetched data shape ─── */

export interface FetchedData {
  graph: RuntimeGraph;
  apiKey: string;
  envVars: Record<string, string>;
  sessionDbId: string;
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
  isNew: boolean;
  messageHistory: Message[];
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
  envVars: Record<string, string>;
}

interface GraphFetchParams {
  supabase: SupabaseClient;
  agentId: string;
  version: number;
  orgId: string;
  productionApiKeyId: string;
}

function ensureGraphData(graphData: Record<string, unknown> | null): RuntimeGraph {
  if (graphData === null) throw new HttpError(HTTP_UNPROCESSABLE, 'Graph data not found');
  const parsed = RuntimeGraphSchema.safeParse(graphData);
  if (!parsed.success) throw new HttpError(HTTP_UNPROCESSABLE, 'Invalid graph data');
  return parsed.data;
}

function ensureApiKey(apiKey: string | null): string {
  if (apiKey === null) throw new HttpError(HTTP_UNPROCESSABLE, 'No production API key configured');
  return apiKey;
}

export async function fetchGraphAndKeys(params: GraphFetchParams): Promise<GraphAndKeys> {
  const { supabase, agentId, version, orgId, productionApiKeyId } = params;
  const [graphData, apiKey, envVars] = await Promise.all([
    getPublishedGraphData(supabase, agentId, version),
    getDecryptedApiKeyValue(supabase, productionApiKeyId),
    getDecryptedEnvVariables(supabase, orgId),
  ]);

  return { graph: ensureGraphData(graphData), apiKey: ensureApiKey(apiKey), envVars };
}

/* ─── Session fetching ─── */

interface SessionData {
  sessionDbId: string;
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
  isNew: boolean;
  messageHistory: Message[];
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

function messageRowToMessage(row: MessageRow, provider: MESSAGES_PROVIDER): Message {
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
  const rows = await getSessionMessages(params.supabase, session.id);
  const channel = resolveChannelProvider(params.input.channel);

  return {
    sessionDbId: session.id,
    currentNodeId: session.current_node_id,
    structuredOutputs: session.structured_outputs,
    isNew: sessionResult.isNew,
    messageHistory: rows.map((row) => messageRowToMessage(row, channel)),
  };
}
