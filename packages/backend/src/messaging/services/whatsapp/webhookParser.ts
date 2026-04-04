import type { IncomingMessage } from '../../types/index.js';
import type {
  HistoricMessage,
  MessageEchoValue,
  ParsedEchoMessage,
  ParsedWhatsAppWebhook,
  WhatsAppChange,
  WhatsAppContact,
  WhatsAppEntry,
  WhatsAppMessage,
  WhatsAppValue,
  WhatsAppWebhookPayload,
} from './webhookTypes.js';
import { EMPTY_LENGTH, SECONDS_TO_MS, mapWhatsAppType } from './webhookTypes.js';

export type { HistoricMessage, ParsedEchoMessage, ParsedWhatsAppWebhook } from './webhookTypes.js';

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

type ContentExtractor = (msg: WhatsAppMessage) => ExtractedContent | null;

const EXTRACTORS: Record<string, ContentExtractor> = {
  text: (msg) => (msg.text === undefined ? null : { content: msg.text.body, mediaId: undefined }),
  image: (msg) =>
    msg.image === undefined ? null : { content: msg.image.caption ?? '', mediaId: msg.image.id },
  audio: (msg) => (msg.audio === undefined ? null : { content: '', mediaId: msg.audio.id }),
  video: (msg) =>
    msg.video === undefined ? null : { content: msg.video.caption ?? '', mediaId: msg.video.id },
  document: (msg) =>
    msg.document === undefined ? null : { content: msg.document.caption ?? '', mediaId: msg.document.id },
  sticker: (msg) => (msg.sticker === undefined ? null : { content: '', mediaId: msg.sticker.id }),
};

function extractMessageContent(msg: WhatsAppMessage): ExtractedContent {
  const { [msg.type]: extractor } = EXTRACTORS;
  if (extractor === undefined) return EMPTY_CONTENT;
  return extractor(msg) ?? EMPTY_CONTENT;
}

/* ─── Incoming message builder ─── */

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

/* ─── Echo message builders ─── */

type EchoContentExtractor = (msg: HistoricMessage) => string;

const ECHO_EXTRACTORS: Record<string, EchoContentExtractor> = {
  text: (msg) => msg.text?.body ?? '',
  image: (msg) => msg.image?.caption ?? '[image]',
  video: (msg) => msg.video?.caption ?? '[video]',
  document: (msg) => msg.document?.caption ?? '[document]',
  audio: () => '[audio]',
  sticker: () => '[sticker]',
};

type EchoMediaExtractor = (msg: HistoricMessage) => string | undefined;

const ECHO_MEDIA_EXTRACTORS: Record<string, EchoMediaExtractor> = {
  image: (msg) => msg.image?.id,
  audio: (msg) => msg.audio?.id,
  video: (msg) => msg.video?.id,
  document: (msg) => msg.document?.id,
  sticker: (msg) => msg.sticker?.id,
};

function buildEchoMessage(msg: HistoricMessage, phoneNumberId: string): ParsedEchoMessage {
  const { [msg.type]: contentExtractor } = ECHO_EXTRACTORS;
  const { [msg.type]: mediaExtractor } = ECHO_MEDIA_EXTRACTORS;
  const timestamp = Number(msg.timestamp) * SECONDS_TO_MS;

  return {
    userChannelId: `whatsapp:+${msg.to}`,
    channelIdentifier: phoneNumberId,
    content: contentExtractor === undefined ? '' : contentExtractor(msg),
    type: mapWhatsAppType(msg.type),
    originalId: msg.id,
    mediaId: mediaExtractor === undefined ? undefined : mediaExtractor(msg),
    timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
  };
}

/* ─── Change parsers ─── */

function isMessageEchoValue(value: WhatsAppValue | MessageEchoValue): value is MessageEchoValue {
  return 'message_echoes' in value;
}

interface ParseChangeResult {
  phoneNumberId: string;
}

function parseMessagesChange(value: WhatsAppValue, results: IncomingMessage[]): ParseChangeResult {
  const { contacts: rawContacts, metadata, messages: rawMessages } = value;
  const contacts = rawContacts ?? [];
  const { phone_number_id: phoneNumberId } = metadata;

  if (phoneNumberId === '') {
    process.stdout.write('[webhookParser] Empty phoneNumberId in messages change, skipping\n');
    return { phoneNumberId };
  }

  for (const msg of rawMessages ?? []) {
    results.push(buildIncomingMessage(msg, contacts, phoneNumberId));
  }
  return { phoneNumberId };
}

function parseEchoChange(value: MessageEchoValue, echoResults: ParsedEchoMessage[]): ParseChangeResult {
  const { metadata, message_echoes: echoes } = value;
  const { phone_number_id: phoneNumberId } = metadata;
  for (const msg of echoes) {
    echoResults.push(buildEchoMessage(msg, phoneNumberId));
  }
  return { phoneNumberId };
}

/* ─── Entry processing ─── */

interface ParseAccumulator {
  messages: IncomingMessage[];
  echoMessages: ParsedEchoMessage[];
  phoneNumberId: string;
}

function resolvePhoneNumberId(change: WhatsAppChange, acc: ParseAccumulator): string {
  if (change.field === 'history') return acc.phoneNumberId;

  if (change.field === 'smb_message_echoes' && isMessageEchoValue(change.value)) {
    const { phoneNumberId } = parseEchoChange(change.value, acc.echoMessages);
    return phoneNumberId === '' ? acc.phoneNumberId : phoneNumberId;
  }

  if (change.field === 'messages') {
    const { phoneNumberId } = parseMessagesChange(change.value as WhatsAppValue, acc.messages);
    return phoneNumberId === '' ? acc.phoneNumberId : phoneNumberId;
  }

  return acc.phoneNumberId;
}

function flattenChanges(entries: WhatsAppEntry[]): WhatsAppChange[] {
  return entries.flatMap((entry) => entry.changes);
}

function parseEntries(entries: WhatsAppEntry[]): ParseAccumulator {
  let acc: ParseAccumulator = { messages: [], echoMessages: [], phoneNumberId: '' };
  for (const change of flattenChanges(entries)) {
    acc = { ...acc, phoneNumberId: resolvePhoneNumberId(change, acc) };
  }
  return acc;
}

export function parseWhatsAppWebhook(body: unknown): ParsedWhatsAppWebhook | null {
  if (!isValidPayload(body)) return null;

  const acc = parseEntries(body.entry);
  const hasContent = acc.messages.length > EMPTY_LENGTH || acc.echoMessages.length > EMPTY_LENGTH;
  if (!hasContent) return null;

  return { phoneNumberId: acc.phoneNumberId, messages: acc.messages, echoMessages: acc.echoMessages };
}
