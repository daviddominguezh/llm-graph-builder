import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isOrgRow(value: unknown): value is OrgRow {
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ORG_COLUMNS = 'id, name, slug, avatar_url, created_at, updated_at';
const DEFAULT_COUNT = 0;

function extractAgentCount(row: OrgRowWithAgents): number {
  const { agents } = row;
  const [first] = agents;
  if (first === undefined) return DEFAULT_COUNT;
  return first.count;
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

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

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

export async function insertOrg(
  supabase: SupabaseClient,
  name: string,
  slug: string
): Promise<{ result: OrgRow | null; error: string | null }> {
  const { error } = await supabase.from('organizations').insert({ name, slug });
  if (error !== null) return { result: null, error: error.message };
  return await getOrgBySlug(supabase, slug);
}

export async function updateOrgFields(
  supabase: SupabaseClient,
  orgId: string,
  payload: Record<string, string | null>
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('organizations').update(payload).eq('id', orgId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function fetchCurrentSlug(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await supabase.from('organizations').select('slug').eq('id', orgId).single();
  if (data === null || typeof data !== 'object' || !('slug' in data)) return null;
  return (data as { slug: string }).slug;
}

export async function deleteOrg(supabase: SupabaseClient, orgId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('organizations').delete().eq('id', orgId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function getUserRoleInOrg(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();

  if (data === null || typeof data !== 'object' || !('role' in data)) return null;
  return (data as { role: string }).role;
}
