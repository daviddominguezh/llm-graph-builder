import type { IncomingMessage } from '../../types/index.js';

/* ─── WhatsApp webhook payload types ─── */

interface WhatsAppContact {
  profile?: { name?: string };
  wa_id?: string;
}

interface WhatsAppMessage {
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

interface WhatsAppMetadata {
  phone_number_id: string;
  display_phone_number: string;
}

interface WhatsAppValue {
  messaging_product: string;
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
}

interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

/* ─── Validators ─── */

function hasObjectField(body: object): body is { object: unknown } {
  return 'object' in body;
}

function isValidPayload(body: unknown): body is WhatsAppWebhookPayload {
  if (typeof body !== 'object' || body === null || !('entry' in body)) return false;
  if (!hasObjectField(body) || body.object !== 'whatsapp_business_account') {
    return false;
  }
  return true;
}

/* ─── Content extraction (per type) ─── */

interface ExtractedContent {
  content: string;
  mediaId: string | undefined;
}

const EMPTY_CONTENT: ExtractedContent = { content: '', mediaId: undefined };

function extractText(msg: WhatsAppMessage): ExtractedContent | null {
  if (msg.text === undefined) return null;
  return { content: msg.text.body, mediaId: undefined };
}

function extractImage(msg: WhatsAppMessage): ExtractedContent | null {
  if (msg.image === undefined) return null;
  return { content: msg.image.caption ?? '', mediaId: msg.image.id };
}

function extractAudio(msg: WhatsAppMessage): ExtractedContent | null {
  if (msg.audio === undefined) return null;
  return { content: '', mediaId: msg.audio.id };
}

function extractVideo(msg: WhatsAppMessage): ExtractedContent | null {
  if (msg.video === undefined) return null;
  return { content: msg.video.caption ?? '', mediaId: msg.video.id };
}

function extractDocument(msg: WhatsAppMessage): ExtractedContent | null {
  if (msg.document === undefined) return null;
  return { content: msg.document.caption ?? '', mediaId: msg.document.id };
}

function extractSticker(msg: WhatsAppMessage): ExtractedContent | null {
  if (msg.sticker === undefined) return null;
  return { content: '', mediaId: msg.sticker.id };
}

type ContentExtractor = (msg: WhatsAppMessage) => ExtractedContent | null;

const EXTRACTORS: Record<string, ContentExtractor> = {
  text: extractText,
  image: extractImage,
  audio: extractAudio,
  video: extractVideo,
  document: extractDocument,
  sticker: extractSticker,
};

function extractMessageContent(msg: WhatsAppMessage): ExtractedContent {
  const { type } = msg;
  const { [type]: extractor } = EXTRACTORS;
  if (extractor === undefined) return EMPTY_CONTENT;
  return extractor(msg) ?? EMPTY_CONTENT;
}

/* ─── Type mapping ─── */

const WA_TYPE_MAP: Record<string, string> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
  sticker: 'image',
};

function mapWhatsAppType(waType: string): string {
  return WA_TYPE_MAP[waType] ?? 'text';
}

/* ─── Parse ─── */

export interface ParsedWhatsAppWebhook {
  phoneNumberId: string;
  messages: IncomingMessage[];
}

const SECONDS_TO_MS = 1000;
const EMPTY_LENGTH = 0;

function buildIncomingMessage(
  msg: WhatsAppMessage,
  contacts: WhatsAppContact[],
  phoneNumberId: string
): IncomingMessage {
  const contact = contacts.find((c) => c.wa_id === msg.from);
  const { content, mediaId } = extractMessageContent(msg);
  const timestamp = Number(msg.timestamp) * SECONDS_TO_MS;

  return {
    userChannelId: `whatsapp:+${msg.from}`,
    channelIdentifier: phoneNumberId,
    content,
    type: mapWhatsAppType(msg.type),
    originalId: msg.id,
    userName: contact?.profile?.name,
    mediaId,
    replyOriginalId: msg.context?.message_id,
    timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
  };
}

function parseChange(change: WhatsAppChange, results: IncomingMessage[]): string {
  if (change.field !== 'messages') return '';
  const { value } = change;
  const { contacts: rawContacts, metadata, messages: rawMessages } = value;
  const contacts = rawContacts ?? [];
  const { phone_number_id: phoneNumberId } = metadata;

  for (const msg of rawMessages ?? []) {
    results.push(buildIncomingMessage(msg, contacts, phoneNumberId));
  }

  return phoneNumberId;
}

function flattenChanges(entries: WhatsAppEntry[]): WhatsAppChange[] {
  return entries.flatMap((entry) => entry.changes);
}

function parseEntries(entries: WhatsAppEntry[], results: IncomingMessage[]): string {
  let phoneNumberId = '';
  for (const change of flattenChanges(entries)) {
    const id = parseChange(change, results);
    if (id !== '') phoneNumberId = id;
  }
  return phoneNumberId;
}

export function parseWhatsAppWebhook(body: unknown): ParsedWhatsAppWebhook | null {
  if (!isValidPayload(body)) return null;

  const results: IncomingMessage[] = [];
  const phoneNumberId = parseEntries(body.entry, results);

  if (results.length === EMPTY_LENGTH) return null;
  return { phoneNumberId, messages: results };
}
