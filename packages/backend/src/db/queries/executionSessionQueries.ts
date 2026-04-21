import type { SupabaseClient } from './operationHelpers.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export interface SessionRow {
  id: string;
  agent_id: string;
  version: number;
  tenant_id: string;
  user_id: string;
  session_id: string;
  channel: string;
  model: string;
  current_node_id: string;
  structured_outputs: Record<string, unknown[]>;
  created_at: string;
  updated_at: string;
}

interface GetOrCreateSessionParams {
  agentId: string;
  orgId: string;
  version: number;
  tenantId: string;
  userId: string;
  sessionId: string;
  channel: string;
  model: string;
}

export interface SessionResult {
  session: SessionRow | null;
  isNew: boolean;
  locked?: boolean;
}

const INITIAL_NODE = 'INITIAL_STEP';
const LOCK_ERROR_CODE = '55P03';
const NOT_FOUND_CODE = 'PGRST116';
const FIRST_INDEX = 0;
const isSessionRow = (v: unknown): v is SessionRow => typeof v === 'object' && v !== null;

async function tryLockExistingSession(
  supabase: SupabaseClient,
  params: GetOrCreateSessionParams
): Promise<SessionResult | null> {
  const result: QueryResult<SessionRow> = await supabase.rpc('lock_session_for_update', {
    p_agent_id: params.agentId,
    p_version: params.version,
    p_tenant_id: params.tenantId,
    p_user_id: params.userId,
    p_session_id: params.sessionId,
    p_channel: params.channel,
  });

  if (result.error !== null) {
    if (result.error.code === LOCK_ERROR_CODE) {
      return { session: null, isNew: false, locked: true };
    }
    if (result.error.code === NOT_FOUND_CODE) return null;
    throw new Error(`tryLockExistingSession: ${result.error.message}`);
  }

  const rows = result.data as unknown;
  if (!Array.isArray(rows) || rows.length === FIRST_INDEX) return null;
  const firstRow: unknown = rows[FIRST_INDEX];
  if (!isSessionRow(firstRow)) return null;
  return { session: firstRow, isNew: false };
}

async function insertNewSession(
  supabase: SupabaseClient,
  params: GetOrCreateSessionParams
): Promise<SessionRow> {
  const result: QueryResult<SessionRow> = await supabase
    .from('agent_sessions')
    .insert({
      agent_id: params.agentId,
      org_id: params.orgId,
      version: params.version,
      tenant_id: params.tenantId,
      user_id: params.userId,
      session_id: params.sessionId,
      channel: params.channel,
      model: params.model,
      current_node_id: INITIAL_NODE,
      structured_outputs: {},
    })
    .select()
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`insertNewSession: ${result.error?.message ?? 'No data returned'}`);
  }

  return result.data;
}

export async function getOrCreateSession(
  supabase: SupabaseClient,
  params: GetOrCreateSessionParams
): Promise<SessionResult> {
  const existing = await tryLockExistingSession(supabase, params);
  if (existing !== null) return existing;

  const session = await insertNewSession(supabase, params);
  return { session, isNew: true };
}
