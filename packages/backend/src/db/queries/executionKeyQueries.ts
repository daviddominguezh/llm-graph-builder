import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExecutionKeyRow {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  all_agents: boolean;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ExecutionKeyAgent {
  agent_id: string;
  agent_name: string;
  agent_slug: string;
}

export interface CreateExecutionKeyResult {
  key: ExecutionKeyRow;
  fullKey: string;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isExecutionKeyRow(value: unknown): value is ExecutionKeyRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'key_prefix' in value;
}

export function isExecutionKeyAgent(value: unknown): value is ExecutionKeyAgent {
  return typeof value === 'object' && value !== null && 'agent_id' in value && 'agent_name' in value;
}

interface AgentJoinRow {
  agent_id: string;
  agents: { name: string; slug: string } | null;
}

function isAgentJoinRow(value: unknown): value is AgentJoinRow {
  return typeof value === 'object' && value !== null && 'agent_id' in value && 'agents' in value;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const EXECUTION_KEY_COLUMNS =
  'id, org_id, name, key_prefix, all_agents, expires_at, created_at, last_used_at';
const KEY_PREFIX = 'clr_';
const KEY_BYTES = 48;
const DISPLAY_PREFIX_LENGTH = 12;
const SLICE_START = 0;

export function mapExecutionKeyRows(data: unknown[]): ExecutionKeyRow[] {
  return data.reduce<ExecutionKeyRow[]>((acc, row) => {
    if (isExecutionKeyRow(row)) acc.push(row);
    return acc;
  }, []);
}

function mapAgentJoinRows(data: unknown[]): ExecutionKeyAgent[] {
  return data.reduce<ExecutionKeyAgent[]>((acc, row) => {
    if (!isAgentJoinRow(row)) return acc;
    const { agents } = row;
    if (agents === null) return acc;
    acc.push({ agent_id: row.agent_id, agent_name: agents.name, agent_slug: agents.slug });
    return acc;
  }, []);
}

export function generateExecutionKey(): { fullKey: string; keyHash: string; keyPrefix: string } {
  const randomPart = randomBytes(KEY_BYTES).toString('base64url');
  const fullKey = `${KEY_PREFIX}${randomPart}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = `${fullKey.slice(SLICE_START, DISPLAY_PREFIX_LENGTH)}...`;
  return { fullKey, keyHash, keyPrefix };
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function getExecutionKeysByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: ExecutionKeyRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_keys')
    .select(EXECUTION_KEY_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapExecutionKeyRows(rows), error: null };
}

export async function getAgentsForKey(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ result: ExecutionKeyAgent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_key_agents')
    .select('agent_id, agents(name, slug)')
    .eq('key_id', keyId);

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapAgentJoinRows(rows), error: null };
}
