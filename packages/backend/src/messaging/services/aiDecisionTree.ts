/**
 * AI enablement decision tree.
 *
 * Determines whether an incoming message should be processed by AI or
 * routed to a human agent. This is a skeleton — the function currently
 * returns the conversation's stored `enabled` flag as a simple default,
 * but every decision path from closer-back's `processCloserMessage` is
 * documented below as TODO items so nothing is missed when implementing.
 *
 * Reference: closer-back/src/controllers/messages/index.ts, lines 459–848
 * (the full `processCloserMessage` function).
 */
import type { ConversationRow } from '../types/index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AiDecisionConfig {
  /**
   * Percentage of NEW conversations that should be handled by AI (0–100).
   *
   * TODO: Read from the org/plan configuration.
   * Closer-back source: `getAvailableMessages(namespace)` → `trafficPercentage`
   * (closer-back/src/controllers/messages/index.ts line 608–612).
   */
  trafficPercentage: number;

  /**
   * How many AI-handled conversations are available this billing period.
   * Computed as: planChats + credits - chatsUsed.
   *
   * TODO: Implement capacity check via billing/plan queries.
   * Closer-back source: `getAvailableMessages(namespace)` → `totalAvailableChats`
   * (closer-back/src/controllers/messages/index.ts line 608–612).
   *
   * Sub-fields from closer-back:
   *   - `availableChatsInPlan` — chats included in the base plan
   *   - `currentMonthCloserMessages` — messages used so far this month
   *   Credits are consumed when `availableChatsInPlan === 0`.
   */
  totalAvailableChats: number;

  /**
   * Whether the current processing call is in test mode.
   *
   * TODO: Derive from `msg.testModePhone` on the incoming message.
   * Closer-back source: `const isTestMode = !!msg.testModePhone;`
   * (closer-back/src/controllers/messages/index.ts line 494).
   */
  isTestMode: boolean;
}

export interface AiDecisionResult {
  /** Whether AI should process this message. */
  shouldInvokeAi: boolean;

  /**
   * Human agent email to assign when AI is NOT chosen.
   * Undefined when AI handles the conversation.
   *
   * TODO: Populate from `assignIncomingMessage()` result.
   * Closer-back source: lines 630, 702–715.
   */
  assignedAgent: string | undefined;
}

// ---------------------------------------------------------------------------
// Helper: test-mode bypass
// ---------------------------------------------------------------------------

/**
 * TODO: Implement full test-mode logic.
 *
 * In test mode (msg.testModePhone is set), closer-back:
 * 1. Skips ALL traffic-percentage and credit-capacity checks.
 * 2. Always enables AI for the conversation UNLESS `lastMessage.enabled`
 *    was explicitly set to `false` (human took over previously).
 * 3. Does NOT deduct credits even though AI processes the message.
 * 4. Saves `enabled = true` on the last-message document.
 * 5. Still calls `saveIncomingMessageMetrics` (metrics, not credits).
 * 6. Queues the message for AI processing via `queueMessage()`.
 *
 * Closer-back source: lines 505–604 of processCloserMessage.
 */
function resolveTestModeDecision(conversation: ConversationRow): AiDecisionResult {
  // TODO: If conversation.enabled === false (human explicitly took over),
  //       fall through to normal processing so the disable is respected.
  //       See closer-back lines 513–520.
  const shouldInvokeAi = conversation.enabled;
  return { shouldInvokeAi, assignedAgent: undefined };
}

// ---------------------------------------------------------------------------
// Helper: new conversation routing
// ---------------------------------------------------------------------------

/**
 * TODO: Implement new-conversation assignment logic.
 *
 * When this is the very first message from a user (no prior conversation row):
 *
 * Step 1 — Traffic-percentage roll (closer-back lines 619–628):
 *   const randomAssignToAI = Math.random() * 100 < (trafficPercentage || 0);
 *   if (randomAssignToAI && totalAvailableChats > 0) → enable AI
 *
 * Step 2 — If NOT selected for AI, try human assignment (lines 630–664):
 *   const assignment = await assignIncomingMessage(namespace, from, isNewConversation=true);
 *   - If assignment.assigned && assignment.agent → assign to human agent,
 *     set message.currentAssignee = agent, message.assignmentType = 'human'
 *   - If assignment.fallbackToAI && totalAvailableChats > 0 → enable AI,
 *     set message.assignmentType = 'ai'
 *   - Otherwise log a warning (could not assign).
 *
 * `assignIncomingMessage` is in closer-back/src/services/agentAssignment.ts.
 * It uses a round-robin or least-loaded strategy across available human agents.
 *
 * Returns the final { shouldInvokeAi, assignedAgent } for this new conversation.
 */
function resolveNewConversationDecision(_config: AiDecisionConfig): AiDecisionResult {
  // TODO: Implement traffic-percentage roll and human assignment fallback.
  return { shouldInvokeAi: false, assignedAgent: undefined };
}

// ---------------------------------------------------------------------------
// Helper: existing conversation routing
// ---------------------------------------------------------------------------

