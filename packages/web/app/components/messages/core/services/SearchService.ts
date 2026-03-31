import MiniSearch from 'minisearch';

import { formatPhone } from '@/app/utils/strs';

import { ChatSearchResults, Conversation, LastMessage, Message } from '@/app/types/chat';

/**
 * Document types for search indexing
 */
interface ConversationDocument {
  id: string; // chatId
  phone: string;
  formattedPhone: string;
  name: string;
  lastMessage: string;
}

interface MessageDocument {
  id: string; // messageId
  chatId: string;
  content: string;
  timestamp: number;
}

/**
 * Search service configuration
 */
interface SearchServiceConfig {
  /** Maximum messages to search per chat (default: 50) */
  maxMessagesPerChat?: number;
  /** Maximum matching messages to return per chat (default: 5) */
  maxMatchesPerChat?: number;
  /** Enable fuzzy matching (default: false for performance) */
  fuzzyMatch?: boolean;
}

/**
 * Service for fast indexed search across conversations and messages
 *
 * Uses MiniSearch for:
 * - O(log n) indexed search vs O(n) linear scan
 * - Better relevance scoring
 * - Prefix matching
 * - Optional fuzzy matching
 *
 * Architecture:
 * - Maintains two indexes: conversations and messages
 * - Automatically updates indexes when data changes
 * - Falls back to cache when index doesn't have data
 */
export class SearchService {
  private conversationIndex: MiniSearch<ConversationDocument>;
  private messageIndex: MiniSearch<MessageDocument>;
  private readonly config: Required<SearchServiceConfig>;
  private indexedChatIds = new Set<string>();

  constructor(config: SearchServiceConfig = {}) {
    this.config = {
      maxMessagesPerChat: config.maxMessagesPerChat ?? 50,
      maxMatchesPerChat: config.maxMatchesPerChat ?? 5,
      fuzzyMatch: config.fuzzyMatch ?? false,
    };

    // Initialize conversation index
    this.conversationIndex = new MiniSearch<ConversationDocument>({
      fields: ['phone', 'formattedPhone', 'name', 'lastMessage'],
      storeFields: ['id', 'phone', 'formattedPhone', 'name'],
      searchOptions: {
        prefix: true, // Enable prefix matching
        fuzzy: this.config.fuzzyMatch ? 0.2 : false,
        boost: {
          phone: 2, // Boost phone matches
          formattedPhone: 2,
          name: 3, // Boost name matches more
          lastMessage: 1,
        },
      },
    });

    // Initialize message index
    this.messageIndex = new MiniSearch<MessageDocument>({
      fields: ['content'],
      storeFields: ['id', 'chatId', 'timestamp'],
      searchOptions: {
        prefix: true,
        fuzzy: this.config.fuzzyMatch ? 0.2 : false,
      },
    });
  }

  /**
   * Index conversations for fast search
   */
  indexConversations(conversations: Record<string, LastMessage>): void {
    const documents: ConversationDocument[] = [];

    for (const [chatId, chat] of Object.entries(conversations)) {
      const phone = chatId.replace('whatsapp:', '');
      const formattedPhone = formatPhone(phone) || phone;
      const name = chat.name || '';
      const lastMessage = this.getMessageText(chat.message) || '';

      documents.push({
        id: chatId,
        phone,
        formattedPhone,
        name,
        lastMessage,
      });
    }

    // Clear and rebuild conversation index
    this.conversationIndex.removeAll();
    this.conversationIndex.addAll(documents);
  }

  /**
   * Index messages for a specific chat
   */
  indexChatMessages(chatId: string, messages: Conversation): void {
    // Get last N messages for indexing
    const messageEntries = Object.entries(messages);
    const recentMessages = messageEntries.slice(-this.config.maxMessagesPerChat);

    const documents: MessageDocument[] = [];

    for (const [msgId, msg] of recentMessages) {
      const content = this.getMessageText(msg.message);
      if (content) {
        // Check if message is already indexed
        if (!this.messageIndex.has(msgId)) {
          documents.push({
            id: msgId,
            chatId,
            content,
            timestamp: msg.timestamp,
          });
        }
      }
    }

    // Only add new documents
    if (documents.length > 0) {
      this.messageIndex.addAll(documents);
    }

    this.indexedChatIds.add(chatId);
  }

