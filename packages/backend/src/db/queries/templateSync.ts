import type { TemplateGraphData } from '@daviddh/graph-types';

import { assembleTemplateSafeGraph } from './assembleTemplateSafeGraph.js';
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
  is_public: boolean;
  current_version: number;
}

interface OrgSyncRow {
  slug: string;
  avatar_url: string | null;
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AGENT_SYNC_COLUMNS = 'id, org_id, name, slug, description, category, is_public, current_version';
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

async function performUpsertSync(
  supabase: SupabaseClient,
  agent: AgentSyncRow
): Promise<{ error: string | null }> {
  const orgResult = await fetchOrgForSync(supabase, agent.org_id);
  if (orgResult.error !== null) return { error: orgResult.error };
  if (orgResult.result === null) return { error: 'Organization not found' };

  const graph = await assembleTemplateSafeGraph(supabase, agent.id, agent.current_version);
  if (graph === null) return { error: 'Failed to assemble template graph data' };

  return await executeUpsert(supabase, agent, orgResult.result, graph);
}

async function executeUpsert(
  supabase: SupabaseClient,
  agent: AgentSyncRow,
  org: OrgSyncRow,
  graph: TemplateGraphData
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
    node_count: countNodes(graph),
    mcp_server_count: countMcpServers(graph),
    latest_version: agent.current_version,
    template_graph_data: graph,
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
