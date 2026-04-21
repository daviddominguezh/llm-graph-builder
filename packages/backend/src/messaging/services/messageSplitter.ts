/**
 * Message splitter for chat-style channels.
 *
 * When "Format for chat interfaces" is enabled on a channel connection,
 * long messages are split at sentence/paragraph boundaries to stay within
 * channel limits (e.g., WhatsApp 4096 chars) and delivered with delays
 * + typing indicators between segments for a natural chat feel.
 *
 * TODO: Implement the "Format for chat interfaces" toggle on channel_connections.
 * This should be a boolean column on channel_connections, exposed in the
 * channel connector UI ("channels" tab for apps). When enabled:
 * 1. Split messages at 4096 chars on sentence/paragraph boundaries
 * 2. Send each segment with 1s delay between them
 * 3. Re-send typing indicator between segments
 *
 * See closer-back's implementation:
 * - splitChatText() from @daviddh/llm-markdown-whatsapp
 * - processMessageFromModel in /closer-back/src/controllers/messages/index.ts:1159-1198
 *
 * Current behavior: "Format for chat interfaces" defaults to OFF.
 * Messages are sent as-is (single message, no splitting).
 */

export const WHATSAPP_MAX_LENGTH = 4096;

/** TODO: Read from channel_connections.format_for_chat boolean */
export function shouldFormatForChat(_channelType: string): boolean {
  return false; // Default OFF
}

/** TODO: Implement actual splitting logic */
export function splitMessage(content: string, _maxLength: number = WHATSAPP_MAX_LENGTH): string[] {
  // When implemented: split at sentence boundaries, respecting maxLength
  return [content];
}

// TODO: Implement delayed multi-segment sending
// async function sendSegments(segments: string[], sendFn, typingFn, delayMs = 1000)
