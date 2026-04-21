import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

export interface WhatsAppConnectionCredentials {
  wabaId: string;
  accessToken: string;
  phoneNumber: string | null;
}

interface CredentialRow {
  id: string;
  waba_id: string;
  phone_number: string | null;
}

interface ConnectionRow {
  id: string;
  tenant_id: string;
  channel_type: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toConnectionRow(value: unknown): ConnectionRow | null {
  if (!isRecord(value)) return null;
  const { id, tenant_id: tenantId, channel_type: channelType } = value;
  if (typeof id !== 'string' || typeof tenantId !== 'string' || typeof channelType !== 'string') {
    return null;
  }
  return { id, tenant_id: tenantId, channel_type: channelType };
}

function toCredentialRow(value: unknown): CredentialRow | null {
  if (!isRecord(value)) return null;
  const { id, waba_id: wabaId, phone_number: phoneNumber } = value;
  if (typeof id !== 'string' || typeof wabaId !== 'string') return null;
  const phone = typeof phoneNumber === 'string' ? phoneNumber : null;
  return { id, waba_id: wabaId, phone_number: phone };
}

async function fetchConnection(
  supabase: SupabaseClient,
  channelConnectionId: string
): Promise<ConnectionRow> {
  const result = await supabase
    .from('channel_connections')
    .select('id, tenant_id, channel_type')
    .eq('id', channelConnectionId)
    .single();

  const row = toConnectionRow(result.data);
  if (row === null) {
    throw new Error('Channel connection not found or access denied');
  }
  if (row.channel_type !== 'whatsapp') {
    throw new Error('Channel connection is not a WhatsApp connection');
  }
  return row;
}

async function fetchCredentialRow(
  supabase: SupabaseClient,
  channelConnectionId: string
): Promise<CredentialRow> {
  const result = await supabase
    .from('whatsapp_credentials')
    .select('id, waba_id, phone_number')
    .eq('channel_connection_id', channelConnectionId)
    .single();

  const row = toCredentialRow(result.data);
  if (row === null) {
    throw new Error('WhatsApp credentials not found for this connection');
  }
  return row;
}

async function decryptToken(supabase: SupabaseClient, credentialId: string): Promise<string> {
  const result = await supabase.rpc('get_whatsapp_access_token', { p_credential_id: credentialId });
  if (result.error !== null || typeof result.data !== 'string') {
    throw new Error('Failed to decrypt WhatsApp access token');
  }
  return result.data;
}

export async function loadConnectionCredentials(
  supabase: SupabaseClient,
  channelConnectionId: string,
  expectedTenantId: string
): Promise<WhatsAppConnectionCredentials> {
  const connection = await fetchConnection(supabase, channelConnectionId);

  if (connection.tenant_id !== expectedTenantId) {
    throw new Error('Channel connection does not belong to this tenant');
  }

  const credential = await fetchCredentialRow(supabase, channelConnectionId);
  const accessToken = await decryptToken(supabase, credential.id);

  return {
    wabaId: credential.waba_id,
    accessToken,
    phoneNumber: credential.phone_number,
  };
}
