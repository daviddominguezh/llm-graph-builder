import { ChatSearchResults, Conversation, LastMessage, Message } from '@/app/types/chat';
import { MediaFileDetailList } from '@/app/types/media';

// Core domain types
export interface MessagesDashboardState {
  conversations: Conversation;
  activeChat: string | null;
  messages: Conversation;
  isLoading: boolean;
  error: Error | null;
}

// Service interfaces
export interface CacheServiceInterface {
  get<T>(key: string, namespace: string): Promise<CachedData<T> | null>;
  set<T>(key: string, namespace: string, data: T, ttl?: number): Promise<void>;
  update<T>(key: string, namespace: string, data: Partial<T>): Promise<void>;
  invalidate(key: string, namespace: string): Promise<void>;
  clear(namespace?: string): Promise<void>;
}

export interface SyncServiceInterface {
  initialize(projectName: string): void;
  destroy(): void;
  on(event: string, handler: (data: unknown) => void): () => void;
  emit(event: string, data: unknown): void;
  onNewMessage(handler: (message: Message) => void): () => void;
  onMessageRead(handler: (chatId: string) => void): () => void;
  onConversationUpdated(handler: (conversation: LastMessage) => void): () => void;
}

export interface SearchServiceInterface {
  search(query: string, projectName: string): Promise<ChatSearchResults>;
  indexConversation(conversation: Conversation): Promise<void>;
  clearIndex(): Promise<void>;
}

// Cache data structure
export interface CachedData<T> {
  data: T;
  timestamp: number;
  expiresAt?: number;
}

export interface MessageAction {
  id: string;
  label: string;
  icon?: React.ComponentType;
  onClick: (message: Message) => void;
  isVisible?: (message: Message) => boolean;
  isEnabled?: (message: Message) => boolean;
}

export interface ChatAction {
  id: string;
  label: string;
  icon?: React.ComponentType;
  onClick: (chat: LastMessage) => void;
  isVisible?: (chat: LastMessage) => boolean;
  isEnabled?: (chat: LastMessage) => boolean;
}

export interface ToolbarItem {
  id: string;
  label: string;
  icon: React.ComponentType;
  onClick: () => void;
  isVisible?: () => boolean;
  isEnabled?: () => boolean;
}

export interface SidebarPanel {
  id: string;
  title: string;
  component: React.ComponentType;
  position: 'top' | 'bottom' | 'left' | 'right';
  order?: number;
}

// Hook return types
export interface ConversationsHookReturn {
  conversations: LastMessage[];
  isLoading: boolean;
  error: Error | null;
  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  activeConversation: LastMessage | null;
  unreadCount: number;
}

export interface MessagesHookReturn {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (content: string, attachments?: MediaFileDetailList) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  hasMore: boolean;
  deleteMessage?: (messageId: string) => Promise<void>;
}

// Search types
export interface SearchResult {
  id: string;
  type: 'chat' | 'message' | 'contact';
  title: string;
  subtitle?: string;
  timestamp?: number;
  matchedText?: string;
  score: number;
}

// AI/Chatbot specific types
export interface AiState {
  isEnabled: boolean;
  selectedNode: string | null;
  isTestChatActive: boolean;
  inquiryPending: boolean;
  inquiryData?: {
    query: string;
    chatId: string;
  };
}

// Media types
export interface MediaState {
  uploading: Map<string, number>;
  orientations: Record<string, 'landscape' | 'portrait'>;
}

// Layout types
export type LayoutMode = 'two-column' | 'three-column' | 'mobile';

export interface LayoutConfig {
  mode: LayoutMode;
  sidebarWidth?: number;
  detailsPanelWidth?: number;
  breakpoints: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
}

// Feature flags
export interface FeatureFlags {
  core: {
    chat: boolean;
    messages: boolean;
    search: boolean;
    media: boolean;
  };
  features: {
    ai: boolean;
    notes: boolean;
    reminders: boolean;
    tags: boolean;
    templates: boolean;
    automation: boolean;
    analytics: boolean;
    scheduling: boolean;
    wysiwyg: boolean;
    assignments: boolean;
    folders: boolean;
  };
  views: {
    list: boolean;
    grid: boolean;
    kanban: boolean;
    calendar: boolean;
  };
}

// Configuration
export interface MessagesDashboardConfig {
  features: FeatureFlags;
  layout: LayoutConfig;
  cacheStrategy: 'localStorage' | 'indexedDB' | 'memory';
  syncInterval: number;
  messagePageSize: number;
  searchDebounce: number;
  virtualScrollOptions: {
    itemHeight: number;
    overscan: number;
  };
}

// Component Props Types
export interface ChatListProps {
  conversations: LastMessage[];
  activeId: string | null;
  onChatSelect: (id: string) => void;
  filters?: ChatFilters;
  groupBy?: 'date' | 'status' | 'assignee';
  renderActions?: (chat: LastMessage) => React.ReactNode;
  onDeleteChat?: (id: string) => void;
  isSearchActive?: boolean;
  searchResults?: ChatSearchResults;
}

export interface ChatFilters {
  status?: 'all' | 'unread' | 'archived';
  assignee?: string;
  tags?: string[];
  dateRange?: [Date, Date];
}

export interface MessageProps {
  message: Message;
  variant: 'sent' | 'received';
  isHighlighted?: boolean;
  actions?: MessageAction[];
  onReplyClick?: (messageId: string) => void;
  onImageLoad?: (orientation: 'landscape' | 'portrait') => void;
}

export interface MessageInputProps {
  onSend: (content: string, attachments?: MediaFileDetailList) => void;
  placeholder?: string;
  toolbar?: ToolbarItem[];
  disabled?: boolean;
  replyTo?: Message;
  onCancelReply?: () => void;
}

export interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  filters?: SearchFilter[];
  debounce?: number;
  placeholder?: string;
}

export interface SearchFilter {
  id: string;
  label: string;
  type: 'select' | 'date' | 'boolean';
  options?: Array<{ value: string; label: string }>;
  value?: unknown;
  onChange?: (value: unknown) => void;
}
