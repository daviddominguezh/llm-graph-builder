'use server';

import type { ApiKeyRow } from '@/app/lib/apiKeys';
import {
  createApiKey as createApiKeyLib,
  deleteApiKey as deleteApiKeyLib,
  getApiKeysByOrg as getApiKeysByOrgLib,
} from '@/app/lib/apiKeys';
import { serverError, serverLog } from '@/app/lib/serverLogger';

export async function getApiKeysByOrgAction(
  orgId: string
): Promise<{ result: ApiKeyRow[]; error: string | null }> {
  serverLog('[getApiKeysByOrgAction] orgId:', orgId);
  const res = await getApiKeysByOrgLib(orgId);
  if (res.error === null) serverLog('[getApiKeysByOrgAction] found', res.result.length, 'keys');
  else serverError('[getApiKeysByOrgAction] error:', res.error);
  return res;
}

export async function createApiKeyAction(
  orgId: string,
  name: string,
  keyValue: string
): Promise<{ result: ApiKeyRow | null; error: string | null }> {
  serverLog('[createApiKeyAction] orgId:', orgId, 'name:', name);
  const res = await createApiKeyLib(orgId, name, keyValue);
  if (res.error === null) serverLog('[createApiKeyAction] created key:', res.result?.id);
  else serverError('[createApiKeyAction] error:', res.error);
  return res;
}

export async function deleteApiKeyAction(keyId: string): Promise<{ error: string | null }> {
  serverLog('[deleteApiKeyAction] keyId:', keyId);
  const res = await deleteApiKeyLib(keyId);
  if (res.error !== null) serverError('[deleteApiKeyAction] error:', res.error);
  return res;
}
