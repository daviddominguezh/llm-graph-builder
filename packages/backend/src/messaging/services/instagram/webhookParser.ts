import type { IncomingMessage } from '../../types/index.js';

/* ─── Instagram webhook payload types ─── */

interface InstagramMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload: { url: string };
    }>;
    reply_to?: { mid: string };
  };
}

interface InstagramEntry {
  id: string;
  messaging: InstagramMessaging[];
}

interface InstagramWebhookPayload {
  object: string;
  entry: InstagramEntry[];
}

/* ─── Validators ─── */

function isValidPayload(body: unknown): body is InstagramWebhookPayload {
  return typeof body === 'object' && body !== null && 'entry' in body;
}

/* ─── Parse ─── */

export interface ParsedInstagramWebhook {
  igUserId: string;
  messages: IncomingMessage[];
}

const EMPTY_LENGTH = 0;

function parseEvent(event: InstagramMessaging, results: IncomingMessage[]): string {
  const { message, sender, recipient, timestamp } = event;
  if (message === undefined) return '';

  const { id: senderId } = sender;
  const { mid, text, reply_to: replyTo } = message;

  results.push({
    userChannelId: `instagram:${senderId}`,
    channelIdentifier: recipient.id,
    content: text ?? '',
    type: 'text',
    originalId: mid,
    userName: undefined,
    mediaId: undefined,
    replyOriginalId: replyTo?.mid,
    timestamp,
  });

  return recipient.id;
}

function flattenEvents(entries: InstagramEntry[]): InstagramMessaging[] {
  return entries.flatMap((entry) => entry.messaging);
}

function parseEntries(entries: InstagramEntry[], results: IncomingMessage[]): string {
  let igUserId = '';
  for (const event of flattenEvents(entries)) {
    const id = parseEvent(event, results);
    if (id !== '') igUserId = id;
  }
  return igUserId;
}

export function parseInstagramWebhook(body: unknown): ParsedInstagramWebhook | null {
  if (!isValidPayload(body)) return null;

  const results: IncomingMessage[] = [];
  const igUserId = parseEntries(body.entry, results);

  if (results.length === EMPTY_LENGTH) return null;
  return { igUserId, messages: results };
}
