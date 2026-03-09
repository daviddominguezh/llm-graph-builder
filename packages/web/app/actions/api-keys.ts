'use server';

import type { ApiKeyRow } from '@/app/lib/api-keys';
import {
  createApiKey as createApiKeyLib,
  deleteApiKey as deleteApiKeyLib,
  getApiKeysByOrg as getApiKeysByOrgLib,
} from '@/app/lib/api-keys';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';

export async function getApiKeysByOrgAction(
  orgId: string
): Promise<{ result: ApiKeyRow[]; error: string | null }> {
  serverLog('[getApiKeysByOrgAction] orgId:', orgId);
  const supabase = await createClient();
  const res = await getApiKeysByOrgLib(supabase, orgId);
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
  const supabase = await createClient();
  const res = await createApiKeyLib(supabase, orgId, name, keyValue);
  if (res.error === null) serverLog('[createApiKeyAction] created key:', res.result?.id);
  else serverError('[createApiKeyAction] error:', res.error);
  return res;
}

export async function deleteApiKeyAction(keyId: string): Promise<{ error: string | null }> {
  serverLog('[deleteApiKeyAction] keyId:', keyId);
  const supabase = await createClient();
  const res = await deleteApiKeyLib(supabase, keyId);
  if (res.error !== null) serverError('[deleteApiKeyAction] error:', res.error);
  return res;
}
