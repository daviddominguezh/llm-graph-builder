/**
 * WhatsApp test mode phone system -- placeholder.
 *
 * TODO: Implement test-mode phone routing matching closer-back:
 * - /closer-back/src/controllers/whatsapp/messageHandler.ts (resolveTestMode)
 * - /closer-back/src/controllers/whatsapp/testMode.ts
 *
 * When a user texts "join-test:{namespace}" to a designated test phone:
 * 1. Store test session mapping (user phone -> namespace) in Redis
 * 2. Reset user's graph node to INITIAL_STEP
 * 3. Route subsequent messages from that user to the mapped namespace
 * 4. Bypass traffic percentage and credit checks
 * 5. Send responses from the test phone, not the real business phone
 */

const TEST_MODE_PATTERN = /^join-test:(?<namespace>.+)/iv;

export function isTestModeMessage(content: string): boolean {
  return TEST_MODE_PATTERN.test(content);
}
