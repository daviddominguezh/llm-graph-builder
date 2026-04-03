import type { IncomingMessage } from '../../types/index.js';

/* ─── Instagram webhook payload types ─── */

interface StoryReplyTo {
  link: string;
  id: string;
}

interface InstagramMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    is_echo?: boolean;
    text?: string;
    attachments?: Array<{
      type: string;
      payload: { url: string };
    }>;
    reply_to?: { mid: string };
    story?: { reply_to: StoryReplyTo };
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
  if (typeof body !== 'object' || body === null || !('entry' in body)) return false;
  if (!('object' in body) || (body as InstagramWebhookPayload).object !== 'instagram') return false;
  return true;
}

/* ─── Attachment type mapping ─── */

const MEDIA_TYPE_MAP: Record<string, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'document',
  share: 'image',
  ig_post: 'image',
  reel: 'video',
  ig_reel: 'video',
  story_mention: 'image',
};

function mapAttachmentType(igType: string): string | undefined {
  return MEDIA_TYPE_MAP[igType];
}

/* ─── Parse ─── */

export interface ParsedInstagramWebhook {
  igUserId: string;
  messages: IncomingMessage[];
}

const EMPTY_LENGTH = 0;
const FIRST_ATTACHMENT = 0;

function isEchoMessage(event: InstagramMessaging): boolean {
  return event.message?.is_echo === true;
}

function parseAttachment(event: InstagramMessaging, results: IncomingMessage[]): string {
  const { message, sender, recipient, timestamp } = event;
  if (message === undefined) return '';

  const attachments = message.attachments;
  if (attachments === undefined || attachments.length === EMPTY_LENGTH) return '';

  const attachment = attachments[FIRST_ATTACHMENT];
  if (attachment === undefined) return '';

  const mappedType = mapAttachmentType(attachment.type);
  const messageType = mappedType ?? 'text';
  const mediaUrl = attachment.payload.url;

  results.push({
    userChannelId: `instagram:${sender.id}`,
    channelIdentifier: recipient.id,
    content: mediaUrl,
    type: messageType,
    originalId: message.mid,
    userName: undefined, // TODO: Fetch sender username later in processing pipeline
    mediaId: mediaUrl,
    replyOriginalId: message.reply_to?.mid,
    timestamp,
  });

  return recipient.id;
}

function parseTextMessage(event: InstagramMessaging, results: IncomingMessage[]): string {
  const { message, sender, recipient, timestamp } = event;
  if (message === undefined) return '';

  results.push({
    userChannelId: `instagram:${sender.id}`,
    channelIdentifier: recipient.id,
    content: message.text ?? '',
    type: 'text',
    originalId: message.mid,
    userName: undefined, // TODO: Fetch sender username later in processing pipeline
    mediaId: undefined,
    replyOriginalId: message.reply_to?.mid,
    timestamp,
  });

  return recipient.id;
}

function parseStoryReply(event: InstagramMessaging, results: IncomingMessage[]): string {
  const { message, sender, recipient, timestamp } = event;
  const storyReply = message?.story?.reply_to;
  if (storyReply === undefined) return '';

  results.push({
    userChannelId: `instagram:${sender.id}`,
    channelIdentifier: recipient.id,
    content: storyReply.link,
    type: 'image',
    originalId: message?.mid ?? storyReply.id,
    userName: undefined,
    mediaId: storyReply.link,
    replyOriginalId: undefined,
    timestamp,
  });

  return recipient.id;
}

function parseEvent(event: InstagramMessaging, results: IncomingMessage[]): string {
  const { message } = event;
  if (message === undefined) return '';

  // Handle story replies (message.story.reply_to field)
  if (message.story?.reply_to !== undefined) {
    return parseStoryReply(event, results);
  }

  // Fix 19: Filter out echo messages (messages sent by the business page)
  if (isEchoMessage(event)) return '';

  // Handle attachments (image/video/audio/file/share/reel/ig_post/story_mention)
  const hasAttachments = message.attachments !== undefined && message.attachments.length > EMPTY_LENGTH;
  if (hasAttachments) {
    return parseAttachment(event, results);
  }

  // Handle text messages
  return parseTextMessage(event, results);
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
