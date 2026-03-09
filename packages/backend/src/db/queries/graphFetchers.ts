import type { createClient } from '@supabase/supabase-js';

import type {
  AgentRow,
  AgentStartNodeRow,
  EdgeContextPreconditionRow,
  EdgePreconditionRow,
  EdgeRow,
  McpServerRow,
  NodeRow,
} from './graphRowTypes.js';

type SupabaseClient = ReturnType<typeof createClient>;

const EMPTY_LENGTH = 0;

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function throwOnError<T>(result: QueryResult<T>): T {
  if (result.error !== null) {
    throw new Error(`Supabase query error: ${result.error.message}`);
  }
  if (result.data === null) {
    throw new Error('Supabase query returned null data');
  }
  return result.data;
}

export async function fetchStartNode(supabase: SupabaseClient, agentId: string): Promise<string | null> {
  const result = await supabase.from('agents').select('start_node').eq('id', agentId).single();

  if (result.error !== null) return null;

  const row: AgentStartNodeRow = result.data;
  return row.start_node;
}

export async function fetchNodes(supabase: SupabaseClient, agentId: string): Promise<NodeRow[]> {
  const result = await supabase.from('graph_nodes').select('*').eq('agent_id', agentId);
  const rows: NodeRow[] = throwOnError(result);
  return rows;
}

export async function fetchEdges(supabase: SupabaseClient, agentId: string): Promise<EdgeRow[]> {
  const result = await supabase.from('graph_edges').select('*').eq('agent_id', agentId);
  const rows: EdgeRow[] = throwOnError(result);
  return rows;
}

export async function fetchEdgePreconditions(
  supabase: SupabaseClient,
  edgeIds: string[]
): Promise<EdgePreconditionRow[]> {
  if (edgeIds.length === EMPTY_LENGTH) return [];

  const result = await supabase.from('graph_edge_preconditions').select('*').in('edge_id', edgeIds);
  const rows: EdgePreconditionRow[] = throwOnError(result);
  return rows;
}

export async function fetchEdgeContextPreconditions(
  supabase: SupabaseClient,
  edgeIds: string[]
): Promise<EdgeContextPreconditionRow[]> {
  if (edgeIds.length === EMPTY_LENGTH) return [];

  const result = await supabase.from('graph_edge_context_preconditions').select('*').in('edge_id', edgeIds);
  const rows: EdgeContextPreconditionRow[] = throwOnError(result);
  return rows;
}

export async function fetchAgents(supabase: SupabaseClient, agentId: string): Promise<AgentRow[]> {
  const result = await supabase.from('graph_agents').select('*').eq('agent_id', agentId);
  const rows: AgentRow[] = throwOnError(result);
  return rows;
}

export async function fetchMcpServers(supabase: SupabaseClient, agentId: string): Promise<McpServerRow[]> {
  const result = await supabase.from('graph_mcp_servers').select('*').eq('agent_id', agentId);
  const rows: McpServerRow[] = throwOnError(result);
  return rows;
}
