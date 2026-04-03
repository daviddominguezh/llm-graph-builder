/**
 * Media downloader service.
 *
 * Downloads incoming media from provider APIs and uploads to Supabase Storage.
 * - WhatsApp: GET media URL via Graph API, download binary, upload to Storage
 * - Instagram: attachment URL already present in parsed webhook payload
 */

import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

const WA_GRAPH_API = 'https://graph.facebook.com/v23.0';
const STORAGE_BUCKET = 'message-media';

/* ─── WhatsApp media URL lookup ─── */

interface WhatsAppMediaResponse {
  url?: string;
  mime_type?: string;
  error?: { message: string };
}

function isMediaResponse(data: unknown): data is WhatsAppMediaResponse {
  return data !== null && typeof data === 'object';
}

async function fetchWhatsAppMediaUrl(mediaId: string, accessToken: string): Promise<string> {
  const url = `${WA_GRAPH_API}/${mediaId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`WhatsApp media lookup failed: ${String(response.status)}`);
  }

  const data: unknown = await response.json();
  if (!isMediaResponse(data) || data.url === undefined) {
    throw new Error('WhatsApp media lookup: no URL in response');
  }

  return data.url;
}

/* ─── Download binary from URL ─── */

interface DownloadedMedia {
  buffer: Buffer;
  contentType: string;
}

async function downloadBinary(url: string, accessToken?: string): Promise<DownloadedMedia> {
  const headers: Record<string, string> = {};
  if (accessToken !== undefined) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Media download failed: ${String(response.status)}`);
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

/* ─── Upload to Supabase Storage ─── */

const MIME_EXTENSION_MAP: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'application/octet-stream': 'bin',
};

function extractExtension(contentType: string): string {
  const mimeOnly = contentType.split(';')[0]?.trim() ?? contentType;
  const mapped = MIME_EXTENSION_MAP[mimeOnly];
  if (mapped !== undefined) return mapped;
  return mimeOnly.split('/').pop() ?? 'bin';
}

function buildStoragePath(conversationPrefix: string, contentType: string): string {
  const ext = extractExtension(contentType);
  return `${conversationPrefix}/${randomUUID()}.${ext}`;
}

async function uploadToStorage(
  supabase: SupabaseClient,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });

  if (error !== null) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/* ─── Public API ─── */

/**
 * Download WhatsApp media by ID and upload to Supabase Storage.
 * Returns the public URL of the uploaded file.
 */
export async function downloadWhatsAppMedia(
  supabase: SupabaseClient,
  mediaId: string,
  accessToken: string,
  conversationPrefix: string
): Promise<string> {
  const mediaUrl = await fetchWhatsAppMediaUrl(mediaId, accessToken);
  const { buffer, contentType } = await downloadBinary(mediaUrl, accessToken);
  const storagePath = buildStoragePath(conversationPrefix, contentType);
  return await uploadToStorage(supabase, storagePath, buffer, contentType);
}

/**
 * Download Instagram media from URL and upload to Supabase Storage.
 * Instagram provides the attachment URL directly in the webhook payload.
 * Returns the public URL of the uploaded file.
 */
export async function downloadInstagramMedia(
  supabase: SupabaseClient,
  attachmentUrl: string,
  conversationPrefix: string
): Promise<string> {
  const { buffer, contentType } = await downloadBinary(attachmentUrl);
  const storagePath = buildStoragePath(conversationPrefix, contentType);
  return await uploadToStorage(supabase, storagePath, buffer, contentType);
}
