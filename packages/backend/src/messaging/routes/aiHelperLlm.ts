import { getDecryptedApiKeyValue } from '../../db/queries/executionAuthQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

interface AgentKeyRow {
  production_api_key_id: string | null;
}

function isAgentKeyRow(val: unknown): val is AgentKeyRow {
  return typeof val === 'object' && val !== null && 'production_api_key_id' in val;
}

export async function resolveApiKey(supabase: SupabaseClient, agentId: string): Promise<string> {
  const result: { data: unknown; error: { message: string } | null } = await supabase
    .from('agents')
    .select('production_api_key_id')
    .eq('id', agentId)
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error('Agent not found');
  }

  if (!isAgentKeyRow(result.data) || result.data.production_api_key_id === null) {
    throw new Error('Agent has no production API key configured');
  }

  const apiKey = await getDecryptedApiKeyValue(supabase, result.data.production_api_key_id);
  if (apiKey === null) {
    throw new Error('Failed to decrypt API key');
  }

  return apiKey;
}

interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

interface LlmChoice {
  message: { content: string };
}

interface LlmResponse {
  choices: LlmChoice[];
}

function isLlmResponse(val: unknown): val is LlmResponse {
  return typeof val === 'object' && val !== null && 'choices' in val;
}

export async function callLlm(apiKey: string, systemPrompt: string, userText: string): Promise<string> {
  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages }),
  });

  const raw: unknown = await response.json();
  if (!isLlmResponse(raw)) {
    throw new Error('Invalid LLM response');
  }

  const { choices } = raw;
  const [firstChoice] = choices;
  if (firstChoice === undefined) {
    throw new Error('No choices in LLM response');
  }

  return firstChoice.message.content;
}
