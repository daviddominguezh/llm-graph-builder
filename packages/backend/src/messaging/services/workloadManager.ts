/**
 * Agent workload management.
 *
 * Tracks how many active conversations each human agent is handling.
 * Used for load-balancing when auto-assigning new conversations.
 *
 * TODO: Implement workload tracking. Closer-back's implementation:
 * - /closer-back/src/services/agentAssignment.ts
 *   - assignChatToAgent(namespace, userId, assignee): increment agent's activeChats
 *   - reassignChat(namespace, userId, oldAssignee, newAssignee): decrement old, increment new
 *   - releaseChat(namespace, userId, assignee): decrement agent's activeChats
 *
 * Implementation plan:
 * 1. Add a `agent_workloads` table: (agent_email text PK, active_count integer)
 * 2. On assignee change: if old assignee exists and differs, decrement old + increment new
 * 3. On assignee change with no prior: just increment new
 * 4. On status closed/blocked: decrement current assignee
 * 5. Use Redis counter for hot-path reads, persist to DB periodically
 */
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

// TODO: Implement with Redis counters + DB persistence
export async function assignChatToAgent(
  _supabase: SupabaseClient,
  _tenantId: string,
  _userChannelId: string,
  _assignee: string
): Promise<void> {
  // TODO: Increment assignee's activeChats counter
}

// TODO: Implement
export async function reassignChat(
  _supabase: SupabaseClient,
  _tenantId: string,
  _userChannelId: string,
  _oldAssignee: string,
  _newAssignee: string
): Promise<void> {
  // TODO: Decrement old assignee's counter, increment new
}

// TODO: Implement
export async function releaseChat(
  _supabase: SupabaseClient,
  _tenantId: string,
  _userChannelId: string,
  _assignee: string
): Promise<void> {
  // TODO: Decrement assignee's activeChats counter
}
