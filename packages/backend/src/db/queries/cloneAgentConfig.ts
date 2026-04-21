import type { TemplateMcpServer } from '@daviddh/graph-types';

import { insertMcpServers } from './cloneTemplateGraph.js';
import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SkillTemplateEntry {
  name: string;
  description: string;
  content: string;
  repoUrl: string;
  sortOrder: number;
}

interface AgentTemplateConfig {
  systemPrompt: string;
  contextItems: string[];
  skills?: SkillTemplateEntry[];
  maxSteps: number | null;
  mcpServers: TemplateMcpServer[];
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isAgentTemplateConfig(val: unknown): val is AgentTemplateConfig {
  return typeof val === 'object' && val !== null && 'systemPrompt' in val;
}

function isTemplateMcpServer(val: unknown): val is TemplateMcpServer {
  if (typeof val !== 'object' || val === null) return false;
  return 'type' in val && typeof (val as Record<string, unknown>).type === 'string';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseTemplateMcpServers(raw: unknown): TemplateMcpServer[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isTemplateMcpServer);
}

async function setAgentFields(
  supabase: SupabaseClient,
  agentId: string,
  config: AgentTemplateConfig
): Promise<void> {
  const result = await supabase
    .from('agents')
    .update({ system_prompt: config.systemPrompt, max_steps: config.maxSteps })
    .eq('id', agentId);
  throwOnMutationError(result, 'cloneAgentConfig:fields');
}

async function insertContextItems(supabase: SupabaseClient, agentId: string, items: string[]): Promise<void> {
  const EMPTY = 0;
  if (items.length === EMPTY) return;
  const rows = items.map((content, i) => ({
    agent_id: agentId,
    sort_order: i,
    content,
  }));
  const result = await supabase.from('agent_context_items').insert(rows);
  throwOnMutationError(result, 'cloneAgentConfig:contextItems');
}

function isSkillEntry(val: unknown): val is SkillTemplateEntry {
  return typeof val === 'object' && val !== null && 'name' in val && 'content' in val;
}

function parseTemplateSkills(raw: unknown): SkillTemplateEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isSkillEntry);
}

async function insertSkills(
  supabase: SupabaseClient,
  agentId: string,
  skills: SkillTemplateEntry[]
): Promise<void> {
  const EMPTY = 0;
  if (skills.length === EMPTY) return;
  const rows = skills.map((s) => ({
    agent_id: agentId,
    name: s.name,
    description: s.description,
    content: s.content,
    repo_url: s.repoUrl,
    sort_order: s.sortOrder,
  }));
  const result = await supabase.from('agent_skills').insert(rows);
  throwOnMutationError(result, 'cloneAgentConfig:skills');
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export async function cloneAgentConfig(
  supabase: SupabaseClient,
  agentId: string,
  rawConfig: unknown
): Promise<void> {
  if (!isAgentTemplateConfig(rawConfig)) return;
  await setAgentFields(supabase, agentId, rawConfig);
  await insertContextItems(supabase, agentId, rawConfig.contextItems);
  const skills = parseTemplateSkills(rawConfig.skills);
  await insertSkills(supabase, agentId, skills);
  const mcpServers = parseTemplateMcpServers(rawConfig.mcpServers);
  await insertMcpServers(supabase, agentId, mcpServers);
}
