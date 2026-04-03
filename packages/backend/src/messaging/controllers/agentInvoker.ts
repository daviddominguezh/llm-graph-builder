import type { Message } from '@daviddh/llm-graph-runner';
import { MESSAGES_PROVIDER } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ConversationRow, MessageAiRow } from '../types/index.js';
import { runAgentPipeline } from './agentPipeline.js';

/* ─── Hydrate messages_ai rows into Message[] for the edge function ─── */

function hydrateAiMessage(row: MessageAiRow): Message {
  const role = row.role === 'assistant' ? 'assistant' : 'user';
  return {
    provider: MESSAGES_PROVIDER.WHATSAPP,
    id: row.id,
    timestamp: row.timestamp,
    originalId: row.original_id ?? row.id,
    type: 'text',
    message: { role, content: row.content ?? '' },
  };
}

export function hydrateAiMessages(rows: MessageAiRow[]): Message[] {
  return rows.map(hydrateAiMessage);
}

/* ─── Invoke AI agent ─── */

export interface InvokeParams {
  supabase: SupabaseClient;
  conversation: ConversationRow;
  userMessageContent: string;
}

export interface InvokeResult {
  responseText: string;
}

export async function invokeAgent(params: InvokeParams): Promise<InvokeResult | null> {
  try {
    return await runAgentPipeline(params);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'AI invocation failed';
    process.stdout.write(`[messaging] AI invocation failed: ${errMsg}\n`);
    return null;
  }
}
