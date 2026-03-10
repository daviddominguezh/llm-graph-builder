import type { Graph, Operation } from '@daviddh/graph-types';

import { assembleGraph } from './graphQueries.js';
import { executeSingleOperation } from './operationDispatch.js';
import type { SupabaseClient } from './operationHelpers.js';
import {
  clearStagingData,
  hydrateAgents,
  hydrateEdges,
  hydrateMcpServers,
  hydrateNodes,
} from './versionRestoreHelpers.js';

async function runSequentially(
  supabase: SupabaseClient,
  agentId: string,
  operations: Operation[]
): Promise<undefined> {
  await operations.reduce<Promise<undefined>>(async (chain, op) => {
    await chain;
    await executeSingleOperation(supabase, agentId, op);
    return undefined;
  }, Promise.resolve(undefined));
  return undefined;
}

async function rollbackToSnapshot(supabase: SupabaseClient, agentId: string, snapshot: Graph): Promise<void> {
  await clearStagingData(supabase, agentId);
  await hydrateNodes(supabase, agentId, snapshot.nodes);
  await hydrateEdges(supabase, agentId, snapshot.edges);
  await Promise.all([
    hydrateAgents(supabase, agentId, snapshot.agents),
    hydrateMcpServers(supabase, agentId, snapshot.mcpServers),
  ]);
}

/**
 * Executes a batch of operations sequentially.
 * Takes a snapshot before executing so the graph can be
 * rolled back to its previous state if any operation fails.
 */
export async function executeOperationsBatch(
  supabase: SupabaseClient,
  agentId: string,
  operations: Operation[]
): Promise<void> {
  const snapshot = await assembleGraph(supabase, agentId);

  try {
    await runSequentially(supabase, agentId, operations);
  } catch (err) {
    if (snapshot !== null) {
      await rollbackToSnapshot(supabase, agentId, snapshot).catch(() => {
        /* best-effort rollback — original error is more useful */
      });
    }
    throw err;
  }
}
