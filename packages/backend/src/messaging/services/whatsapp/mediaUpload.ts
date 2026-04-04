/**
 * WhatsApp media upload with audio conversion and Redis caching.
 */
import { createHash } from 'node:crypto';

import { REDIS_KEYS, buildRedisKey } from '../../types/redisKeys.js';
import { convertAudioToMp3, needsConversion } from '../audioConverter.js';
import { readRedis, setWithTTL } from '../redis.js';

const WA_API_BASE = 'https://graph.facebook.com/v23.0';
const MEDIA_CACHE_TTL_SECONDS = 604_800;
const EMPTY_LENGTH = 0;

/* ─── Response type guard ─── */

interface WhatsAppMediaUploadResponse {
  id?: string;
  error?: { message: string; code: number };
}

function isMediaUploadResponse(value: unknown): value is WhatsAppMediaUploadResponse {
  return typeof value === 'object' && value !== null;
}

function toMediaUploadResponse(value: unknown): WhatsAppMediaUploadResponse {
  if (isMediaUploadResponse(value)) return value;
  return {};
}

/* ─── HTTP error helper ─── */

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

/* ─── Download + filename ─── */

async function downloadFileBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

const EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'file.jpg',
  'image/png': 'file.png',
  'image/webp': 'file.webp',
  'audio/ogg': 'audio.ogg',
  'audio/mpeg': 'audio.mp3',
  'audio/mp4': 'audio.m4a',
  'video/mp4': 'video.mp4',
  'application/pdf': 'document.pdf',
};

function getFilenameFromContentType(contentType: string): string {
  return EXTENSION_MAP[contentType] ?? 'file.bin';
}

/* ─── Audio conversion ─── */

interface PreparedMedia {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

async function prepareAudioBuffer(buffer: Buffer, contentType: string): Promise<PreparedMedia> {
  if (!needsConversion(contentType)) {
    return { buffer, contentType, filename: getFilenameFromContentType(contentType) };
  }

  process.stdout.write(`[wa-sender] Converting audio ${contentType} before upload\n`);
  const converted = await convertAudioToMp3(buffer, contentType);
  return {
    buffer: converted.buffer,
    contentType: converted.mimeType,
    filename: `audio.${converted.extension}`,
  };
}

async function prepareMediaForUpload(buffer: Buffer, contentType: string): Promise<PreparedMedia> {
  if (contentType.startsWith('audio/')) {
    return await prepareAudioBuffer(buffer, contentType);
  }
  return { buffer, contentType, filename: getFilenameFromContentType(contentType) };
}

/* ─── Post to Meta API ─── */

async function postMediaToWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  media: PreparedMedia
): Promise<string> {
  const uploadUrl = `${WA_API_BASE}/${phoneNumberId}/media`;
  const blob = new Blob([media.buffer], { type: media.contentType });
  const file = new File([blob], media.filename, { type: media.contentType });

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', media.contentType);
  form.append('file', file, media.filename);

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

/* ─── Public API ─── */

function buildMediaCacheKey(sourceUrl: string, converted: boolean): string {
  const suffix = converted ? ':converted' : '';
  const hash = createHash('sha256').update(sourceUrl).digest('hex');
  return buildRedisKey(REDIS_KEYS.MEDIA_UPLOAD_CACHE, `${hash}${suffix}`);
}

interface RawUploadResult {
  mediaId: string;
  converted: boolean;
}

async function uploadMediaRaw(
  phoneNumberId: string,
  accessToken: string,
  fileUrl: string
): Promise<RawUploadResult> {
  const { buffer, contentType } = await downloadFileBuffer(fileUrl);
  const wasConverted = contentType.startsWith('audio/') && needsConversion(contentType);
  const media = await prepareMediaForUpload(buffer, contentType);
  const mediaId = await postMediaToWhatsApp(phoneNumberId, accessToken, media);
  return { mediaId, converted: wasConverted };
}

export async function uploadMediaToWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  fileUrl: string
): Promise<string> {
  const originalCacheKey = buildMediaCacheKey(fileUrl, false);
  const cached = await readRedis<string>(originalCacheKey);
  if (cached !== null) return cached;

  const { mediaId, converted } = await uploadMediaRaw(phoneNumberId, accessToken, fileUrl);
  const cacheKey = buildMediaCacheKey(fileUrl, converted);
  await setWithTTL(cacheKey, mediaId, MEDIA_CACHE_TTL_SECONDS);
  return mediaId;
}
