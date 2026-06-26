'use server';

import type {
  McpTenantConfigBundle,
  McpTenantDiscoveryRow,
  McpTenantStatusBundle,
  SaveCellArgs,
  SaveCellResult,
} from '@/app/lib/mcpTenantConfig';
import {
  getMcpTenantConfig as getMcpTenantConfigLib,
  getMcpTenantStatus as getMcpTenantStatusLib,
  saveMcpTenantCell as saveMcpTenantCellLib,
  verifyMcpTenantServer as verifyMcpTenantServerLib,
  verifyMcpTenantTenant as verifyMcpTenantTenantLib,
} from '@/app/lib/mcpTenantConfig';
import { serverError, serverLog } from '@/app/lib/serverLogger';

export async function getMcpTenantConfigAction(
  agentId: string
): Promise<{ result: McpTenantConfigBundle | null; error: string | null }> {
  serverLog('[getMcpTenantConfigAction] agentId:', agentId);
  const res = await getMcpTenantConfigLib(agentId);
  if (res.error !== null) serverError('[getMcpTenantConfigAction] error:', res.error);
  return res;
}

export async function getMcpTenantStatusAction(
  agentId: string
): Promise<{ result: McpTenantStatusBundle | null; error: string | null }> {
  serverLog('[getMcpTenantStatusAction] agentId:', agentId);
  const res = await getMcpTenantStatusLib(agentId);
  if (res.error !== null) serverError('[getMcpTenantStatusAction] error:', res.error);
  return res;
}

export async function saveMcpTenantCellAction(args: SaveCellArgs): Promise<SaveCellResult> {
  serverLog('[saveMcpTenantCellAction] agentId:', args.agentId, 'serverId:', args.serverId);
  const res = await saveMcpTenantCellLib(args);
  if (res.kind === 'error') serverError('[saveMcpTenantCellAction] error:', res.error);
  else if (res.kind === 'conflict') serverLog('[saveMcpTenantCellAction] conflict');
  return res;
}

export async function verifyMcpTenantServerAction(
  agentId: string,
  serverId: string
): Promise<{ result: McpTenantDiscoveryRow[]; error: string | null }> {
  serverLog('[verifyMcpTenantServerAction] agentId:', agentId, 'serverId:', serverId);
  const res = await verifyMcpTenantServerLib(agentId, serverId);
  if (res.error !== null) serverError('[verifyMcpTenantServerAction] error:', res.error);
  return res;
}

export async function verifyMcpTenantTenantAction(
  agentId: string,
  serverId: string,
  tenantId: string
): Promise<{ result: McpTenantDiscoveryRow | null; error: string | null }> {
  serverLog('[verifyMcpTenantTenantAction] agentId:', agentId, 'serverId:', serverId, 'tenantId:', tenantId);
  const res = await verifyMcpTenantTenantLib(agentId, serverId, tenantId);
  if (res.error !== null) serverError('[verifyMcpTenantTenantAction] error:', res.error);
  return res;
}
