import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import {
  decryptWhatsAppToken,
  getChannelConnection,
  getWhatsAppCredential,
} from '../../queries/channelQueries.js';

export interface WhatsAppSendCredentials {
  accessToken: string;
  phoneNumberId: string;
}

export async function resolveWhatsAppCredentials(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string
): Promise<WhatsAppSendCredentials> {
  const connection = await getChannelConnection(supabase, agentId, tenantId, 'whatsapp');
  if (connection === null) {
    throw new Error('No WhatsApp channel connection found');
  }

  const credential = await getWhatsAppCredential(supabase, connection.id);
  if (credential === null) {
    throw new Error('No WhatsApp credentials found');
  }

  const accessToken = await decryptWhatsAppToken(supabase, credential.id);
  return { accessToken, phoneNumberId: credential.phone_number_id };
}
