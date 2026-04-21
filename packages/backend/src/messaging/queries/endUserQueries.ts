import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { EndUserRow } from '../types/index.js';
import type { QueryResult } from './queryHelpers.js';

export async function getEndUser(
  supabase: SupabaseClient,
  tenantId: string,
  userChannelId: string
): Promise<EndUserRow | null> {
  const result: QueryResult<EndUserRow> = await supabase
    .from('end_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_channel_id', userChannelId)
    .single();

  return result.data ?? null;
}

export async function upsertEndUser(
  supabase: SupabaseClient,
  tenantId: string,
  userChannelId: string,
  name?: string
): Promise<EndUserRow> {
  const result: QueryResult<EndUserRow> = await supabase
    .from('end_users')
    .upsert(
      { tenant_id: tenantId, user_channel_id: userChannelId, name: name ?? null },
      { onConflict: 'tenant_id,user_channel_id' }
    )
    .select('*')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`upsertEndUser: ${result.error?.message ?? 'No data returned'}`);
  }

  return result.data;
}
