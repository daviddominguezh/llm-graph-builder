import type { createClient } from '@supabase/supabase-js';

import {
  getAgentSummary,
  getExecutionsForSession,
  getNodeVisitsForExecution,
  getSessionDetail,
  getSessionsByAgent,
} from '../../db/queries/dashboardQueries.js';
import type {
  AgentSummaryRow,
  ExecutionSummaryRow,
  NodeVisitRow,
  PaginatedResult,
  SessionRow,
} from '../../db/queries/dashboardQueries.js';
import type { ServiceContext } from '../types.js';

type DashboardClient = ReturnType<typeof createClient>;

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface ExecutionHistory {
  summary: AgentSummaryRow | null;
  sessions: PaginatedResult<SessionRow>;
}

export interface SessionDetail {
  session: SessionRow | null;
  executions: ExecutionSummaryRow[];
}

export interface ExecutionTrace {
  executionId: string;
  nodeVisits: NodeVisitRow[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_LIMIT = 20;
const DEFAULT_PAGE = 0;

/* ------------------------------------------------------------------ */
/*  getExecutionHistory                                                 */
/* ------------------------------------------------------------------ */

export async function getExecutionHistory(
  ctx: ServiceContext,
  agentId: string,
  limit = DEFAULT_LIMIT
): Promise<ExecutionHistory> {
  const client = ctx.supabase as unknown as DashboardClient;
  const summaryResult = await getAgentSummary(client, ctx.orgId, {
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_LIMIT,
  });

  const summary = summaryResult.rows.find((r) => r.agent_id === agentId) ?? null;

  const sessions = await getSessionsByAgent(client, ctx.orgId, agentId, {
    page: DEFAULT_PAGE,
    pageSize: limit,
    sortKey: 'updated_at',
    sortDirection: 'desc',
  });

  return { summary, sessions };
}

/* ------------------------------------------------------------------ */
/*  getSessionDetail                                                    */
/* ------------------------------------------------------------------ */

export async function getSessionDetailById(
  ctx: ServiceContext,
  sessionId: string
): Promise<SessionDetail> {
  const client = ctx.supabase as unknown as DashboardClient;
  const { session, error } = await getSessionDetail(client, sessionId);
  if (error !== null) throw new Error(`Session error: ${error}`);

  const executionsResult = await getExecutionsForSession(client, sessionId);
  if (executionsResult.error !== null) {
    throw new Error(`Executions error: ${executionsResult.error}`);
  }

  return { session, executions: executionsResult.rows };
}

/* ------------------------------------------------------------------ */
/*  getExecutionTrace                                                   */
/* ------------------------------------------------------------------ */

export async function getExecutionTrace(
  ctx: ServiceContext,
  executionId: string
): Promise<ExecutionTrace> {
  const client = ctx.supabase as unknown as DashboardClient;
  const { rows, error } = await getNodeVisitsForExecution(client, executionId);
  if (error !== null) throw new Error(`Execution trace error: ${error}`);
  return { executionId, nodeVisits: rows };
}
