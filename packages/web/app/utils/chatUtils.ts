import { AI_MESSAGE_ROLES, Conversation } from '@globalTypes/chat';

/**
 * Calculate the number of consecutive user messages at the end of a conversation
 * This is used to show unanswered message count when AI is disabled
 *
 * @param conversation - Record of messages in the conversation
 * @returns Number of consecutive user messages at the end
 */
export const calculateUnansweredCount = (conversation: Conversation): number => {
  if (!conversation || Object.keys(conversation).length === 0) {
    return 0;
  }

  // Convert to array and sort by timestamp (newest first)
  const messages = Object.values(conversation).sort((a, b) => b.timestamp - a.timestamp);

  let count = 0;

  // Count consecutive user messages from the end
  for (const message of messages) {
    if (message.message?.role === AI_MESSAGE_ROLES.USER) {
      count++;
    } else {
      // Stop when we hit a non-user message
      break;
    }
  }

  return count;
};
