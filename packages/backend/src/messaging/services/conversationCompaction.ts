/**
 * Conversation compaction service.
 *
 * When an AI conversation grows long (>20 non-tool messages), the full
 * history would consume too many tokens. Compaction summarises the oldest
 * messages into a single system message so the AI context stays bounded
 * while the full conversation history remains visible to human agents.
 *
 * This is a skeleton — the exported functions are currently no-ops.
 * Every detail from closer-back is documented as TODOs so nothing is
 * missed during implementation.
 *
 * References:
 *   closer-back/src/ai/actions/compactConversation/index.ts  (full file)
 *   closer-back/src/ai/actions/compactConversation/prompt.ts (prompt)
 *   closer-back/src/controllers/messages/index.ts lines 1439–1466 (call site in reply())
 */
import type { MessageAiRow } from '../types/index.js';

// ---------------------------------------------------------------------------
// Constants — mirror closer-back's constants exactly
// ---------------------------------------------------------------------------

/**
 * Threshold: compact when the count of non-tool messages exceeds this value.
 *
 * TODO: Use this constant in shouldCompact().
 * Closer-back source: `const COMPACTION_THRESHOLD = 20;`
 * (closer-back/src/ai/actions/compactConversation/index.ts line 16)
 */
const COMPACTION_THRESHOLD = 20;

/**
 * How many of the oldest non-tool messages are fed to the summarisation LLM.
 *
 * TODO: Use this constant when slicing messages for summarisation.
 * Closer-back source: `const MESSAGES_TO_SUMMARIZE = 15;`
 * (closer-back/src/ai/actions/compactConversation/index.ts line 17)
 */
const MESSAGES_TO_SUMMARIZE = 15;

/**
 * How many of the most recent messages are kept verbatim in the AI context.
 *
 * TODO: Use this constant when slicing messages to keep.
 * Closer-back source: `const MESSAGES_TO_KEEP = 5;`
 * (closer-back/src/ai/actions/compactConversation/index.ts line 18)
 */
const MESSAGES_TO_KEEP = 5;
const EMPTY_TIMESTAMP = 0;

/**
 * Tool call results that must NEVER be discarded during compaction because
 * they carry business-critical state (payment links, cart contents, etc.).
 *
 * TODO: Filter these out of the "older" messages bucket before summarising,
 *       then re-inject them alongside the summary message.
 * Closer-back source: `const PRESERVED_TOOLS = [...]`
 * (closer-back/src/ai/actions/compactConversation/index.ts lines 33–41)
 */
