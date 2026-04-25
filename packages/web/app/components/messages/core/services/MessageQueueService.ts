import type { Conversation, LastMessage, Message } from '@/app/types/chat';

import type { MessageRepository } from '../repositories/MessageRepository';

/**
 * Configuration for queue processing
 */
interface QueueProcessorConfig {
  /** Time window in ms to detect optimistic updates (default: 5000ms) */
  optimisticUpdateWindow?: number;
}

/**
 * Result of processing a queue item
 */
interface QueueProcessResult {
  /** Messages to add/merge into UI state */
  messagesToMerge?: Conversation;
  /** IDs of messages to remove (replaced by optimistic updates) */
  messagesToRemove?: string[];
  /** Whether to mark conversation as read */
  shouldMarkAsRead: boolean;
}

/**
 * Service for processing message fetch queue
 *
 * Handles:
 * - Real-time message processing
 * - API fetch fallback
 * - Optimistic update detection and replacement
 * - Cache invalidation
 * - Read status management
 *
 * This separates queue processing business logic from UI components.
 */
export class MessageQueueService {
  private readonly optimisticUpdateWindow: number;

  constructor(config: QueueProcessorConfig = {}) {
    this.optimisticUpdateWindow = config.optimisticUpdateWindow ?? 5000;
  }

  /**
   * Process a batch of queued chat IDs
   *
   * @param queuedChatIds - Array of chat IDs from the fetch queue
   * @param currentState - Current UI state (active chat, messages, etc.)
   * @param dependencies - External dependencies (repository, realtime messages)
   * @returns Map of chatId to processing results
   */
  async processQueue(
    queuedChatIds: string[],
    currentState: {
      activeChat: string | null;
      currentMessages: Conversation;
      currentChat: LastMessage | null;
      projectName: string;
    },
    dependencies: {
      repository: MessageRepository;
      realtimeMessages: Record<string, Message>;
    }
  ): Promise<Record<string, QueueProcessResult>> {
    const results: Record<string, QueueProcessResult> = {};

    for (const chatId of queuedChatIds) {
      try {
        const result = await this.processQueueItem(chatId, currentState, dependencies);
        results[chatId] = result;
      } catch (error) {
        console.error(`[MessageQueueService] Failed to process queue item ${chatId}:`, error);
        // Continue processing other items even if one fails
      }
    }

    return results;
  }

  /**
   * Process a single queued chat ID
   */
  private async processQueueItem(
    chatId: string,
    currentState: {
      activeChat: string | null;
      currentMessages: Conversation;
      currentChat: LastMessage | null;
      projectName: string;
    },
    dependencies: {
      repository: MessageRepository;
      realtimeMessages: Record<string, Message>;
    }
  ): Promise<QueueProcessResult> {
    const { activeChat, currentMessages, currentChat, projectName } = currentState;
    const { repository, realtimeMessages } = dependencies;

    const isActiveChat = activeChat === chatId;
    const realtimeMessage = realtimeMessages[chatId];

    // Case 1: We have a realtime message for this chat
    if (realtimeMessage) {
      // ALWAYS invalidate cache when realtime message arrives (active or inactive chat)
      await repository.invalidateConversationCache(projectName, chatId);

      // Only update UI if this is the active chat
      if (isActiveChat) {
        const processResult = this.processRealtimeMessage(realtimeMessage, currentMessages);

        return {
          ...processResult,
          shouldMarkAsRead: !!currentChat,
        };
      }

      // Not active chat - just invalidated cache, no UI update needed
      return { shouldMarkAsRead: false };
    }

    // Case 2: No realtime message, fetch from API
    const fetchedMessages = await repository.loadConversation(projectName, chatId);

    // Only update UI if this is the active chat
    if (isActiveChat) {
      return {
        messagesToMerge: fetchedMessages,
        shouldMarkAsRead: !!currentChat,
      };
    }

    return { shouldMarkAsRead: false };
  }

  /**
   * Process a realtime message and detect optimistic updates
   *
   * Checks if there's an optimistic message that should be replaced
   * by the confirmed realtime message.
   */
  private processRealtimeMessage(
    realtimeMessage: Message,
    currentMessages: Conversation
  ): Pick<QueueProcessResult, 'messagesToMerge' | 'messagesToRemove'> {
    // Check if message already exists by ID
    if (currentMessages[realtimeMessage.id] !== undefined) {
      return {}; // Already have this message, no update needed
    }

    // Check for duplicate by content and timestamp (optimistic update case)
    const optimisticMessageId = this.findOptimisticMessage(realtimeMessage, currentMessages);

    if (optimisticMessageId) {
      // Found an optimistic message to replace
      return {
        messagesToMerge: {
          [realtimeMessage.id]: realtimeMessage,
        },
        messagesToRemove: [optimisticMessageId],
      };
    }

    // No duplicate found, just add the message
    return {
      messagesToMerge: {
        [realtimeMessage.id]: realtimeMessage,
      },
    };
  }

  /**
   * Find an optimistic message that matches the realtime message
   *
   * An optimistic message is identified by:
   * - Same content
   * - Timestamp within the configured time window
   * - Different ID
   */
  private findOptimisticMessage(realtimeMessage: Message, currentMessages: Conversation): string | null {
    const realtimeContent = realtimeMessage.message?.content;
    const realtimeTimestamp = realtimeMessage.timestamp;

    // Can only match text content
    if (!realtimeContent || typeof realtimeContent !== 'string') {
      return null;
    }

    // Search for matching optimistic message
    for (const [msgId, msg] of Object.entries(currentMessages)) {
      const msgContent = msg.message?.content;
      const isSameContent = typeof msgContent === 'string' && msgContent === realtimeContent;
      const isWithinTimeWindow = Math.abs(msg.timestamp - realtimeTimestamp) < this.optimisticUpdateWindow;

      if (isSameContent && isWithinTimeWindow && msgId !== realtimeMessage.id) {
        return msgId;
      }
    }

    return null;
  }

  /**
   * Apply queue processing results to current messages state
   *
   * Helper function to merge results into React state
   */
  applyResults(currentMessages: Conversation, results: QueueProcessResult[]): Conversation {
    let updatedMessages = { ...currentMessages };

    for (const result of results) {
      // Remove optimistic messages
      if (result.messagesToRemove) {
        for (const msgId of result.messagesToRemove) {
          const { [msgId]: _, ...rest } = updatedMessages;
          updatedMessages = rest;
        }
      }

      // Merge new messages
      if (result.messagesToMerge) {
        updatedMessages = {
          ...updatedMessages,
          ...result.messagesToMerge,
        };
      }
    }

    return updatedMessages;
  }
}

/**
 * Factory function to create a message queue service
 */
export function createMessageQueueService(config?: QueueProcessorConfig): MessageQueueService {
  return new MessageQueueService(config);
}
