import type { SelectedTool } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string;
  start_node: string;
  current_version: number;
  version: number;
  created_at: string;
  updated_at: string;
  staging_api_key_id: string | null;
  production_api_key_id: string | null;
  is_public: boolean;
  category: string;
  created_from_template_id: string | null;
  app_type: string;
  selected_tools: SelectedTool[];
  system_prompt: string | null;
  max_steps: number | null;
}

export type AgentMetadata = Pick<
  AgentRow,
  'id' | 'name' | 'slug' | 'description' | 'version' | 'updated_at'
> & {
  published_at: string | null;
};

interface VersionRow {
  agent_id: string;
  published_at: string;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isAgentRow(value: unknown): value is AgentRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'slug' in value &&
    'selected_tools' in value
  );
}

function isVersionRow(value: unknown): value is VersionRow {
  return typeof value === 'object' && value !== null && 'agent_id' in value && 'published_at' in value;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const METADATA_COLUMNS = 'id, name, slug, description, version:current_version, updated_at, app_type';
const EMPTY_LENGTH = 0;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type AgentBase = Pick<AgentRow, 'id' | 'name' | 'slug' | 'description' | 'version' | 'updated_at'>;

function isAgentBase(value: unknown): value is AgentBase {
  return typeof value === 'object' && value !== null && 'id' in value && 'slug' in value;
}

function filterAgentBases(data: unknown): AgentBase[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isAgentBase);
}

function filterVersionRows(data: unknown): VersionRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isVersionRow);
}

async function fetchPublishedAtMap(
  supabase: SupabaseClient,
  agentIds: string[]
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('agent_versions')
    .select('agent_id, published_at')
    .in('agent_id', agentIds)
    .order('version', { ascending: false });

  const rows = filterVersionRows(data);
  const map = new Map<string, string>();

  for (const v of rows) {
    if (!map.has(v.agent_id)) {
      map.set(v.agent_id, v.published_at);
    }
  }

  return map;
}

function attachPublishedAt(rows: AgentBase[], publishedAtMap: Map<string, string>): AgentMetadata[] {
  return rows.map((a) => ({
    ...a,
    published_at: publishedAtMap.get(a.id) ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function getAgentsByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: AgentMetadata[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agents')
    .select(METADATA_COLUMNS)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };

  const rows = filterAgentBases(data);
  if (rows.length === EMPTY_LENGTH) return { result: [], error: null };

  const ids = rows.map((a) => a.id);
  const publishedAtMap = await fetchPublishedAtMap(supabase, ids);

  return { result: attachPublishedAt(rows, publishedAtMap), error: null };
}

export async function getAgentBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<{ result: AgentRow | null; error: string | null }> {
  const queryResult = await supabase.from('agents').select('*').eq('slug', slug).single();

  if (queryResult.error !== null) return { result: null, error: queryResult.error.message };
  if (!isAgentRow(queryResult.data)) return { result: null, error: 'Invalid agent data' };
  return { result: queryResult.data, error: null };
}

export async function getAgentById(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ result: AgentRow | null; error: string | null }> {
  const queryResult = await supabase.from('agents').select('*').eq('id', agentId).single();

  if (queryResult.error !== null) return { result: null, error: queryResult.error.message };
  if (!isAgentRow(queryResult.data)) return { result: null, error: 'Invalid agent data' };
  return { result: queryResult.data, error: null };
}

interface InsertAgentInput {
  orgId: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  isPublic: boolean;
  appType: string;
  systemPrompt: string | null;
}

export async function insertAgent(
  supabase: SupabaseClient,
  input: InsertAgentInput
): Promise<{ result: AgentRow | null; error: string | null }> {
  const queryResult = await supabase
    .from('agents')
    .insert({
      org_id: input.orgId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      category: input.category,
      is_public: input.isPublic,
      app_type: input.appType,
      system_prompt: input.systemPrompt,
    })
    .select()
    .single();

  if (queryResult.error !== null) return { result: null, error: queryResult.error.message };
  if (!isAgentRow(queryResult.data)) return { result: null, error: 'Invalid agent data' };
  return { result: queryResult.data, error: null };
}

export async function updateStagingKeyId(
  supabase: SupabaseClient,
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = { staging_api_key_id: keyId };
  const { error } = await supabase.from('agents').update(payload).eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateProductionKeyId(
  supabase: SupabaseClient,
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = { production_api_key_id: keyId };
  const { error } = await supabase.from('agents').update(payload).eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

interface AgentUpdateFields {
  name?: string;
  description?: string;
}

function buildAgentPayload(fields: AgentUpdateFields): Record<string, unknown> {
  const { name, description } = fields;
  const payload: Record<string, unknown> = {};
  if (name !== undefined) payload.name = name;
  if (description !== undefined) payload.description = description;
  return payload;
}

export async function updateAgent(
  supabase: SupabaseClient,
  agentId: string,
  fields: AgentUpdateFields
): Promise<{ error: string | null }> {
  const payload = buildAgentPayload(fields);
  const { error } = await supabase.from('agents').update(payload).eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function deleteAgent(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('agents').delete().eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateAgentVisibility(
  supabase: SupabaseClient,
  agentId: string,
  isPublic: boolean
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = { is_public: isPublic };
  const { error } = await supabase.from('agents').update(payload).eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateAgentCategory(
  supabase: SupabaseClient,
  agentId: string,
  category: string
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = { category };
  const { error } = await supabase.from('agents').update(payload).eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateAgentMetadata(
  supabase: SupabaseClient,
  agentId: string,
  fields: AgentUpdateFields
): Promise<{ error: string | null }> {
  const payload = buildAgentPayload(fields);
  const { error } = await supabase.from('agents').update(payload).eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function getAgentOrgId(supabase: SupabaseClient, agentId: string): Promise<string | null> {
  const result = await supabase.from('agents').select('org_id').eq('id', agentId).single();
  if (result.error !== null) return null;
  return (result.data as { org_id: string }).org_id;
}
