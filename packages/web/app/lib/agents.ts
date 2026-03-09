import type { Graph } from '@/app/schemas/graph.schema';
import type { SupabaseClient } from '@supabase/supabase-js';

import { findUniqueSlug, generateSlug } from './slug';

export interface AgentRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string;
  graph_data_staging: Graph;
  graph_data_production: Graph;
  version: number;
  created_at: string;
  updated_at: string;
}

export type AgentMetadata = Pick<AgentRow, 'id' | 'name' | 'slug' | 'description' | 'version' | 'updated_at'>;

interface StagingRow {
  graph_data_staging: Record<string, unknown>;
  version: number;
}

interface InsertAgentParams {
  supabase: SupabaseClient;
  userId: string;
  name: string;
  slug: string;
  description: string;
}

const VERSION_INCREMENT = 1;
const METADATA_COLUMNS = 'id, name, slug, description, version, updated_at';

/**
 * Supabase returns untyped data for schemas without codegen.
 * This type predicate enables safe narrowing from query results.
 */
function isAgentRow(value: unknown): value is AgentRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'slug' in value;
}

export async function getAgentsByUser(
  supabase: SupabaseClient
): Promise<{ agents: AgentMetadata[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agents')
    .select(METADATA_COLUMNS)
    .order('updated_at', { ascending: false });

  if (error !== null) return { agents: [], error: error.message };
  const agents: AgentMetadata[] = (data as AgentMetadata[] | null) ?? [];
  return { agents, error: null };
}

export async function getAgentBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<{ agent: AgentRow | null; error: string | null }> {
  const result = await supabase.from('agents').select('*').eq('slug', slug).single();

  if (result.error !== null) return { agent: null, error: result.error.message };
  if (!isAgentRow(result.data)) return { agent: null, error: 'Invalid agent data' };
  return { agent: result.data, error: null };
}

async function insertAgent(
  params: InsertAgentParams
): Promise<{ agent: AgentRow | null; error: string | null }> {
  const result = await params.supabase
    .from('agents')
    .insert({
      user_id: params.userId,
      name: params.name,
      slug: params.slug,
      description: params.description,
      graph_data_staging: {},
      graph_data_production: {},
    })
    .select()
    .single();

  if (result.error !== null) return { agent: null, error: result.error.message };
  if (!isAgentRow(result.data)) return { agent: null, error: 'Invalid agent data' };
  return { agent: result.data, error: null };
}

export async function createAgent(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  description: string
): Promise<{ agent: AgentRow | null; error: string | null }> {
  const baseSlug = generateSlug(name);
  if (baseSlug === '') {
    return { agent: null, error: 'Invalid agent name' };
  }

  const slug = await findUniqueSlug(supabase, baseSlug);
  return await insertAgent({ supabase, userId, name, slug, description });
}

export async function saveStaging(
  supabase: SupabaseClient,
  agentId: string,
  graphData: Graph
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = { graph_data_staging: graphData };
  const { error } = await supabase.from('agents').update(payload).eq('id', agentId);

  if (error !== null) return { error: error.message };
  return { error: null };
}

async function fetchStagingData(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ row: StagingRow | null; error: string | null }> {
  const result = await supabase
    .from('agents')
    .select('graph_data_staging, version')
    .eq('id', agentId)
    .single();

  if (result.error !== null) return { row: null, error: result.error.message };
  const row: StagingRow = result.data as StagingRow;
  return { row, error: null };
}

async function promoteToProduction(
  supabase: SupabaseClient,
  agentId: string,
  row: StagingRow
): Promise<{ version: number | null; error: string | null }> {
  const newVersion = row.version + VERSION_INCREMENT;

  const { error } = await supabase
    .from('agents')
    .update({ graph_data_production: row.graph_data_staging, version: newVersion })
    .eq('id', agentId);

  if (error !== null) return { version: null, error: error.message };
  return { version: newVersion, error: null };
}

export async function publishAgent(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ version: number | null; error: string | null }> {
  const { row, error } = await fetchStagingData(supabase, agentId);

  if (error !== null || row === null) {
    return { version: null, error: error ?? 'Agent not found' };
  }

  return await promoteToProduction(supabase, agentId, row);
}

export async function deleteAgent(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('agents').delete().eq('id', agentId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
