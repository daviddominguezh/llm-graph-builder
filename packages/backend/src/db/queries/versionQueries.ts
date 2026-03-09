import type { Graph } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

const INITIAL_VERSION = 0;
const VERSION_INCREMENT = 1;

interface AgentPublishRow {
  current_version: number | null;
  staging_api_key_id: string | null;
}

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

interface VersionInsert {
  agentId: string;
  version: number;
  graphData: Graph;
  userId: string;
}

async function fetchAgentPublishInfo(supabase: SupabaseClient, agentId: string): Promise<AgentPublishRow> {
  const result = await supabase
    .from('agents')
    .select('current_version, staging_api_key_id')
    .eq('id', agentId)
    .single();

  if (result.error !== null) {
    throw new Error(`fetchAgentPublishInfo: ${result.error.message}`);
  }

  return result.data as AgentPublishRow;
}

async function insertVersionRow(supabase: SupabaseClient, data: VersionInsert): Promise<void> {
  const result = await supabase.from('agent_versions').insert({
    agent_id: data.agentId,
    version: data.version,
    graph_data: data.graphData,
    published_by: data.userId,
  });
  throwOnMutationError(result, 'insertVersionRow');
}

async function promoteAgent(
  supabase: SupabaseClient,
  agentId: string,
  version: number,
  stagingApiKeyId: string | null
): Promise<void> {
  const result = await supabase
    .from('agents')
    .update({
      current_version: version,
      production_api_key_id: stagingApiKeyId,
    })
    .eq('id', agentId);
  throwOnMutationError(result, 'promoteAgent');
}

export async function publishVersion(
  supabase: SupabaseClient,
  agentId: string,
  userId: string,
  graph: Graph
): Promise<number> {
  const agentInfo = await fetchAgentPublishInfo(supabase, agentId);
  const newVersion = (agentInfo.current_version ?? INITIAL_VERSION) + VERSION_INCREMENT;

  await insertVersionRow(supabase, { agentId, version: newVersion, graphData: graph, userId });
  await promoteAgent(supabase, agentId, newVersion, agentInfo.staging_api_key_id);

  return newVersion;
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

  if (result.error !== null) return null;

  const row: VersionSnapshotRow = result.data;
  return row.graph_data;
}
