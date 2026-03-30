import type { TemplateGraphData, TemplateMcpServer } from '@daviddh/graph-types';

import { assembleTemplateSafeGraph } from './assembleTemplateSafeGraph.js';
import type { McpTransportType } from './graphRowTypes.js';
import type { SupabaseClient } from './operationHelpers.js';
import { removeTemplate, upsertTemplate } from './templateQueries.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentSyncRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  app_type: string;
  is_public: boolean;
  current_version: number;
}

interface OrgSyncRow {
  slug: string;
  avatar_url: string | null;
}

interface McpServerDbRow {
  server_id: string;
  name: string;
  transport_type: McpTransportType;
  transport_config: Record<string, unknown>;
  library_item_id: string | null;
}

interface AgentPromptRow {
  system_prompt: string | null;
  max_steps: number | null;
}

interface ContextItemRow {
  content: string;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isAgentSyncRow(value: unknown): value is AgentSyncRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'org_id' in value &&
    'is_public' in value &&
    'current_version' in value
  );
}

function isOrgSyncRow(value: unknown): value is OrgSyncRow {
  return typeof value === 'object' && value !== null && 'slug' in value;
}

function isMcpServerDbRow(value: unknown): value is McpServerDbRow {
  return typeof value === 'object' && value !== null && 'server_id' in value && 'name' in value;
}

function isAgentPromptRow(value: unknown): value is AgentPromptRow {
  return typeof value === 'object' && value !== null && 'system_prompt' in value;
}

function isContextItemRow(value: unknown): value is ContextItemRow {
  return typeof value === 'object' && value !== null && 'content' in value;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AGENT_SYNC_COLUMNS =
  'id, org_id, name, slug, description, category, app_type, is_public, current_version';
const ORG_SYNC_COLUMNS = 'slug, avatar_url';
const MIN_PUBLISHED_VERSION = 0;

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

async function fetchAgentForSync(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ result: AgentSyncRow | null; error: string | null }> {
  const { data, error } = await supabase.from('agents').select(AGENT_SYNC_COLUMNS).eq('id', agentId).single();

  if (error !== null) return { result: null, error: error.message };
  if (!isAgentSyncRow(data)) return { result: null, error: 'Invalid agent data' };
  return { result: data, error: null };
}

async function fetchOrgForSync(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: OrgSyncRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('organizations')
    .select(ORG_SYNC_COLUMNS)
    .eq('id', orgId)
    .single();

  if (error !== null) return { result: null, error: error.message };
  if (!isOrgSyncRow(data)) return { result: null, error: 'Invalid organization data' };
  return { result: data, error: null };
}

function countNodes(graph: TemplateGraphData): number {
  return graph.nodes.length;
}

function countMcpServers(graph: TemplateGraphData): number {
  return graph.mcpServers.length;
}

function shouldSkipSync(agent: AgentSyncRow): boolean {
  return !agent.is_public || agent.current_version === MIN_PUBLISHED_VERSION;
}

/* ------------------------------------------------------------------ */
/*  MCP row → TemplateMcpServer mapping                                */
/* ------------------------------------------------------------------ */

function extractHeaderKeysFromConfig(config: Record<string, unknown>): string[] {
  const { headers } = config;
  if (typeof headers === 'object' && headers !== null) return Object.keys(headers);
  return [];
}

function mapDbRowToTemplate(row: McpServerDbRow): TemplateMcpServer {
  if (row.library_item_id !== null) {
    return { type: 'library' as const, libraryItemId: row.library_item_id, name: row.name };
  }
  const url = typeof row.transport_config.url === 'string' ? row.transport_config.url : undefined;
  return {
    type: 'custom' as const,
    name: row.name,
    transportType: row.transport_type,
    url,
    headerKeys: extractHeaderKeysFromConfig(row.transport_config),
  };
}

function stripMcpServerRowsToTemplate(rows: unknown): TemplateMcpServer[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isMcpServerDbRow).map(mapDbRowToTemplate);
}

function filterContextItems(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isContextItemRow).map((r) => r.content);
}

/* ------------------------------------------------------------------ */
/*  Public: assemble agent template config                             */
/* ------------------------------------------------------------------ */

