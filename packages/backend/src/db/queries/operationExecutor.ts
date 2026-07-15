import type { Graph, Operation } from '@daviddh/graph-types';

import { withAgentLock } from './agentBatchLock.js';
import { assembleGraph } from './graphQueries.js';
import { executeSingleOperation } from './operationDispatch.js';
import { type SupabaseClient, throwOnMutationError } from './operationHelpers.js';

let batchCounter = 0;

export function describeOperation(op: Operation): string {
  if (op.type === 'insertEdge' || op.type === 'updateEdge') {
    return `${op.type}(${op.data.from}->${op.data.to})`;
  }
  if (op.type === 'deleteEdge') return `deleteEdge(${op.from}->${op.to})`;
  if (op.type === 'insertNode' || op.type === 'updateNode') {
    return `${op.type}(${op.data.nodeId})`;
  }
  if (op.type === 'deleteNode') return `deleteNode(${op.nodeId})`;
  return op.type;
}

function summarizeGraph(graph: Graph | null): string {
  if (graph === null) return 'no existing graph';
  return `${String(graph.nodes.length)} nodes, ${String(graph.edges.length)} edges`;
}

function logBatch(batchId: number, agentId: string, message: string): void {
  process.stdout.write(`[graphOps#${String(batchId)}] agent=${agentId} ${message}\n`);
}

function logBatchError(batchId: number, agentId: string, message: string): void {
  process.stderr.write(`[graphOps#${String(batchId)}] agent=${agentId} ERROR: ${message}\n`);
}

async function touchAgentUpdatedAt(supabase: SupabaseClient, agentId: string): Promise<void> {
  const result = await supabase
    .from('agents')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', agentId);
  throwOnMutationError(result, 'touchAgentUpdatedAt');
}

async function runSequentially(
  batchId: number,
  supabase: SupabaseClient,
  agentId: string,
  operations: Operation[]
): Promise<undefined> {
  let index = 0;
  await operations.reduce(async (chain, op) => {
    await chain;
    index++;
    try {
      await executeSingleOperation(supabase, agentId, op);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logBatchError(
        batchId,
        agentId,
        `op ${String(index)}/${String(operations.length)} ${describeOperation(op)} failed: ${detail}`
      );
      throw err;
    }
    return undefined;
  }, Promise.resolve(undefined));
  return undefined;
}

async function rollbackToSnapshot(
  batchId: number,
  supabase: SupabaseClient,
  agentId: string,
  snapshot: Graph
): Promise<void> {
  logBatch(batchId, agentId, `rolling back to pre-batch snapshot (${summarizeGraph(snapshot)})`);
  const result = await supabase.rpc('rollback_to_snapshot_tx', {
    p_agent_id: agentId,
    p_snapshot: snapshot,
  });
  if (result.error !== null) {
    throw new Error(`rollbackToSnapshot: ${result.error.message}`);
  }
  logBatch(batchId, agentId, 'rollback completed');
}

async function runBatch(
  batchId: number,
  supabase: SupabaseClient,
  agentId: string,
  operations: Operation[]
): Promise<void> {
  const startedAt = Date.now();
  const snapshot = await assembleGraph(supabase, agentId);
  logBatch(batchId, agentId, `state before batch: ${summarizeGraph(snapshot)}`);

  try {
    await runSequentially(batchId, supabase, agentId, operations);
  } catch (err) {
    if (snapshot !== null) {
      await rollbackToSnapshot(batchId, supabase, agentId, snapshot).catch((rollbackErr: unknown) => {
        const detail = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
        logBatchError(batchId, agentId, `rollback FAILED (graph may be inconsistent): ${detail}`);
      });
    }
    throw err;
  }

  logBatch(
    batchId,
    agentId,
    `applied ${String(operations.length)} ops OK in ${String(Date.now() - startedAt)}ms`
  );
  await touchAgentUpdatedAt(supabase, agentId).catch(() => {
    /* best-effort — graph ops already succeeded */
  });
}

/**
 * Executes a batch of operations sequentially, serialized per agent so two
 * batches for the same agent can never interleave (which previously let one
 * batch's snapshot rollback erase another batch's committed writes).
 * Takes a snapshot before executing so the graph can be rolled back to its
 * previous state if any operation fails.
 */
export async function executeOperationsBatch(
  supabase: SupabaseClient,
  agentId: string,
  operations: Operation[]
): Promise<void> {
  const batchId = ++batchCounter;
  logBatch(
    batchId,
    agentId,
    `received ${String(operations.length)} ops: ${operations.map(describeOperation).join(', ')}`
  );
  await withAgentLock(agentId, () => runBatch(batchId, supabase, agentId, operations));
}
