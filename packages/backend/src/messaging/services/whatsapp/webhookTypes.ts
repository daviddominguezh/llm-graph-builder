import type { IncomingMessage } from '../../types/index.js';

/* ─── WhatsApp webhook payload types ─── */

export interface WhatsAppContact {
  profile?: { name?: string };
  wa_id?: string;
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  audio?: { id: string };
  video?: { id: string; caption?: string };
  document?: { id: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type: string };
  context?: { message_id: string };
}

export interface WhatsAppMetadata {
  phone_number_id: string;
  display_phone_number: string;
}

export interface WhatsAppValue {
  messaging_product: string;
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
}

/* ─── Echo (SMB message echo) types ─── */

export interface HistoricMessage {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker';
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type: string };
}

export interface MessageEchoValue {
  messaging_product: string;
  metadata: WhatsAppMetadata;
  message_echoes: HistoricMessage[];
}

/* ─── Shared change / entry / payload ─── */

export interface WhatsAppChange {
  value: WhatsAppValue | MessageEchoValue;
  field: string;
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

/* ─── Parsed output types ─── */

export interface ParsedEchoMessage {
  userChannelId: string;
  channelIdentifier: string;
  content: string;
  type: string;
  originalId: string;
  mediaId: string | undefined;
  timestamp: number;
}

export interface ParsedWhatsAppWebhook {
  phoneNumberId: string;
  messages: IncomingMessage[];
  echoMessages: ParsedEchoMessage[];
}

/* ─── Type mapping (shared between messages and echoes) ─── */

const WA_TYPE_MAP: Record<string, string> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
  sticker: 'image',
};

export function mapWhatsAppType(waType: string): string {
  return WA_TYPE_MAP[waType] ?? 'text';
}

export const SECONDS_TO_MS = 1000;
export const EMPTY_LENGTH = 0;
