'use server';

import type {
  AgentSummaryRow,
  DashboardParams,
  ExecutionMessageRow,
  ExecutionSummaryRow,
  NodeVisitRow,
  SessionRow,
  TenantExecutionRow,
  TenantSummaryRow,
  TimeSeriesPoint,
} from '@/app/lib/dashboard';
import {
  deleteSession as deleteSessionLib,
  getAgentSummary as getAgentSummaryLib,
  getDashboardTimeSeries as getDashboardTimeSeriesLib,
  getExecutionsByTenant as getExecutionsByTenantLib,
  getExecutionsForSession as getExecutionsForSessionLib,
  getMessagesForExecution as getMessagesForExecutionLib,
  getNodeVisitsForExecution as getNodeVisitsForExecutionLib,
  getSessionDetail as getSessionDetailLib,
  getSessionsByAgent as getSessionsByAgentLib,
  getTenantSummary as getTenantSummaryLib,
} from '@/app/lib/dashboard';
import { serverError, serverLog } from '@/app/lib/serverLogger';

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
  const res = await getAgentSummaryLib(orgId, params);
  if (res.error !== null) serverError('[fetchAgentSummary] error:', res.error);
  return res;
}

export async function fetchSessionsByAgent(
  orgId: string,
  agentId: string,
  params: DashboardParams
): Promise<PaginatedResult<SessionRow>> {
  serverLog('[fetchSessionsByAgent] orgId:', orgId, 'agentId:', agentId);
  const res = await getSessionsByAgentLib(orgId, agentId, params);
  if (res.error !== null) serverError('[fetchSessionsByAgent] error:', res.error);
  return res;
}

export async function fetchSessionDetail(
  sessionId: string
): Promise<{ session: SessionRow | null; error: string | null }> {
  serverLog('[fetchSessionDetail] sessionId:', sessionId);
  const res = await getSessionDetailLib(sessionId);
  if (res.error !== null) serverError('[fetchSessionDetail] error:', res.error);
  return res;
}

export async function fetchExecutionsForSession(
  sessionId: string
): Promise<{ rows: ExecutionSummaryRow[]; error: string | null }> {
  serverLog('[fetchExecutionsForSession] sessionId:', sessionId);
  const res = await getExecutionsForSessionLib(sessionId);
  if (res.error !== null) serverError('[fetchExecutionsForSession] error:', res.error);
  return res;
}

export async function deleteSessionAction(sessionId: string): Promise<{ error: string | null }> {
  serverLog('[deleteSession] sessionId:', sessionId);
  const res = await deleteSessionLib(sessionId);
  if (res.error !== null) serverError('[deleteSession] error:', res.error);
  return res;
}

export async function fetchNodeVisitsForExecution(
  executionId: string
): Promise<{ rows: NodeVisitRow[]; error: string | null }> {
  serverLog('[fetchNodeVisitsForExecution] executionId:', executionId);
  const res = await getNodeVisitsForExecutionLib(executionId);
  if (res.error !== null) serverError('[fetchNodeVisitsForExecution] error:', res.error);
  return res;
}

export async function fetchMessagesForExecution(
  executionId: string
): Promise<{ rows: ExecutionMessageRow[]; error: string | null }> {
  serverLog('[fetchMessagesForExecution] executionId:', executionId);
  const res = await getMessagesForExecutionLib(executionId);
  if (res.error !== null) serverError('[fetchMessagesForExecution] error:', res.error);
  return res;
}

export async function fetchTenantSummary(
  orgId: string,
  params: DashboardParams
): Promise<PaginatedResult<TenantSummaryRow>> {
  serverLog('[fetchTenantSummary] orgId:', orgId);
  const res = await getTenantSummaryLib(orgId, params);
  if (res.error !== null) serverError('[fetchTenantSummary] error:', res.error);
  return res;
}

export async function fetchExecutionsByTenant(
  orgId: string,
  tenantId: string,
  params: DashboardParams
): Promise<PaginatedResult<TenantExecutionRow>> {
  serverLog('[fetchExecutionsByTenant] orgId:', orgId, 'tenantId:', tenantId);
  const res = await getExecutionsByTenantLib(orgId, tenantId, params);
  if (res.error !== null) serverError('[fetchExecutionsByTenant] error:', res.error);
  return res;
}

export async function fetchDashboardTimeSeries(
  orgId: string
): Promise<{ rows: TimeSeriesPoint[]; error: string | null }> {
  serverLog('[fetchDashboardTimeSeries] orgId:', orgId);
  const res = await getDashboardTimeSeriesLib(orgId);
  if (res.error !== null) serverError('[fetchDashboardTimeSeries] error:', res.error);
  return res;
}
