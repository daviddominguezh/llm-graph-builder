import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { batchGetAssignees, batchGetStatuses } from '../queries/conversationQueries.js';
import type {
  AssigneeEntry,
  ConversationAssigneeRow,
  ConversationRow,
  ConversationSnapshot,
  ConversationSnapshotMessage,
  ConversationStatusRow,
  StatusEntry,
} from '../types/index.js';

const NO_TIMESTAMP = 0;
const EMPTY_LENGTH = 0;

function buildMessage(row: ConversationRow): ConversationSnapshotMessage {
  const role = row.last_message_role === 'assistant' ? 'assistant' : 'user';
  return { role, content: row.last_message_content ?? '' };
}

function buildAssigneeMap(rows: ConversationAssigneeRow[]): Record<string, AssigneeEntry> {
  const map: Record<string, AssigneeEntry> = {};
  for (const row of rows) {
    map[row.id] = {
      assignee: row.assignee,
      timestamp: new Date(row.created_at).getTime(),
    };
  }
  return map;
}

function buildStatusMap(rows: ConversationStatusRow[]): Record<string, StatusEntry> {
  const map: Record<string, StatusEntry> = {};
  for (const row of rows) {
    map[row.id] = {
      status: row.status,
      timestamp: new Date(row.created_at).getTime(),
    };
  }
  return map;
}

function conversationToSnapshot(
  row: ConversationRow,
  assignees: ConversationAssigneeRow[],
  statuses: ConversationStatusRow[]
): ConversationSnapshot {
  return {
    id: row.id,
    key: row.user_channel_id,
    timestamp: row.last_message_at === null ? NO_TIMESTAMP : new Date(row.last_message_at).getTime(),
    read: row.read,
    enabled: row.enabled,
    status: row.status,
    name: row.name ?? undefined,
    unansweredCount: row.unanswered_count,
    message: buildMessage(row),
    type: row.last_message_type ?? 'text',
    originalId: row.last_original_id ?? '',
    intent: 'NONE',
    assignees: buildAssigneeMap(assignees),
    statuses: buildStatusMap(statuses),
  };
}

export function buildSnapshotFromRow(
  row: ConversationRow,
  assignees: ConversationAssigneeRow[],
  statuses: ConversationStatusRow[]
): ConversationSnapshot {
  return conversationToSnapshot(row, assignees, statuses);
}

export async function buildSnapshots(
  supabase: SupabaseClient,
  conversations: ConversationRow[]
): Promise<ConversationSnapshot[]> {
  if (conversations.length === EMPTY_LENGTH) return [];

  const ids = conversations.map((c) => c.id);
  const [assigneeMap, statusMap] = await Promise.all([
    batchGetAssignees(supabase, ids),
    batchGetStatuses(supabase, ids),
  ]);

  return conversations.map((conv) =>
    conversationToSnapshot(conv, assigneeMap.get(conv.id) ?? [], statusMap.get(conv.id) ?? [])
  );
}