  /**
   * Perform indexed search
   */
  search(
    term: string,
    conversations: Record<string, LastMessage>,
    options?: {
      activeChat?: string | null;
      loadedMessages?: Conversation;
      projectName?: string;
    }
  ): ChatSearchResults {
    if (!term || term.trim().length === 0) {
      return { results: [], totalMatches: 0 };
    }

    const searchTerm = term.toLowerCase().trim();
    const results: ChatSearchResults = { results: [], totalMatches: 0 };
    const processedChats = new Set<string>();

    // Step 1: Search conversations (phone, name, last message)
    const conversationMatches = this.conversationIndex.search(searchTerm);

    for (const match of conversationMatches) {
      const chatId = match.id;
      processedChats.add(chatId);

      const chat = conversations[chatId];
      if (!chat) continue;

      const phone = chatId.replace('whatsapp:', '');
      const formattedPhone = formatPhone(phone) || phone;

      // Determine what matched
      const phoneMatches =
        phone.toLowerCase().includes(searchTerm) || formattedPhone.toLowerCase().includes(searchTerm);
      const nameMatches = (chat.name || '').toLowerCase().includes(searchTerm);
      const lastMessageMatches = (this.getMessageText(chat.message) || '').toLowerCase().includes(searchTerm);

      results.results.push({
        chatId,
        matchingMessageIds: lastMessageMatches ? [chat.id] : [],
        matchType: phoneMatches || nameMatches ? 'phone' : 'message',
        phoneMatch: phoneMatches,
        nameMatch: nameMatches,
        messageMatch: lastMessageMatches,
      });

      results.totalMatches += lastMessageMatches ? 1 : 1;
    }

    // Step 2: Search indexed messages for additional matches
    const messageMatches = this.messageIndex.search(searchTerm);

    // Group messages by chat
    const messagesByChatMap = new Map<string, string[]>();
    for (const match of messageMatches) {
      const doc = match as unknown as { id: string; chatId: string };
      const { chatId, id: messageId } = doc;

      if (!messagesByChatMap.has(chatId)) {
        messagesByChatMap.set(chatId, []);
      }

      const chatMessages = messagesByChatMap.get(chatId);
      if (chatMessages && chatMessages.length < this.config.maxMatchesPerChat) {
        chatMessages.push(messageId);
      }
    }

    // Add message-only matches
    for (const [chatId, messageIds] of messagesByChatMap.entries()) {
      if (processedChats.has(chatId)) {
        // Already added from conversation search, update it
        const existing = results.results.find((r) => r.chatId === chatId);
        if (existing && !existing.messageMatch) {
          existing.matchingMessageIds = messageIds;
          existing.messageMatch = true;
          existing.matchType = existing.phoneMatch ? 'both' : 'message';
          results.totalMatches += messageIds.length;
        }
      } else {
        // New match from messages only
        results.results.push({
          chatId,
          matchingMessageIds: messageIds,
          matchType: 'message',
          phoneMatch: false,
          nameMatch: false,
          messageMatch: true,
        });
        results.totalMatches += messageIds.length;
        processedChats.add(chatId);
      }
    }

    // Step 3: Fallback search in non-indexed chats via cache
    if (options?.projectName) {
      const uncheckedChats = Object.keys(conversations).filter(
        (chatId) => !processedChats.has(chatId) && !this.indexedChatIds.has(chatId)
      );

      for (const chatId of uncheckedChats) {
        const cachedResult = this.searchCachedMessages(
          chatId,
          searchTerm,
          options.projectName,
          options.activeChat === chatId ? options.loadedMessages : undefined
        );

        if (cachedResult) {
          results.results.push(cachedResult);
          results.totalMatches += cachedResult.matchingMessageIds.length;
        }
      }
    }

    return results;
  }

  /**
   * Fallback: Search messages in cache (for chats not indexed yet)
   */
  private searchCachedMessages(
    chatId: string,
    searchTerm: string,
    projectName: string,
    loadedMessages?: Conversation
  ): ChatSearchResults['results'][0] | null {
    let messagesToSearch: Conversation | null = loadedMessages || null;

    // Try to get from localStorage
    if (!messagesToSearch) {
      const cacheKey = `messagesDashboard:${projectName}:messages-${chatId}`;
      const cachedData = localStorage.getItem(cacheKey);

      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          messagesToSearch = parsed.data as Conversation;
        } catch (e) {
          console.error('Error parsing cached messages:', e);
        }
      }
    }

    if (!messagesToSearch) return null;

    // Search last N messages
    const messageIds = Object.keys(messagesToSearch).slice(-this.config.maxMessagesPerChat);
    const matchingMessageIds: string[] = [];

    for (const msgId of messageIds) {
      const msg = messagesToSearch[msgId];
      const msgText = this.getMessageText(msg.message)?.toLowerCase() || '';

      if (msgText.includes(searchTerm)) {
        matchingMessageIds.push(msgId);

        if (matchingMessageIds.length >= this.config.maxMatchesPerChat) {
          break;
        }
      }
    }

    if (matchingMessageIds.length > 0) {
      return {
        chatId,
        matchingMessageIds,
        matchType: 'message',
        phoneMatch: false,
        nameMatch: false,
        messageMatch: true,
      };
    }

    return null;
  }

  /**
   * Extract text content from a message
   */
  private getMessageText(message: Message['message'] | undefined): string | null {
    if (!message) return null;

    const content = message.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'text' in item) {
            return (item as { text: string }).text;
          }
          return '';
        })
        .join(' ');
    }

    return null;
  }

  /**
   * Clear all indexes
   */
  clearIndex(): void {
    this.conversationIndex.removeAll();
    this.messageIndex.removeAll();
    this.indexedChatIds.clear();
  }

  /**
   * Get index statistics for debugging/monitoring
   */
  getStats(): {
    conversationsIndexed: number;
    messagesIndexed: number;
    chatsWithMessages: number;
  } {
    return {
      conversationsIndexed: this.conversationIndex.documentCount,
      messagesIndexed: this.messageIndex.documentCount,
      chatsWithMessages: this.indexedChatIds.size,
    };
  }
}

/**
 * Factory function to create a search service
 */
export function createSearchService(config?: SearchServiceConfig): SearchService {
  return new SearchService(config);
}
