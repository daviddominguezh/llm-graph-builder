import {
  deleteConversation as deleteConversationAPI,
  fixInquiry as fixInquiryAPI,
  getLastMessages as getLastMessagesAPI,
  getMessagesFromSender as getMessagesFromSenderAPI,
  readConversation as readConversationAPI,
  sendMediaMessage as sendMediaMessageAPI,
  sendMediaTestMessage as sendMediaTestMessageAPI,
  sendMessage as sendMessageAPI,
  sendTestMessage as sendTestMessageAPI,
  setChatbotActiveState as setChatbotActiveStateAPI,
} from '@/app/components/messages/services/api';
import {
  cleanFetchQueue,
  removeLastMessage,
  setAllLastMessages,
  setLastMessage,
} from '@/app/components/messages/store';
import { TEST_PHONE } from '@/app/constants/messages';
import { AI_MESSAGE_ROLES, type Conversation, INTENT, type LastMessage } from '@/app/types/chat';
import { calculateUnansweredCount } from '@/app/utils/chatUtils';
import type { Dispatch } from 'redux';

import type { CacheServiceInterface } from '../../MessagesDashboard.types';
import { ConversationMessagesCacheService } from '../services/ConversationMessagesCacheService';

/**
 * MessageRepository
 *
 * Single source of truth for message data, coordinating between:
 * - API calls for server data
 * - Redux store for app state
 * - Cache service for performance
 *
 * This follows the Repository pattern to abstract data access
 * and provide a clean interface for components.
 */
export class MessageRepository {
  // Cache is now stored forever - no TTL validation
  // Messages are fetched incrementally (only new messages after last cached message)
  private static readonly INFINITE_CACHE_TTL = Number.MAX_SAFE_INTEGER; // Effectively infinite cache

  constructor(
    private readonly dispatch: Dispatch,
    private readonly cacheService: CacheServiceInterface
  ) {}

  /**
   * Load all conversations for a project
   * NOTE: Always fetches fresh data from API (no cache) to ensure real-time updates
   * for high-volume chats that receive hundreds of messages per minute
   */
  async loadConversations(projectName: string): Promise<Record<string, LastMessage>> {
    try {
      // Always fetch fresh data from API (no cache for conversation list)
      const data = await getLastMessagesAPI(projectName);

      // Initialize with empty object if API returns null
      const initialData = data || {};

      // Calculate unanswered counts for chats with AI disabled
      // Use only cached data - NO fetching

      const chatsNeedingCount = Object.entries(initialData).filter(([_, chat]) => !chat.enabled);

      // Create a map of unanswered counts
      const unansweredCounts: Record<string, number> = {};

      if (chatsNeedingCount.length > 0) {
        await Promise.all(
          chatsNeedingCount.map(async ([chatId, chat]) => {
            try {
              // Try to get cached conversation (no fetch)
              const cached = await this.cacheService.get<Conversation>(`messages-${chatId}`, projectName);

              if (cached) {
                // Use cached conversation to calculate count (cache is valid forever)
                const cachedConversation = cached.data;
                const unansweredCount = calculateUnansweredCount(cachedConversation);

                // Check if LastMessage is newer than cached conversation
                // If cached shows 0 but LastMessage is a user message, assume LastMessage is truth
                if (unansweredCount === 0 && chat.message?.role === 'user') {
                  const messages = Object.values(cachedConversation);
                  if (messages.length > 0) {
                    const sortedMessages = messages.sort((a, b) => b.timestamp - a.timestamp);
                    const cachedLastMessage = sortedMessages[0];

                    // If cached last message is not user but LastMessage is user, assume 1 unanswered
                    if (cachedLastMessage.message?.role !== 'user') {
                      unansweredCounts[chatId] = 1;
                      return;
                    }
                  }
                }

                unansweredCounts[chatId] = unansweredCount;
              } else {
                // No cache available, use LastMessage as source of truth
                // If LastMessage is a user message, assume 1 unanswered
                if (chat.message?.role === 'user') {
                  unansweredCounts[chatId] = 1;
                } else {
                  unansweredCounts[chatId] = 0;
                }
              }
            } catch (error) {
              console.error(`Failed to calculate unanswered count for chat ${chatId}:`, error);
              // Fallback: if LastMessage is user, assume 1 unanswered
              if (chat.message?.role === 'user') {
                unansweredCounts[chatId] = 1;
              } else {
                unansweredCounts[chatId] = 0;
              }
            }
          })
        );
      }

      // Create new data object with unanswered counts to ensure immutability
      const updatedData: Record<string, LastMessage> = {};
      for (const [chatId, chat] of Object.entries(initialData)) {
        if (chatId in unansweredCounts) {
          // Create new chat object with unanswered count
          updatedData[chatId] = {
            ...chat,
            unansweredCount: unansweredCounts[chatId],
          };
        } else {
          updatedData[chatId] = chat;
        }
      }

      // Always ensure test chat is present (for testing and development purposes)
      // If test chat doesn't exist in API response, create a placeholder
      if (!updatedData[TEST_PHONE]) {
        const testChat: LastMessage = {
          key: TEST_PHONE,
          originalId: '',
          name: 'Test Chat',
          timestamp: Date.now(),
          read: true,
          enabled: true,
          type: 'text',
          intent: INTENT.NONE,
          id: TEST_PHONE,
          message: {
            role: AI_MESSAGE_ROLES.ASSISTANT,
            content: '',
          },
        };
        updatedData[TEST_PHONE] = testChat;
      } else {
        // Ensure test chat always has enabled = true so it shows in "with-bot" filter
        updatedData[TEST_PHONE] = {
          ...updatedData[TEST_PHONE],
          enabled: true,
        };
      }

      // Update Redux with fresh data (including unanswered counts)
      this.dispatch(setAllLastMessages(updatedData));

      return updatedData;
    } catch (error) {
      console.error('Failed to load conversations:', error);
      throw error;
    }
  }

