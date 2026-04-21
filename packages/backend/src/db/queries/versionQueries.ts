import type { Graph } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';

interface VersionListRow {
  version: number;
  published_at: string;
  published_by: string;
}

export interface VersionSummary {
  version: number;
  publishedAt: string;
  publishedBy: string;
}

interface VersionSnapshotRow {
  graph_data: Graph;
}

export async function publishVersion(supabase: SupabaseClient, agentId: string): Promise<number> {
  const result = await supabase.rpc('publish_version_tx', {
    p_agent_id: agentId,
  });

  if (result.error !== null) {
    throw new Error(`publishVersion: ${result.error.message}`);
  }

  return Number(result.data);
}

export async function publishAgentVersion(supabase: SupabaseClient, agentId: string): Promise<number> {
  const result = await supabase.rpc('publish_agent_version_tx', {
    p_agent_id: agentId,
  });

  if (result.error !== null) {
    throw new Error(`publishAgentVersion: ${result.error.message}`);
  }

  return Number(result.data);
}

export async function listVersions(supabase: SupabaseClient, agentId: string): Promise<VersionSummary[]> {
  const result = await supabase
    .from('agent_versions')
    .select('version, published_at, published_by')
    .eq('agent_id', agentId)
    .order('version', { ascending: false });

  if (result.error !== null) {
    throw new Error(`listVersions: ${result.error.message}`);
  }

  const rows: VersionListRow[] = result.data;

  return rows.map((r) => ({
    version: r.version,
    publishedAt: r.published_at,
    publishedBy: r.published_by,
  }));
}

export async function getVersionSnapshot(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<Graph | null> {
  const result = await supabase
    .from('agent_versions')
    .select('graph_data')
    .eq('agent_id', agentId)
    .eq('version', version)
    .single();

  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return null;
    throw new Error(`getVersionSnapshot: ${result.error.message}`);
  }

  const row: VersionSnapshotRow = result.data;
  return row.graph_data;
}
