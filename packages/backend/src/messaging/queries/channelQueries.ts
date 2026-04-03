import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type {
  ChannelConnectionRow,
  InstagramCredentialRow,
  WhatsAppCredentialRow,
} from '../types/index.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/* ─── Channel connection lookups ─── */

export async function getChannelConnection(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string,
  channelType: string
): Promise<ChannelConnectionRow | null> {
  const result: QueryResult<ChannelConnectionRow> = await supabase
    .from('channel_connections')
    .select('*')
    .eq('agent_id', agentId)
    .eq('tenant_id', tenantId)
    .eq('channel_type', channelType)
    .single();

  return result.data;
}

export async function getChannelConnectionByIdentifier(
  supabase: SupabaseClient,
  channelIdentifier: string
): Promise<ChannelConnectionRow | null> {
  const result: QueryResult<ChannelConnectionRow> = await supabase
    .from('channel_connections')
    .select('*')
    .eq('channel_identifier', channelIdentifier)
    .single();

  return result.data;
}

/* ─── WhatsApp credentials ─── */

export async function getWhatsAppCredential(
  supabase: SupabaseClient,
  connectionId: string
): Promise<WhatsAppCredentialRow | null> {
  const result: QueryResult<WhatsAppCredentialRow> = await supabase
    .from('whatsapp_credentials')
    .select('*')
    .eq('channel_connection_id', connectionId)
    .single();

  return result.data;
}

export async function decryptWhatsAppToken(
  supabase: SupabaseClient,
  credentialId: string
): Promise<string> {
  const result = await supabase.rpc('get_whatsapp_access_token', {
    p_credential_id: credentialId,
  });

  if (result.error !== null) {
    throw new Error(`decryptWhatsAppToken: ${result.error.message}`);
  }

  return result.data as string;
}

/* ─── Instagram credentials ─── */

export async function getInstagramCredential(
  supabase: SupabaseClient,
  connectionId: string
): Promise<InstagramCredentialRow | null> {
  const result: QueryResult<InstagramCredentialRow> = await supabase
    .from('instagram_credentials')
    .select('*')
    .eq('channel_connection_id', connectionId)
    .single();

  return result.data;
}

export async function decryptInstagramToken(
  supabase: SupabaseClient,
  credentialId: string
): Promise<string> {
  const result = await supabase.rpc('get_instagram_access_token', {
    p_credential_id: credentialId,
  });

  if (result.error !== null) {
    throw new Error(`decryptInstagramToken: ${result.error.message}`);
  }

  return result.data as string;
}