export async function assembleAgentTemplateConfig(
  supabase: SupabaseClient,
  agentId: string
): Promise<Record<string, unknown> | null> {
  const { data: agent } = await supabase
    .from('agents')
    .select('system_prompt, max_steps')
    .eq('id', agentId)
    .single();

  if (!isAgentPromptRow(agent)) return null;

  const { data: contextRows } = await supabase
    .from('agent_context_items')
    .select('content')
    .eq('agent_id', agentId)
    .order('sort_order', { ascending: true });

  const { data: mcpRows } = await supabase
    .from('graph_mcp_servers')
    .select('server_id, name, transport_type, transport_config, library_item_id')
    .eq('agent_id', agentId);

  return {
    systemPrompt: agent.system_prompt ?? '',
    contextItems: filterContextItems(contextRows),
    maxSteps: agent.max_steps ?? null,
    mcpServers: stripMcpServerRowsToTemplate(mcpRows),
  };
}

/* ------------------------------------------------------------------ */
/*  Public: sync after publish                                         */
/* ------------------------------------------------------------------ */

export async function syncTemplateAfterPublish(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ error: string | null }> {
  const agentResult = await fetchAgentForSync(supabase, agentId);
  if (agentResult.error !== null) return { error: agentResult.error };
  if (agentResult.result === null) return { error: 'Agent not found' };

  if (shouldSkipSync(agentResult.result)) return { error: null };

  return await performUpsertSync(supabase, agentResult.result);
}

interface UpsertPayload {
  template_graph_data: TemplateGraphData | null;
  template_agent_config: Record<string, unknown> | null;
  node_count: number;
  mcp_server_count: number;
}

async function performUpsertSync(
  supabase: SupabaseClient,
  agent: AgentSyncRow
): Promise<{ error: string | null }> {
  const orgResult = await fetchOrgForSync(supabase, agent.org_id);
  if (orgResult.error !== null) return { error: orgResult.error };
  if (orgResult.result === null) return { error: 'Organization not found' };

  if (agent.app_type === 'agent') {
    return await performAgentUpsert(supabase, agent, orgResult.result);
  }
  return await performWorkflowUpsert(supabase, agent, orgResult.result);
}

async function performWorkflowUpsert(
  supabase: SupabaseClient,
  agent: AgentSyncRow,
  org: OrgSyncRow
): Promise<{ error: string | null }> {
  const graph = await assembleTemplateSafeGraph(supabase, agent.id, agent.current_version);
  if (graph === null) return { error: 'Failed to assemble template graph data' };

  return await executeUpsert(supabase, agent, org, {
    template_graph_data: graph,
    template_agent_config: null,
    node_count: countNodes(graph),
    mcp_server_count: countMcpServers(graph),
  });
}

async function performAgentUpsert(
  supabase: SupabaseClient,
  agent: AgentSyncRow,
  org: OrgSyncRow
): Promise<{ error: string | null }> {
  const config = await assembleAgentTemplateConfig(supabase, agent.id);
  if (config === null) return { error: 'Failed to assemble agent config' };

  const mcpServers = Array.isArray(config.mcpServers) ? config.mcpServers : [];

  return await executeUpsert(supabase, agent, org, {
    template_graph_data: null,
    template_agent_config: config,
    node_count: 0,
    mcp_server_count: mcpServers.length,
  });
}

async function executeUpsert(
  supabase: SupabaseClient,
  agent: AgentSyncRow,
  org: OrgSyncRow,
  payload: UpsertPayload
): Promise<{ error: string | null }> {
  const { error } = await upsertTemplate(supabase, {
    agent_id: agent.id,
    org_id: agent.org_id,
    org_slug: org.slug,
    org_avatar_url: org.avatar_url,
    agent_slug: agent.slug,
    agent_name: agent.name,
    description: agent.description,
    category: agent.category,
    app_type: agent.app_type,
    latest_version: agent.current_version,
    ...payload,
  });

  return { error };
}

/* ------------------------------------------------------------------ */
/*  Public: sync on public toggle                                      */
/* ------------------------------------------------------------------ */

export async function syncTemplateOnPublicToggle(
  supabase: SupabaseClient,
  agentId: string,
  isPublic: boolean
): Promise<{ error: string | null }> {
  if (!isPublic) return await removeTemplate(supabase, agentId);
  return await handleMakePublic(supabase, agentId);
}

async function handleMakePublic(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ error: string | null }> {
  const agentResult = await fetchAgentForSync(supabase, agentId);
  if (agentResult.error !== null) return { error: agentResult.error };
  if (agentResult.result === null) return { error: 'Agent not found' };

  if (agentResult.result.current_version === MIN_PUBLISHED_VERSION) {
    return { error: 'Publish your agent at least once before making it public' };
  }

  return await syncTemplateAfterPublish(supabase, agentId);
}
