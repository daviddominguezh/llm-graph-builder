import type { SupabaseClient } from '@supabase/supabase-js';

import { findUniqueSlug, generateSlug } from './slug';

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
}

export type AgentMetadata = Pick<AgentRow, 'id' | 'name' | 'slug' | 'description' | 'version' | 'updated_at'>;

interface InsertAgentParams {
  supabase: SupabaseClient;
  orgId: string;
  name: string;
  slug: string;
  description: string;
}

const METADATA_COLUMNS = 'id, name, slug, description, version, updated_at';

/**
 * Supabase returns untyped data for schemas without codegen.
 * This type predicate enables safe narrowing from query results.
 */
function isAgentRow(value: unknown): value is AgentRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'slug' in value;
}

export async function getAgentsByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ agents: AgentMetadata[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agents')
    .select(METADATA_COLUMNS)
    .eq('org_id', orgId)
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
      org_id: params.orgId,
      name: params.name,
      slug: params.slug,
      description: params.description,
    })
    .select()
    .single();

  if (result.error !== null) return { agent: null, error: result.error.message };
  if (!isAgentRow(result.data)) return { agent: null, error: 'Invalid agent data' };
  return { agent: result.data, error: null };
}

export async function createAgent(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  description: string
): Promise<{ agent: AgentRow | null; error: string | null }> {
  const baseSlug = generateSlug(name);
  if (baseSlug === '') {
    return { agent: null, error: 'Invalid agent name' };
  }

  const slug = await findUniqueSlug(supabase, baseSlug, 'agents');
  return await insertAgent({ supabase, orgId, name, slug, description });
}

export async function saveStagingKeyId(
  supabase: SupabaseClient,
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = { staging_api_key_id: keyId };
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
