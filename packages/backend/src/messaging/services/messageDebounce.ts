/**
 * Message debounce service.
 *
 * When a user sends multiple messages in rapid succession, this service
 * delays AI processing until the user stops typing. The debounce timeout
 * is configurable per channel via channel_connections settings.
 *
 * TODO: Implement configurable debounce timeout per channel.
 * The timeout should be stored on channel_connections (or a related config table)
 * and exposed in the channel connector UI (the "channels" tab for apps).
 * Each channel can have a different timeout — e.g., WhatsApp might use 5s,
 * Slack might use 0s (no debounce). The API channel (POST /api/agents/:slug/:version)
 * should also respect this setting.
 *
 * See closer-back's implementation for reference:
 * - /closer-back/src/controllers/messages/index.ts (queueMessage with DELAY_TO_REPLY_SEGS)
 * - /closer-back/src/controllers/messages/index.ts (collectUnrepliedUserMessages)
 *
 * Current behavior: debounce timeout = 0 (no debounce, process immediately).
 */

// TODO: Read debounce timeout from channel_connections config
// TODO: Use Redis key `pending:{tenantId}:{userChannelId}` with TTL = debounce timeout
// TODO: After TTL expires, collect all unresponded user messages and invoke AI once
// TODO: If debounce > 0, the incoming processor should NOT invoke AI immediately
//       but instead set the pending key and schedule a delayed invocation

const NO_DEBOUNCE = 0;

export function getDebounceTimeoutMs(_tenantId: string, _channelType: string): number {
  // TODO: Look up from channel_connections config
  // For now, always return 0 (no debounce)
  return NO_DEBOUNCE;
}

export function shouldDebounce(tenantId: string, channelType: string): boolean {
  return getDebounceTimeoutMs(tenantId, channelType) > NO_DEBOUNCE;
}

// TODO: Implement scheduleDebounced(tenantId, userChannelId, channelType) that:
// 1. Sets Redis key `pending:{tenantId}:{userChannelId}` with TTL = debounce timeout
// 2. After TTL, collects all unresponded user messages from messages_ai
// 3. Invokes the agent with all collected messages
// 4. This must work across horizontal scaling (Redis-based, not in-memory setTimeout)