/**
 * TODO: Implement existing-conversation routing.
 *
 * When a conversation already exists, closer-back checks (lines 665–765):
 *
 * A. BLOCKED chat (lastMessage.status === 'blocked'):
 *    → Never invoke AI. Keep blocked status and preserve the existing assignee.
 *    → closerMessageEnabled = false, assignedAgent = lastMessage.currentAssignee
 *    (closer-back lines 670–678)
 *
 * B. AI-assigned conversation (lastMessage.assignmentType === 'ai' || lastMessage.enabled):
 *    → Enable AI for this message.
 *    (closer-back lines 679–685)
 *
 * C. Human-assigned conversation (lastMessage.currentAssignee is set):
 *    → Do not invoke AI. Keep the existing human assignee.
 *    (closer-back lines 686–693)
 *
 * D. No assignee on existing chat (neither human nor AI):
 *    → Attempt assignment via `assignIncomingMessage(namespace, from, isNew=false)`.
 *    → Same fallback logic as new conversations (human → AI fallback).
 *    → AI fallback is only applied if lastMessage.enabled was truthy previously
 *      (closer-back lines 717–734).
 *
 * E. Reopening a CLOSED chat (lastMessage.status === 'closed'):
 *    → This is handled AFTER the assignment decision (lines 744–759).
 *    → Call `addChatStatus(namespace, from, 'open')` to reopen.
 *    → If a human agent is now assigned, call `updateAgentWorkload(agent, +1)`
 *      to increment their active-chat counter.
 *    → This applies to ALL closed chats regardless of AI/human assignment.
 *
 * Returns the final { shouldInvokeAi, assignedAgent } for this existing conversation.
 */
function resolveExistingConversationDecision(
  conversation: ConversationRow,
  _config: AiDecisionConfig
): AiDecisionResult {
  // TODO: Implement blocked / ai / human / no-assignee / closed-reopening paths.
  const shouldInvokeAi = conversation.enabled;
  return { shouldInvokeAi, assignedAgent: undefined };
}

// ---------------------------------------------------------------------------
// Helper: credit deduction
// ---------------------------------------------------------------------------

/**
 * TODO: Implement credit deduction after a successful AI reply.
 *
 * In closer-back, credit deduction does NOT happen inside processCloserMessage.
 * It happens inside `reply()` AFTER the AI message has been sent and the
 * monthly counter has been updated.
 * (closer-back/src/controllers/messages/index.ts line 780:
 *  "Note: Credit deduction happens in reply() after AI messages are sent")
 *
 * Logic:
 * - If `availableChatsInPlan > 0` → decrement plan chats (no credit cost).
 * - If `availableChatsInPlan === 0` → deduct from org credits instead.
 * - Credits are tracked in the billing/plan table (not the conversation).
 * - Test mode: metrics are recorded but credits are NOT deducted.
 *   (closer-back lines 591–599, 828–839)
 *
 * This function is a placeholder; implement it alongside billing integration.
 */
export async function deductAiCredit(_tenantId: string, _isTestMode: boolean): Promise<void> {
  // TODO: Implement credit deduction after AI reply.
  // Check availableChatsInPlan: if > 0, decrement plan counter;
  // otherwise deduct from org.credits.
  // Skip deduction entirely when _isTestMode === true.
}

// ---------------------------------------------------------------------------
// Helper: incoming message metrics
// ---------------------------------------------------------------------------

/**
 * TODO: Implement incoming message metrics recording.
 *
 * closer-back calls `saveIncomingMessageMetrics(namespace, from)` after
 * every processed message regardless of AI/human routing.
 * (closer-back/src/controllers/messages/index.ts lines 838–839)
 *
 * Metrics to record:
 * - Timestamp of the incoming message
 * - Whether it was processed by AI
 * - The channel/provider
 * - Whether it was a test message
 */
export async function recordIncomingMessageMetrics(_tenantId: string, _userChannelId: string): Promise<void> {
  // TODO: Persist metrics to analytics/metrics table.
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Decide whether AI should process an incoming message.
 *
 * Currently returns `conversation.enabled` as a simple passthrough.
 * The full decision tree (traffic %, plan capacity, test mode, blocked/closed
 * status, human agent assignment) must be implemented per the TODOs above.
 *
 * Decision order mirrors closer-back's processCloserMessage (lines 459–848):
 *
 * 1. Test mode check (lines 494–604):
 *    If isTestMode && lastMessage.enabled !== false → always AI, skip rest.
 *
 * 2. Fetch capacity + config (line 608):
 *    `getAvailableMessages()` → totalAvailableChats, trafficPercentage
 *
 * 3. New vs. existing conversation branch (lines 617–765):
 *    - New → resolveNewConversationDecision (traffic roll + human fallback)
 *    - Existing → resolveExistingConversationDecision (blocked/ai/human/closed)
 *
 * 4. TEST provider override (lines 769–774):
 *    If msg.provider === MESSAGES_PROVIDER.TEST → force enabled = true.
 *    (Used for in-app test chat, distinct from testModePhone test mode.)
 *
 * 5. If not enabled → save message and return without queueing (lines 823–826).
 *
 * 6. If enabled → queue for AI processing (lines 828–836) + record metrics.
 *
 * @param conversation - Current conversation state from the database.
 * @param config - Plan/billing config values needed for the decision.
 * @param isNewConversation - True if this is the very first message from this user.
 * @returns Decision containing shouldInvokeAi and optional human assignee.
 */
export function shouldInvokeAi(
  conversation: ConversationRow,
  config: AiDecisionConfig,
  isNewConversation: boolean
): AiDecisionResult {
  // TODO: Replace this entire body with the full decision tree.
  //       Follow the numbered steps in the JSDoc above and the helper
  //       functions in this file.

  if (config.isTestMode) {
    return resolveTestModeDecision(conversation);
  }

  if (isNewConversation) {
    return resolveNewConversationDecision(config);
  }

  return resolveExistingConversationDecision(conversation, config);
}
