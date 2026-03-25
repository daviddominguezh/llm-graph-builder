import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type {
  AgentSummaryRow,
  ExecutionSummaryRow,
  NodeVisitRow,
  PaginatedResult,
  SessionRow,
} from '../../db/queries/dashboardQueries.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                 */
/* ------------------------------------------------------------------ */

type GetAgentSummaryFn = (
  supabase: SupabaseClient,
  orgId: string,
  params: { page: number; pageSize: number }
) => Promise<PaginatedResult<AgentSummaryRow>>;

type GetSessionsByAgentFn = (
  supabase: SupabaseClient,
  orgId: string,
  agentId: string,
  params: { page: number; pageSize: number; sortKey?: string; sortDirection?: string }
) => Promise<PaginatedResult<SessionRow>>;

type GetSessionDetailFn = (
  supabase: SupabaseClient,
  sessionId: string
) => Promise<{ session: SessionRow | null; error: string | null }>;

type GetExecutionsForSessionFn = (
  supabase: SupabaseClient,
  sessionId: string
) => Promise<{ rows: ExecutionSummaryRow[]; error: string | null }>;

type GetNodeVisitsForExecutionFn = (
  supabase: SupabaseClient,
  executionId: string
) => Promise<{ rows: NodeVisitRow[]; error: string | null }>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                  */
/* ------------------------------------------------------------------ */

const mockGetAgentSummary = jest.fn<GetAgentSummaryFn>();
const mockGetSessionsByAgent = jest.fn<GetSessionsByAgentFn>();
const mockGetSessionDetail = jest.fn<GetSessionDetailFn>();
const mockGetExecutionsForSession = jest.fn<GetExecutionsForSessionFn>();
const mockGetNodeVisitsForExecution = jest.fn<GetNodeVisitsForExecutionFn>();

jest.unstable_mockModule('../../db/queries/dashboardQueries.js', () => ({
  getAgentSummary: mockGetAgentSummary,
  getSessionsByAgent: mockGetSessionsByAgent,
  getSessionDetail: mockGetSessionDetail,
  getExecutionsForSession: mockGetExecutionsForSession,
  getNodeVisitsForExecution: mockGetNodeVisitsForExecution,
}));

const { getExecutionHistory, getSessionDetailById, getExecutionTrace } =
  await import('../services/executionIntelService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                            */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const AGENT_SUMMARY: AgentSummaryRow = {
  agent_id: 'agent-1',
  agent_name: 'Test Agent',
  agent_slug: 'test-agent',
  total_executions: 10,
  total_input_tokens: 1000,
  total_output_tokens: 500,
  total_cost: 0.05,
  unique_tenants: 2,
  unique_users: 5,
  unique_sessions: 8,
  last_execution_at: '2024-01-01T00:00:00Z',
};

const SESSION_ROW: SessionRow = {
  id: 'session-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  session_id: 'session-1',
  channel: 'web',
  current_node_id: 'A',
  version: 1,
  model: 'gpt-4',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T01:00:00Z',
  total_input_tokens: 100,
  total_output_tokens: 50,
  total_cost: 0.005,
  has_error: false,
};

const EXECUTION_ROW: ExecutionSummaryRow = {
  id: 'exec-1',
  model: 'gpt-4',
  total_input_tokens: 100,
  total_output_tokens: 50,
  total_cached_tokens: 0,
  total_cost: 0.005,
  total_duration_ms: 1200,
  started_at: '2024-01-01T00:00:00Z',
  completed_at: '2024-01-01T00:00:01Z',
  status: 'completed',
  error: null,
};

