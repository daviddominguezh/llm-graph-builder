'use server';

import type { AgentRow } from '@/app/lib/agents';
import {
  createAgent as createAgentLib,
  deleteAgent as deleteAgentLib,
  publishAgent as publishAgentLib,
  saveStagingKeyId as saveStagingKeyIdLib,
  saveStaging as saveStagingLib,
} from '@/app/lib/agents';
import { createClient } from '@/app/lib/supabase/server';
import type { Graph } from '@/app/schemas/graph.schema';

export async function createAgentAction(
  orgId: string,
  name: string,
  description: string
): Promise<{ agent: AgentRow | null; error: string | null }> {
  const supabase = await createClient();
  return await createAgentLib(supabase, orgId, name, description);
}

export async function deleteAgentAction(agentId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  return await deleteAgentLib(supabase, agentId);
}

export async function saveStagingAction(
  agentId: string,
  graphData: Graph
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  return await saveStagingLib(supabase, agentId, graphData);
}

export async function saveStagingKeyIdAction(
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  return await saveStagingKeyIdLib(supabase, agentId, keyId);
}

export async function publishAgentAction(
  agentId: string
): Promise<{ version: number | null; error: string | null }> {
  const supabase = await createClient();
  return await publishAgentLib(supabase, agentId);
}
