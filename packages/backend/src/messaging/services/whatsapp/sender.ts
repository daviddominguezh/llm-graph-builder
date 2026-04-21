import type { ProviderSendResult } from '../../types/index.js';
import { isRetryableError, withRetry } from '../retry.js';
import { uploadMediaToWhatsApp } from './mediaUpload.js';

const WA_API_BASE = 'https://graph.facebook.com/v23.0';
const WAMID_PREFIX = 'wamid.';

/** Only retry network errors + 5xx; skip 4xx. */
const WA_RETRY_OPTS = { shouldRetry: isRetryableError };

/* ─── API Response types ─── */

interface WhatsAppApiResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

/* ─── Type guards ─── */

function isApiResponse(value: unknown): value is WhatsAppApiResponse {
  return typeof value === 'object' && value !== null;
}

function toWhatsAppApiResponse(value: unknown): WhatsAppApiResponse {
  if (isApiResponse(value)) return value;
  return {};
}

/* ─── Helpers ─── */

const FIRST_INDEX = 0;

function extractOriginalId(result: WhatsAppApiResponse): string {
  const firstMessage = result.messages?.[FIRST_INDEX];
  return firstMessage?.id ?? '';
}

function throwOnApiError(result: WhatsAppApiResponse): void {
  if (result.error !== undefined) {
    throw new Error(`WhatsApp API error: ${result.error.message}`);
  }
}

interface ErrorWithStatusCode extends Error {
  statusCode?: number;
}

function throwOnHttpError(response: Response): void {
  if (!response.ok) {
    const { status } = response;
    const err = new Error(`WhatsApp API HTTP ${String(status)}`) as ErrorWithStatusCode;
    err.statusCode = status;
    throw err;
  }
}

async function callWhatsAppApi(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<WhatsAppApiResponse> {
  const url = `${WA_API_BASE}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  throwOnHttpError(response);
  const data: unknown = await response.json();
  return toWhatsAppApiResponse(data);
}

/* ─── Text message ─── */

export async function sendWhatsAppTextMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  text: string
): Promise<ProviderSendResult> {
  const result = await withRetry(
    async () =>
      await callWhatsAppApi(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { body: text },
      }),
    WA_RETRY_OPTS
  );

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

/* ─── Image message ─── */

interface SendImageParams {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  imageUrl: string;
  caption?: string;
}

export async function sendWhatsAppImageMessage(params: SendImageParams): Promise<ProviderSendResult> {
  const { phoneNumberId, accessToken, recipientPhone, imageUrl, caption } = params;
  const mediaId = await withRetry(
    async () => await uploadMediaToWhatsApp(phoneNumberId, accessToken, imageUrl),
    WA_RETRY_OPTS
  );

  const imagePayload: Record<string, string> = { id: mediaId };
  if (caption !== undefined) imagePayload.caption = caption;

  const result = await withRetry(
    async () =>
      await callWhatsAppApi(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'image',
        image: imagePayload,
      }),
    WA_RETRY_OPTS
  );

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

/* ─── Audio message ─── */

export async function sendWhatsAppAudioMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  audioUrl: string
): Promise<ProviderSendResult> {
  const mediaId = await withRetry(
    async () => await uploadMediaToWhatsApp(phoneNumberId, accessToken, audioUrl),
    WA_RETRY_OPTS
  );

  const result = await withRetry(
    async () =>
      await callWhatsAppApi(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'audio',
        audio: { id: mediaId },
      }),
    WA_RETRY_OPTS
  );

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

/* ─── Document message ─── */

interface SendDocumentParams {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  documentUrl: string;
  filename?: string;
}

export async function sendWhatsAppDocumentMessage(params: SendDocumentParams): Promise<ProviderSendResult> {
  const { phoneNumberId, accessToken, recipientPhone, documentUrl, filename } = params;
  const mediaId = await withRetry(
    async () => await uploadMediaToWhatsApp(phoneNumberId, accessToken, documentUrl),
    WA_RETRY_OPTS
  );

  const docPayload: Record<string, string> = { id: mediaId };
  if (filename !== undefined) docPayload.filename = filename;

  const result = await withRetry(
    async () =>
      await callWhatsAppApi(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'document',
        document: docPayload,
      }),
    WA_RETRY_OPTS
  );

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

/**
 * Send WhatsApp typing indicator.
 *
 * WhatsApp does not have a dedicated "typing" API. Instead, closer-back marks
 * the last received message as "read" with a `typing_indicator` hint, which
 * shows the blue ticks and triggers a brief typing animation on the client.
 *
 * Requires a valid wamid (WhatsApp message ID) from the last user message.
 */
export async function sendWhatsAppTypingIndicator(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  lastMessageId?: string
): Promise<void> {
  if (lastMessageId?.startsWith(WAMID_PREFIX) !== true) {
    return;
  }

  try {
    await callWhatsAppApi(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      status: 'read',
      message_id: lastMessageId,
      typing_indicator: { type: 'text' },
    });
  } catch {
    // Typing indicator is non-critical; swallow errors
  }
}
