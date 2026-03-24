'use server';

import type {
  AgentSummaryRow,
  DashboardParams,
  ExecutionSummaryRow,
  NodeVisitRow,
  SessionRow,
} from '@/app/lib/dashboard';
import {
  deleteSession as deleteSessionLib,
  getAgentSummary as getAgentSummaryLib,
  getExecutionsForSession as getExecutionsForSessionLib,
  getNodeVisitsForExecution as getNodeVisitsForExecutionLib,
  getSessionDetail as getSessionDetailLib,
  getSessionsByAgent as getSessionsByAgentLib,
} from '@/app/lib/dashboard';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';

interface PaginatedResult<T> {
  rows: T[];
  totalCount: number;
  error: string | null;
}

export async function fetchAgentSummary(
  orgId: string,
  params: DashboardParams
): Promise<PaginatedResult<AgentSummaryRow>> {
  serverLog('[fetchAgentSummary] orgId:', orgId);
  const supabase = await createClient();
  const res = await getAgentSummaryLib(supabase, orgId, params);
  if (res.error !== null) serverError('[fetchAgentSummary] error:', res.error);
  return res;
}

export async function fetchSessionsByAgent(
  orgId: string,
  agentId: string,
  params: DashboardParams
): Promise<PaginatedResult<SessionRow>> {
  serverLog('[fetchSessionsByAgent] orgId:', orgId, 'agentId:', agentId);
  const supabase = await createClient();
  const res = await getSessionsByAgentLib(supabase, orgId, agentId, params);
  if (res.error !== null) serverError('[fetchSessionsByAgent] error:', res.error);
  return res;
}

export async function fetchSessionDetail(
  sessionId: string
): Promise<{ session: SessionRow | null; error: string | null }> {
  serverLog('[fetchSessionDetail] sessionId:', sessionId);
  const supabase = await createClient();
  const res = await getSessionDetailLib(supabase, sessionId);
  if (res.error !== null) serverError('[fetchSessionDetail] error:', res.error);
  return res;
}

export async function fetchExecutionsForSession(
  sessionId: string
): Promise<{ rows: ExecutionSummaryRow[]; error: string | null }> {
  serverLog('[fetchExecutionsForSession] sessionId:', sessionId);
  const supabase = await createClient();
  const res = await getExecutionsForSessionLib(supabase, sessionId);
  if (res.error !== null) serverError('[fetchExecutionsForSession] error:', res.error);
  return res;
}

export async function deleteSessionAction(sessionId: string): Promise<{ error: string | null }> {
  serverLog('[deleteSession] sessionId:', sessionId);
  const supabase = await createClient();
  const res = await deleteSessionLib(supabase, sessionId);
  if (res.error !== null) serverError('[deleteSession] error:', res.error);
  return res;
}

export async function fetchNodeVisitsForExecution(
  executionId: string
): Promise<{ rows: NodeVisitRow[]; error: string | null }> {
  serverLog('[fetchNodeVisitsForExecution] executionId:', executionId);
  const supabase = await createClient();
  const res = await getNodeVisitsForExecutionLib(supabase, executionId);
  if (res.error !== null) serverError('[fetchNodeVisitsForExecution] error:', res.error);
  return res;
}
