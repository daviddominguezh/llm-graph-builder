/**
 * Meta Graph API client for WhatsApp Business onboarding.
 *
 * Handles OAuth token exchange, phone registration with Cloud API,
 * WhatsApp Business app detection, and WABA webhook subscriptions.
 */

/* ─── Constants ─── */

const FB_URL_VERSION = 'v23.0';
const GRAPH_BASE = `https://graph.facebook.com/${FB_URL_VERSION}`;

const FB_APP_ID = process.env.FB_APP_ID ?? '';
const FB_APP_SECRET = process.env.FB_APP_SECRET ?? '';
const FB_APP_PIN = process.env.FB_APP_PIN ?? '777777';

const HTTP_OK = 200;

/* ─── Type Guards ─── */

interface AccessTokenPayload {
  access_token: string;
}

interface PhoneInfoPayload {
  is_on_biz_app?: boolean;
}

interface RegisterPayload {
  success?: boolean;
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasAccessToken(value: unknown): value is AccessTokenPayload {
  if (!isRecord(value)) return false;
  return typeof value.access_token === 'string' && value.access_token !== '';
}

function toPhoneInfo(value: unknown): PhoneInfoPayload {
  if (!isRecord(value)) return {};
  return { is_on_biz_app: value.is_on_biz_app === true };
}

function toRegisterResult(value: unknown): RegisterPayload {
  if (!isRecord(value)) return {};
  return { success: value.success === true, error: value.error };
}

/* ─── Token Exchange ─── */

export async function exchangeAuthCodeForToken(authCode: string): Promise<string> {
  const params = `client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&code=${authCode}`;
  const url = `${GRAPH_BASE}/oauth/access_token?${params}`;

  const res = await fetch(url);
  const data: unknown = await res.json();

  if (!hasAccessToken(data)) {
    throw new Error('Failed to exchange access token');
  }

  return data.access_token;
}

/* ─── Business App Check ─── */

export async function isOnWhatsAppBusinessApp(accessToken: string, phoneNumberId: string): Promise<boolean> {
  const url = `${GRAPH_BASE}/${phoneNumberId}?fields=is_on_biz_app,platform_type`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = toPhoneInfo(await res.json());
  return data.is_on_biz_app === true;
}

/* ─── Phone Registration ─── */

export async function registerPhoneWithCloudApi(
  accessToken: string,
  phoneNumberId: string
): Promise<boolean> {
  const url = `${GRAPH_BASE}/${phoneNumberId}/register?messaging_product=whatsapp&pin=${FB_APP_PIN}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = toRegisterResult(await res.json());

  if (data.success !== true) {
    throw new Error(`Error registering phone with Cloud API: ${JSON.stringify(data.error ?? 'unknown')}`);
  }

  return true;
}

/* ─── WhatsApp Business App Synchronization ─── */

/**
 * Request synchronization from WhatsApp Business app.
 * Called when the phone is already on the WhatsApp Business app (co-existence mode).
 *
 * Two sync types:
 * - 'smb_app_state_sync': sync contacts/state from the app
 * - 'history': sync message history from the app
 *
 * We call both during onboarding. The history sync webhooks will arrive
 * but we return 200 without processing them (history import is not implemented).
 */
export async function requestWhatsAppSynchronization(
  accessToken: string,
  phoneNumberId: string,
  syncType: 'smb_app_state_sync' | 'history'
): Promise<string | null> {
  const url = `${GRAPH_BASE}/${phoneNumberId}/smb_app_data`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      sync_type: syncType,
    }),
  });

  const data: unknown = await res.json();

  if (!isRecord(data)) return null;

  // The API returns a request_id on success
  const { request_id: requestId } = data;
  return typeof requestId === 'string' ? requestId : null;
}

/* ─── Webhook Subscription ─── */

export async function registerWebhookSubscription(accessToken: string, wabaId: string): Promise<boolean> {
  const url = `${GRAPH_BASE}/${wabaId}/subscribed_apps`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: 'follow',
  });

  await res.json();

  if (res.status !== HTTP_OK) {
    throw new Error(`Webhook subscription failed with status ${String(res.status)}`);
  }

  return true;
}
