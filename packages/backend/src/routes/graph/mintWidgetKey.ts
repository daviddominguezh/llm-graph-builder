import { randomBytes } from 'node:crypto';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  type AgentWidgetInfo,
  getAgentWidgetInfo,
  setExecutionKeyValue,
  updateAgentWidgetKeyId,
} from '../../db/queries/widgetKeyQueries.js';
import { hashToken } from '../../utils/hashToken.js';

/* ------------------------------------------------------------------ */
/*  Mint a widget execution key for an agent if it doesn't have one.   */
/*                                                                      */
/*  Called from postPublish after a successful publish. Idempotent:     */
/*  if the agent already has `widget_execution_key_id`, returns early.  */
/*  The raw token never leaves this function — it's stored encrypted    */
/*  via `set_execution_key_value` so the Next.js proxy can retrieve it  */
/*  server-side and inject it as `Authorization: Bearer <token>`.       */
/* ------------------------------------------------------------------ */

const TOKEN_BYTES = 32;
const PREFIX_START = 0;
const PREFIX_LENGTH = 8;
const WIDGET_KEY_NAME = 'Widget key';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractInsertedId(row: unknown): string | null {
  if (!isRecord(row)) return null;
  const { id } = row;
  return typeof id === 'string' ? id : null;
}

function generateWidgetToken(): { token: string; hash: string; prefix: string } {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  return {
    token,
    hash: hashToken(token),
    prefix: token.slice(PREFIX_START, PREFIX_LENGTH),
  };
}

interface KeyInsertArgs {
  supabase: SupabaseClient;
  orgId: string;
  hash: string;
  prefix: string;
}

async function insertWidgetExecutionKey(
  args: KeyInsertArgs
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await args.supabase
    .from('agent_execution_keys')
    .insert({
      org_id: args.orgId,
      name: WIDGET_KEY_NAME,
      key_hash: args.hash,
      key_prefix: args.prefix,
      all_agents: false,
    })
    .select('id')
    .single();
  if (error !== null) return { id: null, error: error.message };
  const id = extractInsertedId(data);
  if (id === null) return { id: null, error: 'Invalid insert response' };
  return { id, error: null };
}

async function insertKeyAgentJunction(
  supabase: SupabaseClient,
  keyId: string,
  agentId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_execution_key_agents')
    .insert({ key_id: keyId, agent_id: agentId });
  if (error !== null) return { error: error.message };
  return { error: null };
}

async function rollbackKey(supabase: SupabaseClient, keyId: string): Promise<void> {
  await supabase.from('agent_execution_keys').delete().eq('id', keyId);
}

async function storeAndLinkToken(
  supabase: SupabaseClient,
  keyId: string,
  agentId: string,
  token: string
): Promise<{ error: string | null }> {
  const setResult = await setExecutionKeyValue(supabase, keyId, token);
  if (setResult.error !== null) {
    await rollbackKey(supabase, keyId);
    return setResult;
  }
  const junction = await insertKeyAgentJunction(supabase, keyId, agentId);
  if (junction.error !== null) {
    await rollbackKey(supabase, keyId);
    return junction;
  }
  const update = await updateAgentWidgetKeyId(supabase, agentId, keyId);
  if (update.error !== null) {
    await rollbackKey(supabase, keyId);
    return update;
  }
  return { error: null };
}

async function mintWidgetKeyForAgent(
  supabase: SupabaseClient,
  info: AgentWidgetInfo
): Promise<{ keyId: string | null; error: string | null }> {
  const { token, hash, prefix } = generateWidgetToken();
  const insert = await insertWidgetExecutionKey({
    supabase,
    orgId: info.orgId,
    hash,
    prefix,
  });
  if (insert.error !== null || insert.id === null) {
    return { keyId: null, error: insert.error ?? 'Failed to insert widget key' };
  }
  const result = await storeAndLinkToken(supabase, insert.id, info.agentId, token);
  if (result.error !== null) return { keyId: null, error: result.error };
  return { keyId: insert.id, error: null };
}

export async function ensureWidgetKey(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ keyId: string | null; error: string | null }> {
  const info = await getAgentWidgetInfo(supabase, agentId);
  if (info.error !== null || info.result === null) {
    return { keyId: null, error: info.error ?? 'Agent not found' };
  }
  if (info.result.widgetExecutionKeyId !== null) {
    return { keyId: info.result.widgetExecutionKeyId, error: null };
  }
  return await mintWidgetKeyForAgent(supabase, info.result);
}
