'use server';

import { createClient } from '@/app/lib/supabase/server';

interface OAuthConnectionRow {
  connected_by: string;
  expires_at: string | null;
}

export async function getOAuthConnectionStatus(
  orgId: string,
  libraryItemId: string
): Promise<{ connected: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('mcp_oauth_connections')
    .select('connected_by, expires_at')
    .eq('org_id', orgId)
    .eq('library_item_id', libraryItemId)
    .single<OAuthConnectionRow>();

  return { connected: data !== null };
}