const NODE_VISIT: NodeVisitRow = {
  node_id: 'A',
  step_order: 1,
  messages_sent: [],
  response: {},
  input_tokens: 50,
  output_tokens: 25,
  cached_tokens: 0,
  cost: 0.002,
  duration_ms: 600,
  model: 'gpt-4',
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  getExecutionHistory                                                 */
/* ------------------------------------------------------------------ */

describe('getExecutionHistory', () => {
  it('returns agent summary and sessions', async () => {
    mockGetAgentSummary.mockResolvedValue({ rows: [AGENT_SUMMARY], totalCount: 1, error: null });
    mockGetSessionsByAgent.mockResolvedValue({ rows: [SESSION_ROW], totalCount: 1, error: null });

    const result = await getExecutionHistory(buildCtx(), 'agent-1');

    expect(result.summary).toEqual(AGENT_SUMMARY);
    expect(result.sessions.rows).toHaveLength(1);
  });

  it('returns null summary when agent not in result', async () => {
    mockGetAgentSummary.mockResolvedValue({ rows: [], totalCount: 0, error: null });
    mockGetSessionsByAgent.mockResolvedValue({ rows: [], totalCount: 0, error: null });

    const result = await getExecutionHistory(buildCtx(), 'agent-unknown');

    expect(result.summary).toBeNull();
  });

  it('respects custom limit for sessions', async () => {
    const customLimit = 5;
    mockGetAgentSummary.mockResolvedValue({ rows: [], totalCount: 0, error: null });
    mockGetSessionsByAgent.mockResolvedValue({ rows: [], totalCount: 0, error: null });

    await getExecutionHistory(buildCtx(), 'agent-1', customLimit);

    const call = mockGetSessionsByAgent.mock.calls[0];
    expect(call).toBeDefined();
    expect(call?.[1]).toBe('org-1');
    expect(call?.[2]).toBe('agent-1');
    expect(call?.[3]).toMatchObject({ pageSize: customLimit });
  });
});

/* ------------------------------------------------------------------ */
/*  getSessionDetailById                                                */
/* ------------------------------------------------------------------ */

describe('getSessionDetailById', () => {
  it('returns session and executions', async () => {
    mockGetSessionDetail.mockResolvedValue({ session: SESSION_ROW, error: null });
    mockGetExecutionsForSession.mockResolvedValue({ rows: [EXECUTION_ROW], error: null });

    const result = await getSessionDetailById(buildCtx(), 'session-1');

    expect(result.session).toEqual(SESSION_ROW);
    expect(result.executions).toHaveLength(1);
  });

  it('throws when session detail returns error', async () => {
    mockGetSessionDetail.mockResolvedValue({ session: null, error: 'Session not found' });

    await expect(getSessionDetailById(buildCtx(), 'missing')).rejects.toThrow('Session error');
  });

  it('throws when executions query returns error', async () => {
    mockGetSessionDetail.mockResolvedValue({ session: SESSION_ROW, error: null });
    mockGetExecutionsForSession.mockResolvedValue({ rows: [], error: 'DB error' });

    await expect(getSessionDetailById(buildCtx(), 'session-1')).rejects.toThrow('Executions error');
  });
});

/* ------------------------------------------------------------------ */
/*  getExecutionTrace                                                   */
/* ------------------------------------------------------------------ */

describe('getExecutionTrace', () => {
  it('returns execution trace with node visits', async () => {
    mockGetNodeVisitsForExecution.mockResolvedValue({ rows: [NODE_VISIT], error: null });

    const result = await getExecutionTrace(buildCtx(), 'exec-1');

    expect(result.executionId).toBe('exec-1');
    expect(result.nodeVisits).toHaveLength(1);
    expect(result.nodeVisits[0]?.node_id).toBe('A');
  });

  it('throws when node visits query returns error', async () => {
    mockGetNodeVisitsForExecution.mockResolvedValue({ rows: [], error: 'DB error' });

    await expect(getExecutionTrace(buildCtx(), 'exec-missing')).rejects.toThrow('Execution trace error');
  });

  it('returns empty node visits for execution with no visits', async () => {
    mockGetNodeVisitsForExecution.mockResolvedValue({ rows: [], error: null });

    const result = await getExecutionTrace(buildCtx(), 'exec-empty');

    expect(result.nodeVisits).toEqual([]);
  });
});
