import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type {
  AgentSummaryRow,
  ExecutionSummaryRow,
  NodeVisitRow,
  PaginatedResult,
  SessionRow,
} from '../../db/queries/dashboardQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
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
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const TOTAL_EXECUTIONS = 10;
const INPUT_TOKENS_LARGE = 1000;
const OUTPUT_TOKENS_LARGE = 500;
const COST_LARGE = 0.05;
const UNIQUE_TENANTS = 2;
const UNIQUE_USERS = 5;
const UNIQUE_SESSIONS = 8;
const VERSION_ONE = 1;
const INPUT_TOKENS_SMALL = 100;
const OUTPUT_TOKENS_SMALL = 50;
const COST_SMALL = 0.005;
const DURATION_MS_LARGE = 1200;
const STEP_ORDER_FIRST = 1;
const INPUT_TOKENS_VISIT = 50;
const OUTPUT_TOKENS_VISIT = 25;
const CACHED_TOKENS_ZERO = 0;
const COST_VISIT = 0.002;
const DURATION_MS_VISIT = 600;
const COUNT_ONE = 1;
const COUNT_ZERO = 0;
const CUSTOM_LIMIT = 5;
const FIRST_ITEM = 0;

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
  total_executions: TOTAL_EXECUTIONS,
  total_input_tokens: INPUT_TOKENS_LARGE,
  total_output_tokens: OUTPUT_TOKENS_LARGE,
  total_cost: COST_LARGE,
  unique_tenants: UNIQUE_TENANTS,
  unique_users: UNIQUE_USERS,
  unique_sessions: UNIQUE_SESSIONS,
  last_execution_at: '2024-01-01T00:00:00Z',
};

const SESSION_ROW: SessionRow = {
  id: 'session-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  session_id: 'session-1',
  channel: 'web',
  current_node_id: 'A',
  version: VERSION_ONE,
  model: 'gpt-4',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T01:00:00Z',
  total_input_tokens: INPUT_TOKENS_SMALL,
  total_output_tokens: OUTPUT_TOKENS_SMALL,
  total_cost: COST_SMALL,
  has_error: false,
};

const EXECUTION_ROW: ExecutionSummaryRow = {
  id: 'exec-1',
  model: 'gpt-4',
  total_input_tokens: INPUT_TOKENS_SMALL,
  total_output_tokens: OUTPUT_TOKENS_SMALL,
  total_cached_tokens: CACHED_TOKENS_ZERO,
  total_cost: COST_SMALL,
  total_duration_ms: DURATION_MS_LARGE,
  started_at: '2024-01-01T00:00:00Z',
  completed_at: '2024-01-01T00:00:01Z',
  status: 'completed',
  error: null,
};

const NODE_VISIT: NodeVisitRow = {
  node_id: 'A',
  step_order: STEP_ORDER_FIRST,
  messages_sent: [],
  response: {},
  input_tokens: INPUT_TOKENS_VISIT,
  output_tokens: OUTPUT_TOKENS_VISIT,
  cached_tokens: CACHED_TOKENS_ZERO,
  cost: COST_VISIT,
  duration_ms: DURATION_MS_VISIT,
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
    mockGetAgentSummary.mockResolvedValue({ rows: [AGENT_SUMMARY], totalCount: COUNT_ONE, error: null });
    mockGetSessionsByAgent.mockResolvedValue({ rows: [SESSION_ROW], totalCount: COUNT_ONE, error: null });

    const result = await getExecutionHistory(buildCtx(), 'agent-1');

    expect(result.summary).toEqual(AGENT_SUMMARY);
    expect(result.sessions.rows).toHaveLength(COUNT_ONE);
  });

  it('returns null summary when agent not in result', async () => {
    mockGetAgentSummary.mockResolvedValue({ rows: [], totalCount: COUNT_ZERO, error: null });
    mockGetSessionsByAgent.mockResolvedValue({ rows: [], totalCount: COUNT_ZERO, error: null });

    const result = await getExecutionHistory(buildCtx(), 'agent-unknown');

    expect(result.summary).toBeNull();
  });

  it('respects custom limit for sessions', async () => {
    const ctx = buildCtx();
    const customLimit = CUSTOM_LIMIT;
    mockGetAgentSummary.mockResolvedValue({ rows: [], totalCount: COUNT_ZERO, error: null });
    mockGetSessionsByAgent.mockResolvedValue({ rows: [], totalCount: COUNT_ZERO, error: null });

    await getExecutionHistory(ctx, 'agent-1', customLimit);

    expect(mockGetSessionsByAgent).toHaveBeenCalledWith(
      ctx.supabase,
      'org-1',
      'agent-1',
      expect.objectContaining({ pageSize: customLimit })
    );
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
    expect(result.executions).toHaveLength(COUNT_ONE);
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
    expect(result.nodeVisits).toHaveLength(COUNT_ONE);
    expect(result.nodeVisits[FIRST_ITEM]?.node_id).toBe('A');
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
