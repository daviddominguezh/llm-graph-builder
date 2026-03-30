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

interface SkillRow {
  name: string;
  description: string;
  content: string;
  repo_url: string;
  sort_order: number;
}

export interface SkillData {
  name: string;
  description: string;
  content: string;
  repoUrl: string;
  sortOrder: number;
}

export interface AgentConfigResponse {
  appType: 'agent';
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
  skills: SkillData[];
  mcpServers: McpServerConfig[];
}

function isAgentConfigRow(val: unknown): val is AgentConfigRow {
  return typeof val === 'object' && val !== null && 'app_type' in val;
}

async function fetchAgentRow(supabase: SupabaseClient, agentId: string): Promise<AgentConfigRow | null> {
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

function isSkillRow(val: unknown): val is SkillRow {
  return typeof val === 'object' && val !== null && 'name' in val && 'content' in val;
}

async function fetchContextItems(supabase: SupabaseClient, agentId: string): Promise<ContextItemRow[]> {
  const result = await supabase
    .from('agent_context_items')
    .select('sort_order, content')
    .eq('agent_id', agentId)
    .order('sort_order', { ascending: true });
  if (result.error !== null) return [];
  if (!Array.isArray(result.data)) return [];
  return result.data.filter(isContextItemRow);
}

async function fetchSkills(supabase: SupabaseClient, agentId: string): Promise<SkillRow[]> {
  const result = await supabase
    .from('agent_skills')
    .select('name, description, content, repo_url, sort_order')
    .eq('agent_id', agentId)
    .order('sort_order', { ascending: true });
  if (result.error !== null) return [];
  if (!Array.isArray(result.data)) return [];
  return result.data.filter(isSkillRow);
}

export async function isAgentType(supabase: SupabaseClient, agentId: string): Promise<boolean> {
  const row = await fetchAgentRow(supabase, agentId);
  return row !== null && row.app_type === 'agent';
}

function mapContextItems(items: ContextItemRow[]): Array<{ sortOrder: number; content: string }> {
  return items.map((r) => ({ sortOrder: r.sort_order, content: r.content }));
}

function mapSkills(rows: SkillRow[]): SkillData[] {
  return rows.map((r) => ({
    name: r.name,
    description: r.description,
    content: r.content,
    repoUrl: r.repo_url,
    sortOrder: r.sort_order,
  }));
}

export async function assembleAgentConfig(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentConfigResponse | null> {
  const agentRow = await fetchAgentRow(supabase, agentId);
  if (agentRow === null) return null;

  const [contextItems, skillRows, mcpRows] = await Promise.all([
    fetchContextItems(supabase, agentId),
    fetchSkills(supabase, agentId),
    fetchMcpServers(supabase, agentId),
  ]);

  const mcpServers = assembleMcpServers(mcpRows) ?? [];

  return {
    appType: 'agent',
    systemPrompt: agentRow.system_prompt ?? '',
    maxSteps: agentRow.max_steps,
    contextItems: mapContextItems(contextItems),
    skills: mapSkills(skillRows),
    mcpServers,
  };
}
