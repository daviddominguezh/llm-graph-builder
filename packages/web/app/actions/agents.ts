'use server';

import type { AgentRow } from '@/app/lib/agents';
import {
  createAgent as createAgentLib,
  deleteAgent as deleteAgentLib,
  saveStagingKeyId as saveStagingKeyIdLib,
} from '@/app/lib/agents';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';

export async function createAgentAction(
  orgId: string,
  name: string,
  description: string
): Promise<{ agent: AgentRow | null; error: string | null }> {
  serverLog('[createAgentAction] orgId:', orgId, 'name:', name);
  const supabase = await createClient();
  const res = await createAgentLib(supabase, orgId, name, description);
  if (res.error === null) serverLog('[createAgentAction] created agent:', res.agent?.slug);
  else serverError('[createAgentAction] error:', res.error);
  return res;
}

export async function deleteAgentAction(agentId: string): Promise<{ error: string | null }> {
  serverLog('[deleteAgentAction] agentId:', agentId);
  const supabase = await createClient();
  const res = await deleteAgentLib(supabase, agentId);
  if (res.error !== null) serverError('[deleteAgentAction] error:', res.error);
  return res;
}

export async function saveStagingKeyIdAction(
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  serverLog('[saveStagingKeyIdAction] agentId:', agentId, 'keyId:', keyId);
  const supabase = await createClient();
  const res = await saveStagingKeyIdLib(supabase, agentId, keyId);
  if (res.error !== null) serverError('[saveStagingKeyIdAction] error:', res.error);
  return res;
}
