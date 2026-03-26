import type { TemplateGraphData } from '@daviddh/graph-types';

import { fetchFromBackend } from './backendProxy';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TemplateListItem {
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

export interface TemplateVersionSummary {
  version: number;
  publishedAt: string;
  publishedBy: string;
}

export interface BrowseTemplateParams {
  search?: string;
  category?: string;
  sort?: 'downloads' | 'newest' | 'updated';
  limit?: number;
  offset?: number;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isTemplateListItemArray(value: unknown): value is TemplateListItem[] {
  return Array.isArray(value);
}

function isVersionSummaryArray(value: unknown): value is TemplateVersionSummary[] {
  return Array.isArray(value);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function buildBrowseQuery(params?: BrowseTemplateParams): string {
  if (!params) return '';
  const parts: string[] = [];
  if (params.search) parts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.category) parts.push(`category=${encodeURIComponent(params.category)}`);
  if (params.sort) parts.push(`sort=${encodeURIComponent(params.sort)}`);
  if (params.limit !== undefined) parts.push(`limit=${String(params.limit)}`);
  if (params.offset !== undefined) parts.push(`offset=${String(params.offset)}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/* ------------------------------------------------------------------ */
/*  Queries via backend proxy                                          */
/* ------------------------------------------------------------------ */

export async function browseTemplates(
  params?: BrowseTemplateParams
): Promise<{ templates: TemplateListItem[]; error: string | null }> {
  try {
    const qs = buildBrowseQuery(params);
    const data = await fetchFromBackend('GET', `/templates${qs}`);
    if (!isTemplateListItemArray(data)) return { templates: [], error: 'Invalid response' };
    return { templates: data, error: null };
  } catch (err) {
    return { templates: [], error: extractError(err) };
  }
}

export async function getTemplateVersions(
  agentId: string
): Promise<{ versions: TemplateVersionSummary[]; error: string | null }> {
  try {
    const path = `/templates/${encodeURIComponent(agentId)}/versions`;
    const data = await fetchFromBackend('GET', path);
    if (!isVersionSummaryArray(data)) return { versions: [], error: 'Invalid response' };
    return { versions: data, error: null };
  } catch (err) {
    return { versions: [], error: extractError(err) };
  }
}

export async function getTemplateSnapshot(
  agentId: string,
  version: number
): Promise<{ graphData: TemplateGraphData | null; error: string | null }> {
  try {
    const id = encodeURIComponent(agentId);
    const path = `/templates/${id}/versions/${String(version)}`;
    const data = await fetchFromBackend('GET', path);
    if (typeof data !== 'object' || data === null || !('startNode' in data)) {
      return { graphData: null, error: 'Invalid response' };
    }
    return { graphData: data as TemplateGraphData, error: null };
  } catch (err) {
    return { graphData: null, error: extractError(err) };
  }
}
