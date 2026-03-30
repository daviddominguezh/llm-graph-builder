import type { McpServerConfig } from '@daviddh/graph-types';

import { assembleMcpServers } from './graphAssemblers.js';
import { fetchMcpServers } from './graphFetchers.js';
import type { SupabaseClient } from './operationHelpers.js';

interface AgentConfigRow {
  system_prompt: string | null;
  max_steps: number | null;
  app_type: string;
}

interface ContextItemRow {
  sort_order: number;
  content: string;
}

export interface AgentConfigResponse {
  appType: 'agent';
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
  mcpServers: McpServerConfig[];
}

function isAgentConfigRow(val: unknown): val is AgentConfigRow {
  return typeof val === 'object' && val !== null && 'app_type' in val;
}

async function fetchAgentRow(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentConfigRow | null> {
  const result = await supabase
    .from('agents')
    .select('system_prompt, max_steps, app_type')
    .eq('id', agentId)
    .single();
  if (result.error !== null) return null;
  if (!isAgentConfigRow(result.data)) return null;
  return result.data;
}

function isContextItemRow(val: unknown): val is ContextItemRow {
  return typeof val === 'object' && val !== null && 'sort_order' in val;
}

async function fetchContextItems(
  supabase: SupabaseClient,
  agentId: string
): Promise<ContextItemRow[]> {
  const result = await supabase
    .from('agent_context_items')
    .select('sort_order, content')
    .eq('agent_id', agentId)
    .order('sort_order', { ascending: true });
  if (result.error !== null) return [];
  if (!Array.isArray(result.data)) return [];
  return result.data.filter(isContextItemRow);
}

export async function isAgentType(supabase: SupabaseClient, agentId: string): Promise<boolean> {
  const row = await fetchAgentRow(supabase, agentId);
  return row !== null && row.app_type === 'agent';
}

function mapContextItems(items: ContextItemRow[]): Array<{ sortOrder: number; content: string }> {
  return items.map((r) => ({ sortOrder: r.sort_order, content: r.content }));
}

export async function assembleAgentConfig(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentConfigResponse | null> {
  const agentRow = await fetchAgentRow(supabase, agentId);
  if (agentRow === null) return null;

  const [contextItems, mcpRows] = await Promise.all([
    fetchContextItems(supabase, agentId),
    fetchMcpServers(supabase, agentId),
  ]);

  const mcpServers = assembleMcpServers(mcpRows) ?? [];

  return {
    appType: 'agent',
    systemPrompt: agentRow.system_prompt ?? '',
    maxSteps: agentRow.max_steps,
    contextItems: mapContextItems(contextItems),
    mcpServers,
  };
}
