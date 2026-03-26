import type { TemplateGraphData } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TemplateRow {
  id: string;
  agent_id: string;
  org_id: string;
  org_slug: string;
  org_avatar_url: string | null;
  agent_slug: string;
  agent_name: string;
  description: string;
  category: string;
  node_count: number;
  mcp_server_count: number;
  download_count: number;
  latest_version: number;
  created_at: string;
  updated_at: string;
}

export interface BrowseTemplateOptions {
  search?: string;
  category?: string;
  sort?: 'downloads' | 'newest' | 'updated';
  limit?: number;
  offset?: number;
}

export interface UpsertTemplateInput {
  agent_id: string;
  org_id: string;
  org_slug: string;
  org_avatar_url: string | null;
  agent_slug: string;
  agent_name: string;
  description: string;
  category: string;
  node_count: number;
  mcp_server_count: number;
  latest_version: number;
  template_graph_data: TemplateGraphData;
}

export interface TemplateMetadataFields {
  agent_name?: string;
  description?: string;
  category?: string;
  agent_slug?: string;
}

export interface TemplateOrgFields {
  org_slug?: string;
  org_avatar_url?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isTemplateRow(value: unknown): value is TemplateRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'agent_id' in value &&
    'org_id' in value &&
    'agent_name' in value
  );
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const BROWSE_COLUMNS = [
  'id',
  'agent_id',
  'org_id',
  'org_slug',
  'org_avatar_url',
  'agent_slug',
  'agent_name',
  'description',
  'category',
  'node_count',
  'mcp_server_count',
  'download_count',
  'latest_version',
  'created_at',
  'updated_at',
].join(', ');

const DEFAULT_BROWSE_LIMIT = 15;
const RANGE_OFFSET = 1;

function toSafeArray(data: unknown): unknown[] {
  if (isUnknownArray(data)) return data;
  return [];
}

function filterRows(data: unknown[]): TemplateRow[] {
  return data.reduce<TemplateRow[]>((acc, row) => {
    if (isTemplateRow(row)) acc.push(row);
    return acc;
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Browse helpers                                                     */
/* ------------------------------------------------------------------ */

function getSearchFilter(options: BrowseTemplateOptions): string | null {
  if (options.search === undefined || options.search === '') return null;
  const p = `%${options.search}%`;
  return `agent_name.ilike.${p},description.ilike.${p},category.ilike.${p}`;
}

function getCategoryFilter(options: BrowseTemplateOptions): string | null {
  if (options.category === undefined || options.category === '') return null;
  return options.category;
}

function getSortColumn(sort: BrowseTemplateOptions['sort']): { column: string; ascending: boolean } {
  if (sort === 'newest') return { column: 'created_at', ascending: false };
  if (sort === 'updated') return { column: 'updated_at', ascending: false };
  return { column: 'download_count', ascending: false };
}

function computeRange(options: BrowseTemplateOptions): { from: number; to: number } | null {
  if (options.offset === undefined) return null;
  const limit = options.limit ?? DEFAULT_BROWSE_LIMIT;
  return { from: options.offset, to: options.offset + limit - RANGE_OFFSET };
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function browseTemplates(
  supabase: SupabaseClient,
  options?: BrowseTemplateOptions
): Promise<{ result: TemplateRow[]; error: string | null }> {
  const sortOpts = getSortColumn(options?.sort);
  let query = supabase
    .from('agent_templates')
    .select(BROWSE_COLUMNS)
    .order(sortOpts.column, { ascending: sortOpts.ascending });

  if (options !== undefined) {
    const search = getSearchFilter(options);
    if (search !== null) query = query.or(search);
    const category = getCategoryFilter(options);
    if (category !== null) query = query.eq('category', category);
    if (options.limit !== undefined) query = query.limit(options.limit);
    const range = computeRange(options);
    if (range !== null) query = query.range(range.from, range.to);
  }

  const { data, error } = await query;
  if (error !== null) return { result: [], error: error.message };
  return { result: filterRows(toSafeArray(data)), error: null };
}

export async function upsertTemplate(
  supabase: SupabaseClient,
  input: UpsertTemplateInput
): Promise<{ result: TemplateRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_templates')
    .upsert(input, { onConflict: 'agent_id' })
    .select(BROWSE_COLUMNS)
    .single();

  if (error !== null) return { result: null, error: error.message };
  if (!isTemplateRow(data)) return { result: null, error: 'Invalid template data' };
  return { result: data, error: null };
}

export async function removeTemplate(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('agent_templates').delete().eq('agent_id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateTemplateMetadata(
  supabase: SupabaseClient,
  agentId: string,
  fields: TemplateMetadataFields
): Promise<{ error: string | null }> {
  const payload = buildMetadataPayload(fields);
  const { error } = await supabase.from('agent_templates').update(payload).eq('agent_id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

function buildMetadataPayload(fields: TemplateMetadataFields): Record<string, string> {
  const payload: Record<string, string> = {};
  if (fields.agent_name !== undefined) payload.agent_name = fields.agent_name;
  if (fields.description !== undefined) payload.description = fields.description;
  if (fields.category !== undefined) payload.category = fields.category;
  if (fields.agent_slug !== undefined) payload.agent_slug = fields.agent_slug;
  return payload;
}

export async function updateTemplateOrgInfo(
  supabase: SupabaseClient,
  orgId: string,
  fields: TemplateOrgFields
): Promise<{ error: string | null }> {
  const payload = buildOrgPayload(fields);
  const { error } = await supabase.from('agent_templates').update(payload).eq('org_id', orgId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

function buildOrgPayload(fields: TemplateOrgFields): Record<string, string | null> {
  const payload: Record<string, string | null> = {};
  if (fields.org_slug !== undefined) payload.org_slug = fields.org_slug;
  if (fields.org_avatar_url !== undefined) payload.org_avatar_url = fields.org_avatar_url;
  return payload;
}

export async function incrementDownloads(
  supabase: SupabaseClient,
  templateId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('increment_template_downloads', {
    p_template_id: templateId,
  });
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function getTemplateByAgentId(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ result: TemplateRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_templates')
    .select(BROWSE_COLUMNS)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isTemplateRow(data)) return { result: null, error: 'Invalid template data' };
  return { result: data, error: null };
}
