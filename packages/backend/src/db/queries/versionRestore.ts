import type { Graph } from '@daviddh/graph-types';
import { GraphSchema } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';
import { getVersionSnapshot } from './versionQueries.js';
import {
  clearStagingData,
  hydrateAgents,
  hydrateEdges,
  hydrateMcpServers,
  hydrateNodes,
} from './versionRestoreHelpers.js';

function parseGraphSnapshot(raw: Graph): Graph {
  const parsed = GraphSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(`Invalid graph snapshot: ${parsed.error.message}`);
  }

  return parsed.data;
}

async function hydrateGraph(supabase: SupabaseClient, agentId: string, graph: Graph): Promise<void> {
  await hydrateNodes(supabase, agentId, graph.nodes);
  await hydrateEdges(supabase, agentId, graph.edges);

  await Promise.all([
    hydrateAgents(supabase, agentId, graph.agents),
    hydrateMcpServers(supabase, agentId, graph.mcpServers),
  ]);
}

async function updateAgentAfterRestore(
  supabase: SupabaseClient,
  agentId: string,
  startNode: string,
  version: number
): Promise<void> {
  const result = await supabase
    .from('agents')
    .update({ start_node: startNode, current_version: version })
    .eq('id', agentId);
  throwOnMutationError(result, 'updateAgentAfterRestore');
}

export async function restoreVersion(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<Graph> {
  const snapshot = await getVersionSnapshot(supabase, agentId, version);

  if (snapshot === null) {
    throw new Error(`Version ${String(version)} not found`);
  }

  const graph = parseGraphSnapshot(snapshot);

  await clearStagingData(supabase, agentId);
  await hydrateGraph(supabase, agentId, graph);
  await updateAgentAfterRestore(supabase, agentId, graph.startNode, version);

  return graph;
}
