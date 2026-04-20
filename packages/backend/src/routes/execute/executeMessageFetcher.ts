import type { Message } from '@daviddh/llm-graph-runner';
import { MESSAGES_PROVIDER } from '@daviddh/llm-graph-runner';

import { getChildExecutionMessages, getExecutionMessages } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

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

export function resolveChannelProvider(channel: string): MESSAGES_PROVIDER {
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
