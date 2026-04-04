/**
 * Helpers for the WhatsApp integration route.
 *
 * Handles validation, tenant lookups, Meta API orchestration,
 * and database persistence for channel connections + credentials.
 */
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { throwOnMutationError } from '../../db/queries/operationHelpers.js';
import { getChannelConnectionByIdentifier } from '../queries/channelQueries.js';
import {
  exchangeAuthCodeForToken,
  isOnWhatsAppBusinessApp,
  registerPhoneWithCloudApi,
  registerWebhookSubscription,
  requestWhatsAppSynchronization,
} from '../services/whatsapp/metaApi.js';

/* ─── Types ─── */

export interface WhatsAppIntegrationBody {
  phone: string;
  phoneNumberId: string;
  waba: string;
  authCode: string;
  agentId: string;
}

export interface IntegrationResult {
  phone: string;
  isOnApp: boolean;
  historySyncBatchId: string | null;
}

/* ─── Validation ─── */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseIntegrationBody(body: unknown): WhatsAppIntegrationBody | null {
  if (!isRecord(body)) return null;
  const { phone, phoneNumberId, waba, authCode, agentId } = body;

  if (!isNonEmptyString(phone)) return null;
  if (!isNonEmptyString(phoneNumberId)) return null;
  if (!isNonEmptyString(waba)) return null;
  if (!isNonEmptyString(authCode)) return null;
  if (!isNonEmptyString(agentId)) return null;

  return { phone, phoneNumberId, waba, authCode, agentId };
}

/* ─── Duplicate check ─── */

async function isPhoneNumberIdRegistered(
  supabase: SupabaseClient,
  phoneNumberId: string
): Promise<boolean> {
  const existing = await getChannelConnectionByIdentifier(supabase, phoneNumberId);
  return existing !== null;
}

const SINGLE_ROW = 1;
const EMPTY_LENGTH = 0;

async function isE164PhoneRegistered(supabase: SupabaseClient, phone: string): Promise<boolean> {
  const result = await supabase
    .from('whatsapp_credentials')
    .select('id')
    .eq('phone_number', phone)
    .limit(SINGLE_ROW);
  const rows: unknown = result.data;
  return Array.isArray(rows) && rows.length > EMPTY_LENGTH;
}

export async function isPhoneAlreadyRegistered(
  supabase: SupabaseClient,
  phoneNumberId: string,
  phone: string
): Promise<boolean> {
  const [byId, byPhone] = await Promise.all([
    isPhoneNumberIdRegistered(supabase, phoneNumberId),
    isE164PhoneRegistered(supabase, phone),
  ]);
  return byId || byPhone;
}

/* ─── Tenant → org_id lookup ─── */

function extractOrgId(data: unknown): string {
  if (!isRecord(data)) throw new Error('Tenant not found');
  const orgId: unknown = data.org_id;
  if (typeof orgId !== 'string') throw new Error('Tenant not found');
  return orgId;
}

export async function getOrgIdFromTenant(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const result: { data: unknown; error: { message: string } | null } = await supabase
    .from('tenants')
    .select('org_id')
    .eq('id', tenantId)
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error('Tenant not found');
  }

  return extractOrgId(result.data);
}

/* ─── Meta API orchestration ─── */

export async function performMetaOnboarding(
  body: WhatsAppIntegrationBody
): Promise<{ accessToken: string; isOnApp: boolean }> {
  const accessToken = await exchangeAuthCodeForToken(body.authCode);

  const isOnApp = await isOnWhatsAppBusinessApp(accessToken, body.phoneNumberId);

  if (isOnApp) {
    // Phone is on WhatsApp Business app — request co-existence sync.
    // Sync contacts/state first, then history.
    // History sync webhooks will arrive but we return 200 without processing.
    const stateSyncId = await requestWhatsAppSynchronization(accessToken, body.phoneNumberId, 'smb_app_state_sync');
    if (stateSyncId === null) throw new Error('WhatsApp state sync request failed');

    const historySyncId = await requestWhatsAppSynchronization(accessToken, body.phoneNumberId, 'history');
    if (historySyncId === null) throw new Error('WhatsApp history sync request failed');
  } else {
    // Phone not on app — register directly with Cloud API.
    await registerPhoneWithCloudApi(accessToken, body.phoneNumberId);
  }

  await registerWebhookSubscription(accessToken, body.waba);
  return { accessToken, isOnApp };
}

/* ─── Insert channel connection ─── */

export async function insertChannelConnection(
  supabase: SupabaseClient,
  orgId: string,
  body: WhatsAppIntegrationBody,
  tenantId: string
): Promise<string> {
  const result = await supabase
    .from('channel_connections')
    .insert({
      org_id: orgId,
      agent_id: body.agentId,
      tenant_id: tenantId,
      channel_type: 'whatsapp',
      channel_identifier: body.phoneNumberId,
    })
    .select('id')
    .single();

  throwOnMutationError(result, 'insertChannelConnection');

  const row: unknown = result.data;
  if (!isRecord(row)) throw new Error('Failed to insert channel connection');
  if (typeof row.id !== 'string') throw new Error('Missing channel connection id');
  return row.id;
}

/* ─── Insert encrypted credentials ─── */

export async function insertWhatsAppCredentials(
  supabase: SupabaseClient,
  connectionId: string,
  accessToken: string,
  body: WhatsAppIntegrationBody
): Promise<void> {
  // Encrypt the access token using the DB-side encrypt_secret RPC
  const encryptResult = await supabase.rpc('encrypt_secret', { plaintext: accessToken });

  if (encryptResult.error !== null) {
    throw new Error(`encrypt_secret failed: ${encryptResult.error.message}`);
  }

  const encrypted: unknown = encryptResult.data;

  const result = await supabase.from('whatsapp_credentials').insert({
    channel_connection_id: connectionId,
    encrypted_access_token: encrypted,
    phone_number_id: body.phoneNumberId,
    waba_id: body.waba,
    phone_number: body.phone,
  });

  throwOnMutationError(result, 'insertWhatsAppCredentials');
}

/* ─── Delete connection + credentials ─── */

export async function deleteWhatsAppConnection(
  supabase: SupabaseClient,
  connectionId: string
): Promise<void> {
  // whatsapp_credentials has ON DELETE CASCADE, so deleting the
  // connection automatically removes the credential row.
  const result = await supabase.from('channel_connections').delete().eq('id', connectionId);
  throwOnMutationError(result, 'deleteWhatsAppConnection');
}
