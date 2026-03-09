import type { SupabaseClient } from '@supabase/supabase-js';

import { findUniqueSlug, generateSlug } from './slug';

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgWithAgentCount extends OrgRow {
  agent_count: number;
}

interface AgentCountShape {
  count: number;
}

interface OrgRowWithAgents extends OrgRow {
  agents: AgentCountShape[];
}

const ORG_COLUMNS = 'id, name, slug, avatar_url, created_at, updated_at';
const DEFAULT_AGENT_COUNT = 0;
const FIRST_INDEX = 0;

/**
 * Supabase returns untyped data for schemas without codegen.
 * This type predicate enables safe narrowing from query results.
 */
export function isOrgRow(value: unknown): value is OrgRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'slug' in value;
}

function isObjectWithAgents(value: unknown): value is Record<string, unknown> & { agents: unknown } {
  return typeof value === 'object' && value !== null && 'agents' in value;
}

function hasAgentsArray(value: unknown): value is OrgRowWithAgents {
  if (!isOrgRow(value)) return false;
  if (!isObjectWithAgents(value)) return false;
  return Array.isArray(value.agents);
}

function extractAgentCount(row: OrgRowWithAgents): number {
  const { agents } = row;
  if (agents.length === DEFAULT_AGENT_COUNT) return DEFAULT_AGENT_COUNT;
  return agents[FIRST_INDEX].count;
}

function toOrgWithCount(row: unknown): OrgWithAgentCount | null {
  if (!hasAgentsArray(row)) return null;
  const { agents: _agents, ...orgFields } = row;
  return { ...orgFields, agent_count: extractAgentCount(row) };
}

function mapOrgsWithCounts(data: unknown[]): OrgWithAgentCount[] {
  return data.reduce<OrgWithAgentCount[]>((acc, row) => {
    const org = toOrgWithCount(row);
    if (org !== null) acc.push(org);
    return acc;
  }, []);
}

export async function getOrgsByUser(
  supabase: SupabaseClient
): Promise<{ result: OrgWithAgentCount[]; error: string | null }> {
  const { data, error } = await supabase
    .from('organizations')
    .select(`${ORG_COLUMNS}, agents(count)`)
    .order('updated_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapOrgsWithCounts(rows), error: null };
}

export async function getOrgBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<{ result: OrgRow | null; error: string | null }> {
  const result = await supabase.from('organizations').select(ORG_COLUMNS).eq('slug', slug).single();

  if (result.error !== null) return { result: null, error: result.error.message };
  if (!isOrgRow(result.data)) return { result: null, error: 'Invalid organization data' };
  return { result: result.data, error: null };
}

export async function createOrg(
  supabase: SupabaseClient,
  name: string
): Promise<{ result: OrgRow | null; error: string | null }> {
  const baseSlug = generateSlug(name);
  if (baseSlug === '') {
    return { result: null, error: 'Invalid organization name' };
  }

  const slug = await findUniqueSlug(supabase, baseSlug, 'organizations');
  return await insertOrg(supabase, name, slug);
}

async function insertOrg(
  supabase: SupabaseClient,
  name: string,
  slug: string
): Promise<{ result: OrgRow | null; error: string | null }> {
  const result = await supabase.from('organizations').insert({ name, slug }).select().single();

  if (result.error !== null) return { result: null, error: result.error.message };
  if (!isOrgRow(result.data)) return { result: null, error: 'Invalid organization data' };
  return { result: result.data, error: null };
}

export async function updateOrgName(
  supabase: SupabaseClient,
  orgId: string,
  name: string
): Promise<{ result: string | null; error: string | null }> {
  const baseSlug = generateSlug(name);
  if (baseSlug === '') {
    return { result: null, error: 'Invalid organization name' };
  }

  const slug = await findUniqueSlug(supabase, baseSlug, 'organizations');
  const { error } = await supabase.from('organizations').update({ name, slug }).eq('id', orgId);

  if (error !== null) return { result: null, error: error.message };
  return { result: slug, error: null };
}

export async function updateOrgAvatar(
  supabase: SupabaseClient,
  orgId: string,
  avatarUrl: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('organizations').update({ avatar_url: avatarUrl }).eq('id', orgId);

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function deleteOrg(supabase: SupabaseClient, orgId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('organizations').delete().eq('id', orgId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
