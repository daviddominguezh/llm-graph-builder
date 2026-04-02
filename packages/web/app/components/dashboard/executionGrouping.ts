import type { TenantExecutionRow } from '@/app/lib/dashboard';

export interface SessionGroup {
  key: string;
  agent_name: string;
  version: number;
  channel: string;
  user_id: string;
  session_id: string;
  session_db_id: string;
  lastStatus: string;
  executionCount: number;
  firstExecution: string;
  lastExecution: string;
  executions: TenantExecutionRow[];
}

function buildGroupKey(row: TenantExecutionRow): string {
  return `${row.agent_name}::${String(row.version)}::${row.channel}::${row.user_id}::${row.session_id}`;
}

export function groupExecutions(rows: TenantExecutionRow[]): SessionGroup[] {
  const map = new Map<string, TenantExecutionRow[]>();

  for (const row of rows) {
    const key = buildGroupKey(row);
    const existing = map.get(key);
    if (existing !== undefined) {
      existing.push(row);
    } else {
      map.set(key, [row]);
    }
  }

  const groups: SessionGroup[] = [];

  for (const [key, executions] of map) {
    const sorted = [...executions].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
    const last = sorted[0];
    const first = sorted[sorted.length - 1];

    if (first === undefined || last === undefined) continue;

    groups.push({
      key,
      agent_name: first.agent_name,
      version: first.version,
      channel: first.channel,
      user_id: first.user_id,
      session_id: first.session_id,
      session_db_id: first.session_db_id,
      lastStatus: last.status,
      executionCount: sorted.length,
      firstExecution: first.started_at,
      lastExecution: last.started_at,
      executions: sorted,
    });
  }

  return groups.sort((a, b) => new Date(b.lastExecution).getTime() - new Date(a.lastExecution).getTime());
}
