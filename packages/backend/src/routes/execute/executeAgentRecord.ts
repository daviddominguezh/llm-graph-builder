import type { SelectedTool } from '@daviddh/llm-graph-runner';

import { getAgentById } from '../../db/queries/agentQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { AgentExecutionRecord } from './executeFetcher.js';

const HTTP_NOT_FOUND = 404;

export class HttpNotFoundError extends Error {
  public readonly status = HTTP_NOT_FOUND;
}

export interface VersionSnapshotRow {
  selected_tools: SelectedTool[];
  selected_kv_store_id: string | null;
  selected_rag_store_id: string | null;
}

function isVersionSnapshotRow(value: unknown): value is VersionSnapshotRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'selected_tools' in value;
}

export async function fetchVersionSnapshot(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<VersionSnapshotRow | null> {
  const { data, error } = await supabase
    .from('agent_versions')
    .select('selected_tools, selected_kv_store_id, selected_rag_store_id')
    .eq('agent_id', agentId)
    .eq('version', version)
    .maybeSingle();
  if (error !== null) return null;
  if (!isVersionSnapshotRow(data)) return null;
  return data;
}

function emptyRecordForOrg(orgId: string): AgentExecutionRecord {
  return { org_id: orgId, selected_tools: [], selected_kv_store_id: null, selected_rag_store_id: null };
}

/**
 * Read the agent execution record for production runs. Bindings + selected_tools
 * are sourced from the `agent_versions` snapshot row so a draft binding change
 * can never leak into a production run. Falls back to no-bindings if the
 * snapshot row is missing (legacy versions pre-backfill) — the sentinel
 * services then raise `no_store_bound` on first tool use.
 */
type FetchSnapshotFn = (
  supabase: SupabaseClient,
  agentId: string,
  version: number
) => Promise<VersionSnapshotRow | null>;

export async function fetchAgentRecordVersionAware(
  supabase: SupabaseClient,
  agentId: string,
  version: number,
  fetchSnapshot: FetchSnapshotFn = fetchVersionSnapshot
): Promise<AgentExecutionRecord> {
  const { result } = await getAgentById(supabase, agentId);
  if (result === null) throw new HttpNotFoundError(`Agent not found: ${agentId}`);
  const snapshot = await fetchSnapshot(supabase, agentId, version);
  if (snapshot === null) return emptyRecordForOrg(result.org_id);
  return {
    org_id: result.org_id,
    selected_tools: snapshot.selected_tools,
    selected_kv_store_id: snapshot.selected_kv_store_id,
    selected_rag_store_id: snapshot.selected_rag_store_id,
  };
}
