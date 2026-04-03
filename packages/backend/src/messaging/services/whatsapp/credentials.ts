import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import {
  decryptWhatsAppToken,
  getChannelConnection,
  getWhatsAppCredential,
} from '../../queries/channelQueries.js';
import { getCachedCredential, setCachedCredential } from '../credentialCache.js';

export interface WhatsAppSendCredentials {
  accessToken: string;
  phoneNumberId: string;
}

function buildCacheKey(agentId: string, tenantId: string): string {
  return `wa-cred:${agentId}:${tenantId}`;
}

function isWhatsAppCredentials(value: unknown): value is WhatsAppSendCredentials {
  if (value === null || typeof value !== 'object') return false;
  return 'accessToken' in value && 'phoneNumberId' in value;
}

async function fetchFromDb(
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

export async function resolveWhatsAppCredentials(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string
): Promise<WhatsAppSendCredentials> {
  const cacheKey = buildCacheKey(agentId, tenantId);

  // Tier 1 + 2: in-memory -> Redis
  const cached = await getCachedCredential(cacheKey);
  if (isWhatsAppCredentials(cached)) return cached;

  // Tier 3: DB
  const credentials = await fetchFromDb(supabase, agentId, tenantId);
  await setCachedCredential(cacheKey, credentials);
  return credentials;
}
