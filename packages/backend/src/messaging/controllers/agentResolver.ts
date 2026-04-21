/**
 * Resolve agent metadata from a channel connection row.
 *
 * Used by webhook processors to obtain the orgId, agentId, and version
 * needed by executeAgentCore.
 */
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ─── Types ─── */

interface AgentRow {
  org_id: string;
  current_version: number;
}

export interface ResolvedAgent {
  agentId: string;
  orgId: string;
  version: number;
}

interface ChannelConnectionLookup {
  agent_id: string;
}

/* ─── Public API ─── */

export async function resolveAgentForChannel(
  supabase: SupabaseClient,
  connection: ChannelConnectionLookup
): Promise<ResolvedAgent> {
  const result = await supabase
    .from('agents')
    .select('org_id, current_version')
    .eq('id', connection.agent_id)
    .single();

  const row = result.data as AgentRow | null;
  if (row === null) {
    throw new Error(`Agent not found for id: ${connection.agent_id}`);
  }

  return {
    agentId: connection.agent_id,
    orgId: row.org_id,
    version: row.current_version,
  };
}