const PRESERVED_TOOL_NAMES: readonly string[] = [
  'searchProducts',
  'createPaymentLink',
  'calculateTotalPayment',
  'createCashOnDeliveryOrder',
  'verifyPayment',
  'getTransferenceDetails',
  'waitForTransferenceVerification',
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CompactionResult {
  /** The compacted message array to use for the current AI invocation. */
  compactedMessages: MessageAiRow[];
  /**
   * The synthetic summary message to persist in messages_ai.
   * Has `is_summary = true` and role = 'system'.
   */
  summaryMessage: MessageAiRow;
  /** False when no compaction was needed (message count ≤ threshold). */
  wasCompacted: boolean;
}

// ---------------------------------------------------------------------------
// shouldCompact
// ---------------------------------------------------------------------------

/**
 * Returns true when the conversation is long enough to require compaction.
 *
 * TODO: Implement the exact filter from closer-back:
 *   - Count only NON-tool-result messages (tool results for preserved tools
 *     are excluded from the count, same as during compaction itself).
 *   - Return `summarizableCount > COMPACTION_THRESHOLD` (strict greater-than).
 *
 * Closer-back source:
 *   `export const shouldCompactConversation = (messages) => { ... }`
 *   closer-back/src/ai/actions/compactConversation/index.ts lines 60–64
 *
 *   ```ts
 *   const summarizableMessages = messages.filter(msg => !isPreservedToolMessage(msg));
 *   return summarizableMessages.length > COMPACTION_THRESHOLD; // 20
 *   ```
 *
 * @param messages - The AI message history (from messages_ai table).
 */
function isToolRole(role: string): boolean {
  return role === 'tool';
}

function isPreservedToolMessage(msg: MessageAiRow): boolean {
  const { role, metadata } = msg;
  if (!isToolRole(role)) return false;
  if (metadata === null) return false;
  const { toolName } = metadata;
  if (typeof toolName !== 'string') return false;
  return PRESERVED_TOOL_NAMES.includes(toolName);
}

function isSummaryMessage(msg: MessageAiRow): boolean {
  return msg.is_summary;
}

export function shouldCompact(messages: MessageAiRow[]): boolean {
  const countable = messages.filter((m) => !isPreservedToolMessage(m) && !isSummaryMessage(m));
  return countable.length > COMPACTION_THRESHOLD;
}

// ---------------------------------------------------------------------------
// generateCompactionPrompt
// ---------------------------------------------------------------------------

/**
 * TODO: Implement the Spanish-language summarisation prompt.
 *
 * Closer-back uses a fixed Spanish prompt regardless of conversation language.
 * The prompt instructs the LLM to:
 *   - Keep key discussion points
 *   - Keep important decisions or agreements
 *   - Keep relevant customer info (name, preferences, orders)
 *   - Keep context needed to continue the conversation
 *   - Reply ONLY with the summary (no intro/explanation)
 *   - Use the same language as the conversation
 *   - Maximum 3–4 sentences
 *
 * Each message is formatted as:
 *   `[{index}] {role}: {text}` where role is 'Cliente' (user) or 'Asistente'.
 *
 * Closer-back source:
 *   closer-back/src/ai/actions/compactConversation/prompt.ts (full file)
 *
 * @param messages - The messages to summarise (already sliced to MESSAGES_TO_SUMMARIZE).
 */
function buildCompactionPrompt(_messages: MessageAiRow[]): string {
  // TODO: Format messages as [N] Cliente/Asistente: text, then wrap in prompt.
  return 'Summarise the conversation above.';
}

// ---------------------------------------------------------------------------
// compactConversation
// ---------------------------------------------------------------------------

/**
 * Summarise the oldest messages in the conversation and return a compacted
 * message array suitable for use as the AI context.
 *
 * Currently a no-op skeleton — returns the input messages unchanged.
 *
 * TODO: Implement following closer-back's compactConversationStep:
 *
 * Step 1 — Split messages (index.ts lines 137–144):
 *   const olderMessages = messages.slice(0, -MESSAGES_TO_KEEP);       // all but last 5
 *   const messagesToKeep = messages.slice(-MESSAGES_TO_KEEP);          // last 5 verbatim
 *
 * Step 2 — Separate preserved tool results from summarisable messages:
 *   preservedToolMessages = olderMessages.filter(isPreservedToolMessage)
 *   summarizableMessages  = olderMessages.filter(!isPreservedToolMessage)
 *                                         .slice(0, MESSAGES_TO_SUMMARIZE)  // first 15
 *
 *   `isPreservedToolMessage` checks: role === 'tool' AND at least one content
 *   part has a toolName in PRESERVED_TOOL_NAMES.
 *   (closer-back lines 43–55)
 *
 * Step 3 — Call LLM to summarise (index.ts lines 94–101):
 *   const { text: summaryText } = await generateText({
 *     model: TEXT_FEATURE_MODEL[TEXT_FEATURE_ACTION.COMPACT_CONVERSATION].getter().model,
 *     messages: [
 *       { role: 'system', content: prompt },
 *       { role: 'user',   content: 'Resume esta conversación' },
 *     ],
 *     stopWhen: stepCountIs(1),
 *   });
 *
 * Step 4 — Build the summary Message object (index.ts lines 66–77):
 *   {
 *     provider: MESSAGES_PROVIDER.TEST,
 *     type:     CloserMessageTypes.TEXT,
 *     id:       uuidv4(),
 *     timestamp: firstMessage.timestamp - 1,   // just before oldest message
 *     originalId: '',
 *     key:      `summary-${Date.now()}`,
 *     message: {
 *       role:    'system',
 *       content: `[Resumen de conversación anterior]\n${summaryText}`,
 *     },
 *   }
 *   The prefix '[Resumen de conversación anterior]' is REQUIRED — the AI uses
 *   it to understand that the system message is a historical summary, not a
 *   live instruction.
 *
 * Step 5 — Assemble the compacted message array (index.ts line 105):
 *   compactedMessages = [summaryMessage, ...preservedToolMessages, ...messagesToKeep]
 *   Total: 1 summary + N preserved tools + 5 recent = ≤6 + tool results
 *
 * Step 6 — Persist to messages_ai only (index.ts lines 1458–1463 in reply()):
 *   await compactSenderMessagesAI(namespace, userID, summaryMessage, messagesToKeep)
 *   This replaces the messages_ai rows with [summaryMessage, ...messagesToKeep].
 *   The `messages` table (full conversation history shown to humans) is NEVER
 *   modified by compaction. Frontend always reads from `messages` for display.
 *
 * Step 7 — Use compacted array for current AI invocation (reply() line 1463):
 *   messages = compactionResult.compactedMessages
 *   This is in-memory only; the next call to reply() will re-read from DB
 *   and find the already-compacted messages_ai.
 *
 * @param conversationId - The conversation UUID (for DB update in Step 6).
 * @param messages - Full AI message history from messages_ai.
 * @returns CompactionResult with compacted context, summary, and wasCompacted flag.
 */
function buildEmptyMessageAiRow(): MessageAiRow {
  return {
    id: '',
    conversation_id: '',
    role: 'assistant',
    type: 'text',
    content: '',
    media_url: null,
    reply_id: null,
    original_id: null,
    channel_thread_id: null,
    metadata: null,
    timestamp: EMPTY_TIMESTAMP,
    created_at: '',
    is_summary: false,
  };
}

export function compactConversation(_conversationId: string, messages: MessageAiRow[]): CompactionResult {
  // TODO: Remove this no-op body and implement Steps 1–7 above.
  void MESSAGES_TO_SUMMARIZE;
  void MESSAGES_TO_KEEP;
  void buildCompactionPrompt;

  // Placeholder: return the messages unchanged, as if no compaction occurred.
  const [firstMessage] = messages;
  const placeholderSummary: MessageAiRow = {
    ...(firstMessage ?? buildEmptyMessageAiRow()),
    is_summary: true,
  };

  return {
    compactedMessages: messages,
    summaryMessage: placeholderSummary,
    wasCompacted: false,
  };
}

// ---------------------------------------------------------------------------
// Integration notes (for implementer)
// ---------------------------------------------------------------------------

/**
 * WHERE TO CALL THIS:
 *
 * Call shouldCompact + compactConversation inside the AI reply handler,
 * BEFORE collecting unreplied user messages and invoking the LLM.
 *
 * Pseudo-code mirroring closer-back/src/controllers/messages/index.ts lines 1439–1466:
 *
 * ```ts
 * let messages = await getAiMessages(tenantId, userChannelId);
 * messages = reorderUnrepliedMessages(messages);
 *
 * if (shouldCompact(messages)) {
 *   const result = await compactConversation(conversationId, messages);
 *   if (result.wasCompacted) {
 *     messages = result.compactedMessages;
 *     // DB already updated inside compactConversation (Step 6)
 *   }
 * }
 *
 * // Now pass `messages` to the agent runner
 * const response = await runAgent({ messages, ... });
 * ```
 *
 * TABLE DISTINCTION:
 *   `messages`    — full history, shown to human agents in the inbox UI
 *   `messages_ai` — AI context only, may be compacted; has `is_summary` column
 *
 * The `is_summary` column on MessageAiRow flags the synthetic summary row so
 * it can be styled differently if ever shown in the UI.
 */
