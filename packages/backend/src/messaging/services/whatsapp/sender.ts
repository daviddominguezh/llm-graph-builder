import { createHash } from 'node:crypto';

import type { ProviderSendResult } from '../../types/index.js';
import { REDIS_KEYS, buildRedisKey } from '../../types/redisKeys.js';
import { readRedis, setWithTTL } from '../redis.js';
import { withRetry } from '../retry.js';

const WA_API_BASE = 'https://graph.facebook.com/v23.0';
const MEDIA_CACHE_TTL_SECONDS = 604_800; // 7 days
const WAMID_PREFIX = 'wamid.';
const EMPTY_LENGTH = 0;

/* ─── API Response types ─── */

interface WhatsAppApiResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

interface WhatsAppMediaUploadResponse {
  id?: string;
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

function isMediaUploadResponse(value: unknown): value is WhatsAppMediaUploadResponse {
  return typeof value === 'object' && value !== null;
}

function toMediaUploadResponse(value: unknown): WhatsAppMediaUploadResponse {
  if (isMediaUploadResponse(value)) return value;
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

/* ─── Media upload (Fix 15, R2-11 cache) ─── */

function buildMediaCacheKey(sourceUrl: string): string {
  const hash = createHash('sha256').update(sourceUrl).digest('hex');
  return buildRedisKey(REDIS_KEYS.MEDIA_UPLOAD_CACHE, hash);
}

async function downloadFileBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

function getFilenameFromContentType(contentType: string): string {
  const extensionMap: Record<string, string> = {
    'image/jpeg': 'file.jpg',
    'image/png': 'file.png',
    'image/webp': 'file.webp',
    'audio/ogg': 'audio.ogg',
    'audio/mpeg': 'audio.mp3',
    'audio/mp4': 'audio.m4a',
    'video/mp4': 'video.mp4',
    'application/pdf': 'document.pdf',
  };
  return extensionMap[contentType] ?? 'file.bin';
}

async function uploadMediaRaw(phoneNumberId: string, accessToken: string, fileUrl: string): Promise<string> {
  const { buffer, contentType } = await downloadFileBuffer(fileUrl);
  const filename = getFilenameFromContentType(contentType);
  const uploadUrl = `${WA_API_BASE}/${phoneNumberId}/media`;

  const blob = new Blob([buffer], { type: contentType });
  const file = new File([blob], filename, { type: contentType });

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', contentType);
  form.append('file', file, filename);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  throwOnHttpError(response);
  const data = toMediaUploadResponse(await response.json());

  if (data.id === undefined || data.id.length === EMPTY_LENGTH) {
    const errDetail = data.error?.message ?? JSON.stringify(data);
    throw new Error(`WhatsApp media upload failed: ${errDetail}`);
  }

  return data.id;
}

async function uploadMediaToWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  fileUrl: string
): Promise<string> {
  const cacheKey = buildMediaCacheKey(fileUrl);
  const cached = await readRedis<string>(cacheKey);
  if (cached !== null) return cached;

  const mediaId = await uploadMediaRaw(phoneNumberId, accessToken, fileUrl);
  await setWithTTL(cacheKey, mediaId, MEDIA_CACHE_TTL_SECONDS);
  return mediaId;
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
      })
  );

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

/* ─── Image message (upload first, then send by ID) ─── */

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
    async () => await uploadMediaToWhatsApp(phoneNumberId, accessToken, imageUrl)
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
      })
  );

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

/* ─── Audio message (upload first, then send by ID) ─── */

export async function sendWhatsAppAudioMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  audioUrl: string
): Promise<ProviderSendResult> {
  const mediaId = await withRetry(
    async () => await uploadMediaToWhatsApp(phoneNumberId, accessToken, audioUrl)
  );

  const result = await withRetry(
    async () =>
      await callWhatsAppApi(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'audio',
        audio: { id: mediaId },
      })
  );

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

/* ─── Document message (upload first, then send by ID) ─── */

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
    async () => await uploadMediaToWhatsApp(phoneNumberId, accessToken, documentUrl)
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
      })
  );

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

/* ─── Typing indicator (Fix 26) ─── */

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
    return; // Cannot send typing without a valid wamid
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
