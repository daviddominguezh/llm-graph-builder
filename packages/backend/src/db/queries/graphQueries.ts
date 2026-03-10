import type { Graph } from '@daviddh/graph-types';

import { assembleAgents, assembleEdges, assembleMcpServers, assembleNodes } from './graphAssemblers.js';
import {
  fetchAgents,
  fetchEdgeContextPreconditions,
  fetchEdgePreconditions,
  fetchEdges,
  fetchMcpServers,
  fetchNodes,
  fetchStartNode,
} from './graphFetchers.js';
import type { EdgeContextPreconditionRow, EdgePreconditionRow, EdgeRow } from './graphRowTypes.js';
import type { SupabaseClient } from './operationHelpers.js';

interface EdgeData {
  edgeRows: EdgeRow[];
  preconditionRows: EdgePreconditionRow[];
  contextPreconditionRows: EdgeContextPreconditionRow[];
}

async function fetchAllEdgeData(supabase: SupabaseClient, agentId: string): Promise<EdgeData> {
  const edgeRows = await fetchEdges(supabase, agentId);
  const edgeIds = edgeRows.map((e) => e.id);

  const [preconditionRows, contextPreconditionRows] = await Promise.all([
    fetchEdgePreconditions(supabase, edgeIds),
    fetchEdgeContextPreconditions(supabase, edgeIds),
  ]);

  return { edgeRows, preconditionRows, contextPreconditionRows };
}

/**
 * Reads all staging tables for the given agent and assembles
 * the full Graph JSON. Returns `null` if the agent is not found.
 */
export async function assembleGraph(supabase: SupabaseClient, agentId: string): Promise<Graph | null> {
  const startNode = await fetchStartNode(supabase, agentId);
  if (startNode === null) return null;

  const [nodeRows, edgeData, agentRows, mcpServerRows] = await Promise.all([
    fetchNodes(supabase, agentId),
    fetchAllEdgeData(supabase, agentId),
    fetchAgents(supabase, agentId),
    fetchMcpServers(supabase, agentId),
  ]);

  return {
    startNode,
    agents: assembleAgents(agentRows),
    nodes: assembleNodes(nodeRows),
    edges: assembleEdges(edgeData.edgeRows, edgeData.preconditionRows, edgeData.contextPreconditionRows),
    mcpServers: assembleMcpServers(mcpServerRows),
  };
}
