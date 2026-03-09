import type { Operation } from '@daviddh/graph-types';

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

/**
 * Executes a batch of operations sequentially.
 * Stops and throws on the first failure.
 */
export async function executeOperationsBatch(
  supabase: SupabaseClient,
  agentId: string,
  operations: Operation[]
): Promise<void> {
  await runSequentially(supabase, agentId, operations);
}
