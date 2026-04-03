/**
 * Media enrichment for incoming messages (R2-1, R2-2).
 *
 * Downloads media from provider APIs and uploads to Supabase Storage.
 * Sets placeholder content for audio messages pending transcription.
 */
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { downloadInstagramMedia, downloadWhatsAppMedia } from '../services/mediaDownloader.js';
import { resolveWhatsAppCredentials } from '../services/whatsapp/credentials.js';
import type { ChannelConnectionRow, IncomingMessage } from '../types/index.js';
import { detectChannel } from './providerRouter.js';

/* ─── Types ─── */

export interface EnrichedMessage {
  content: string;
  mediaUrl: string | undefined;
}

/* ─── WhatsApp media download ─── */

async function downloadMediaForWhatsApp(
  supabase: SupabaseClient,
  connection: ChannelConnectionRow,
  mediaId: string,
  conversationPrefix: string
): Promise<string> {
  const creds = await resolveWhatsAppCredentials(supabase, connection.agent_id, connection.tenant_id);
  return await downloadWhatsAppMedia(supabase, mediaId, creds.accessToken, conversationPrefix);
}

/* ─── Instagram media download ─── */

async function downloadMediaForInstagram(
  supabase: SupabaseClient,
  mediaId: string,
  conversationPrefix: string
): Promise<string> {
  // Instagram: mediaId is already the attachment URL from the webhook payload
  return await downloadInstagramMedia(supabase, mediaId, conversationPrefix);
}

/* ─── Try download (swallow errors) ─── */

async function tryDownloadMedia(
  supabase: SupabaseClient,
  connection: ChannelConnectionRow,
  incoming: IncomingMessage
): Promise<string | undefined> {
  if (incoming.mediaId === undefined) return undefined;

  const prefix = `${connection.tenant_id}/${incoming.userChannelId}`;
  const channel = detectChannel(incoming.userChannelId);

  try {
    if (channel === 'whatsapp') {
      return await downloadMediaForWhatsApp(supabase, connection, incoming.mediaId, prefix);
    }
    if (channel === 'instagram') {
      return await downloadMediaForInstagram(supabase, incoming.mediaId, prefix);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stdout.write(`[messaging] Media download failed: ${msg}\n`);
  }

  return undefined;
}

/* ─── Content enrichment ─── */

function enrichContent(incoming: IncomingMessage): string {
  // R2-2: Audio transcription placeholder
  // TODO: Implement transcription matching closer-back's transcribeAudioStep
  if (incoming.type === 'audio' && incoming.content === '') {
    return '[Audio message]';
  }
  return incoming.content;
}

/* ─── Public API ─── */

export async function enrichIncomingMessage(
  supabase: SupabaseClient,
  connection: ChannelConnectionRow,
  incoming: IncomingMessage
): Promise<EnrichedMessage> {
  const mediaUrl = await tryDownloadMedia(supabase, connection, incoming);
  const content = enrichContent(incoming);
  return { content, mediaUrl };
}
