'use server';

import type { ApiKeyRow } from '@/app/lib/api-keys';
import {
  createApiKey as createApiKeyLib,
  deleteApiKey as deleteApiKeyLib,
  getApiKeysByOrg as getApiKeysByOrgLib,
} from '@/app/lib/api-keys';
import { createClient } from '@/app/lib/supabase/server';

export async function getApiKeysByOrgAction(
  orgId: string
): Promise<{ result: ApiKeyRow[]; error: string | null }> {
  const supabase = await createClient();
  return await getApiKeysByOrgLib(supabase, orgId);
}

export async function createApiKeyAction(
  orgId: string,
  name: string,
  keyValue: string
): Promise<{ result: ApiKeyRow | null; error: string | null }> {
  const supabase = await createClient();
  return await createApiKeyLib(supabase, orgId, name, keyValue);
}

export async function deleteApiKeyAction(keyId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  return await deleteApiKeyLib(supabase, keyId);
}
