'use server';

import type { AgentRow, CreateAgentParams } from '@/app/lib/agents';
import {
  createAgent as createAgentLib,
  deleteAgent as deleteAgentLib,
  saveProductionKeyId as saveProductionKeyIdLib,
  saveStagingKeyId as saveStagingKeyIdLib,
} from '@/app/lib/agents';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { revalidatePath } from 'next/cache';

export async function createAgentAction(
  params: CreateAgentParams
): Promise<{ agent: AgentRow | null; error: string | null }> {
  serverLog('[createAgentAction] orgId:', params.orgId, 'name:', params.name);
  const res = await createAgentLib(params);
  if (res.error === null) {
    serverLog('[createAgentAction] created agent:', res.agent?.slug);
    revalidatePath('/orgs/[slug]', 'layout');
  } else {
    serverError('[createAgentAction] error:', res.error);
  }
  return res;
}

export async function deleteAgentAction(agentId: string): Promise<{ error: string | null }> {
  serverLog('[deleteAgentAction] agentId:', agentId);
  const res = await deleteAgentLib(agentId);
  if (res.error === null) {
    revalidatePath('/orgs/[slug]', 'layout');
  } else {
    serverError('[deleteAgentAction] error:', res.error);
  }
  return res;
}

export async function saveStagingKeyIdAction(
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  serverLog('[saveStagingKeyIdAction] agentId:', agentId, 'keyId:', keyId);
  const res = await saveStagingKeyIdLib(agentId, keyId);
  if (res.error !== null) serverError('[saveStagingKeyIdAction] error:', res.error);
  return res;
}

export async function saveProductionKeyIdAction(
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  serverLog('[saveProductionKeyIdAction] agentId:', agentId, 'keyId:', keyId);
  const res = await saveProductionKeyIdLib(agentId, keyId);
  if (res.error !== null) serverError('[saveProductionKeyIdAction] error:', res.error);
  return res;
}
