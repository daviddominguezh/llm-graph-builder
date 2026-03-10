import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

export async function updateStartNode(
  supabase: SupabaseClient,
  agentId: string,
  startNode: string
): Promise<void> {
  const result = await supabase.from('agents').update({ start_node: startNode }).eq('id', agentId);
  throwOnMutationError(result, 'updateStartNode');
}
