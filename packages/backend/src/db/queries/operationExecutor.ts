import type { Graph, Operation } from '@daviddh/graph-types';

import { assembleGraph } from './graphQueries.js';
import { executeSingleOperation } from './operationDispatch.js';
import type { SupabaseClient } from './operationHelpers.js';

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
  const result = await supabase.rpc('rollback_to_snapshot_tx', {
    p_agent_id: agentId,
    p_snapshot: snapshot,
  });
  if (result.error !== null) {
    throw new Error(`rollbackToSnapshot: ${result.error.message}`);
  }
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