  /**
   * Load messages for a specific conversation
   * Uses incremental loading: fetches only new messages after the last cached message
   */
  async loadConversation(projectName: string, chatId: string, fromMessageId?: string): Promise<Conversation> {
    try {
      // Always check cache first
      const cached = await this.cacheService.get<Conversation>(`messages-${chatId}`, projectName);

      // If fromMessageId is provided (pagination), handle that separately
      if (fromMessageId) {
        const msgs = await getMessagesFromSenderAPI(projectName, chatId, fromMessageId);
        if (!msgs) return cached?.data || {};

        // Normalize messages by ID
        const normalizedMessages: Conversation = {};
        Object.keys(msgs).forEach((msgKey) => {
          normalizedMessages[msgs[msgKey].id] = msgs[msgKey];
        });

        // Merge with cached messages if they exist
        if (cached?.data) {
          const mergedMessages = { ...cached.data, ...normalizedMessages };
          // Update cache with merged data (cache forever)
          await this.cacheService.set(
            `messages-${chatId}`,
            projectName,
            mergedMessages,
            MessageRepository.INFINITE_CACHE_TTL
          );
          return mergedMessages;
        }

        return normalizedMessages;
      }

      // Initial load: check if we have cached data
      if (cached?.data) {
        // Find the latest message ID from cache to fetch only new messages
        const cachedMessages = Object.values(cached.data);
        if (cachedMessages.length > 0) {
          // Sort by timestamp to find the most recent message
          const sortedMessages = cachedMessages.sort((a, b) => b.timestamp - a.timestamp);
          const latestMessageId = sortedMessages[0].id;

          // Fetch only new messages after the latest cached message
          const newMsgs = await getMessagesFromSenderAPI(projectName, chatId, latestMessageId);

          if (newMsgs && Object.keys(newMsgs).length > 0) {
            // Normalize new messages
            const normalizedNewMessages: Conversation = {};
            Object.keys(newMsgs).forEach((msgKey) => {
              normalizedNewMessages[newMsgs[msgKey].id] = newMsgs[msgKey];
            });

            // Merge with cached messages
            const mergedMessages = { ...cached.data, ...normalizedNewMessages };

            // Update cache with merged data (cache forever)
            await this.cacheService.set(
              `messages-${chatId}`,
              projectName,
              mergedMessages,
              MessageRepository.INFINITE_CACHE_TTL
            );

            return mergedMessages;
          }

          // No new messages, return cached data
          return cached.data;
        }
      }

      // No cache or empty cache - fetch all messages
      const msgs = await getMessagesFromSenderAPI(projectName, chatId, undefined);

      if (!msgs) {
        return {};
      }

      // Normalize messages by ID
      const normalizedMessages: Conversation = {};
      Object.keys(msgs).forEach((msgKey) => {
        normalizedMessages[msgs[msgKey].id] = msgs[msgKey];
      });

      // Store in cache (cache forever)
      await this.cacheService.set(
        `messages-${chatId}`,
        projectName,
        normalizedMessages,
        MessageRepository.INFINITE_CACHE_TTL
      );

      return normalizedMessages;
    } catch (error) {
      console.error('[MessageRepository] Error loading conversation:', {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Send a message
   */
  async sendMessage(
    projectName: string,
    chatId: string,
    message: string,
    mediaType: 'text' | 'image' | 'audio' | 'pdf' = 'text',
    messageId?: string,
    isTestChat = false
  ): Promise<void> {
    try {
      if (isTestChat) {
        // sendTestMessage signature: (namespace, msg, type, msgId)
        await sendTestMessageAPI(projectName, message, mediaType, messageId || '');
      } else {
        await sendMessageAPI(projectName, chatId, message, mediaType, messageId);
        // Invalidate conversation cache (only for non-test chats)
        await this.cacheService.invalidate(`messages-${chatId}`, projectName);
      }
    } catch (error) {
      console.error('[MessageRepository] Failed to send message:', { chatId, error });
      throw error;
    }
  }

  /**
   * Send a media message (image, pdf, video)
   */
  async sendMediaMessage(
    projectName: string,
    chatId: string,
    mediaUrl: string,
    mediaType: 'image' | 'audio' | 'pdf' | 'video',
    messageId: string,
    isTestChat = false,
    caption?: string
  ): Promise<void> {
    try {
      if (isTestChat) {
        await sendMediaTestMessageAPI(projectName, mediaUrl, messageId, mediaType, caption);
      } else {
        await sendMediaMessageAPI(projectName, chatId, mediaUrl, mediaType, messageId, caption);
        // Invalidate conversation cache (only for non-test chats)
        await this.cacheService.invalidate(`messages-${chatId}`, projectName);
      }
    } catch (error) {
      console.error('[MessageRepository] Failed to send media message:', { chatId, error });
      throw error;
    }
  }

  /**
   * Mark conversation as read
   */
  async markAsRead(projectName: string, chatId: string, lastMessage: LastMessage): Promise<void> {
    try {
      // Optimistic update
      this.dispatch(
        setLastMessage({
          id: chatId,
          lastMessage: { ...lastMessage, read: true },
          preventFetch: true,
        })
      );

      // Send to server
      await readConversationAPI(projectName, chatId);
    } catch (error) {
      console.error('Failed to mark as read:', error);
      // Revert optimistic update
      this.dispatch(
        setLastMessage({
          id: chatId,
          lastMessage,
          preventFetch: true,
        })
      );
      throw error;
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(projectName: string, chatId: string): Promise<void> {
    try {
      // Optimistic update
      this.dispatch(removeLastMessage({ id: chatId }));

      // Invalidate message cache for this conversation (LocalStorage cache)
      await this.cacheService.invalidate(`messages-${chatId}`, projectName);

      // Clear IndexedDB cache for conversation messages
      await ConversationMessagesCacheService.clearConversationCache(projectName, chatId);

      // Send to server (don't wait)
      deleteConversationAPI(projectName, chatId);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      throw error;
    }
  }

  /**
   * Toggle AI chatbot for a conversation
   */
  async toggleAI(
    projectName: string,
    chatId: string,
    enabled: boolean,
    lastMessage: LastMessage,
    nextNode?: string
  ): Promise<void> {
    try {
      // Optimistic update
      this.dispatch(
        setLastMessage({
          id: chatId,
          lastMessage: { ...lastMessage, enabled },
          preventFetch: true,
        })
      );

      // Send to server with optional nextNode
      await setChatbotActiveStateAPI(projectName, chatId, enabled, nextNode);
    } catch (error) {
      console.error('Failed to toggle AI:', error);
      // Revert optimistic update
      this.dispatch(
        setLastMessage({
          id: chatId,
          lastMessage,
          preventFetch: true,
        })
      );
      throw error;
    }
  }

  /**
   * Fix an inquiry for a specific message.
   * This resolves any pending inquiry state and notifies the system.
   *
   * @param projectName - The project identifier
   * @param chatId - The conversation identifier
   * @param messageId - The message containing the inquiry
   * @throws {Error} If the API call fails
   */
  async fixInquiry(projectName: string, chatId: string, messageId: string): Promise<void> {
    try {
      await fixInquiryAPI(projectName, chatId, messageId);
    } catch (error) {
      console.error('Error fixing inquiry:', error);
      throw error;
    }
  }

  /**
   * Set the chatbot active state for a conversation.
   * When active, the AI chatbot will automatically respond to messages.
   *
   * @param projectName - The project identifier
   * @param chatId - The conversation identifier
   * @param isActive - Whether the chatbot should be active
   * @param nextNode - Optional starting node for the AI conversation
   * @throws {Error} If the API call fails
   */
  async setChatbotActiveState(
    projectName: string,
    chatId: string,
    isActive: boolean,
    nextNode?: string
  ): Promise<void> {
    try {
      await setChatbotActiveStateAPI(projectName, chatId, isActive, nextNode);
    } catch (error) {
      console.error('Error setting chatbot active state:', error);
      throw error;
    }
  }

  /**
   * Update last message in conversation list
   */
  updateLastMessage(chatId: string, lastMessage: LastMessage): void {
    this.dispatch(
      setLastMessage({
        id: chatId,
        lastMessage,
        preventFetch: true,
      })
    );
  }

  /**
   * Clean fetch queue
   */
  clearFetchQueue(): void {
    this.dispatch(cleanFetchQueue());
  }

  /**
   * Invalidate conversation cache
   * Use this when real-time messages arrive to ensure fresh data on next load
   */
  async invalidateConversationCache(projectName: string, chatId: string): Promise<void> {
    await this.cacheService.invalidate(`messages-${chatId}`, projectName);
  }
}
