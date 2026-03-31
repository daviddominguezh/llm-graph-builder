# Messages Dashboard Architecture

## Overview

The Messages Dashboard is a comprehensive chat interface built with React, TypeScript, and Redux. It uses a **context-based architecture** with **service layer separation** and an **extension slot system** for maximum flexibility and maintainability.

**Last Updated:** Phase 1 Complete (2025)

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      UI Components                            │
│  (ChatListPanel, ChatViewPanel, MessageInput, MessageView)   │
└──────────────┬──────────────────────────────────┬────────────┘
               │                                  │
               ▼                                  ▼
┌──────────────────────────┐        ┌──────────────────────────┐
│   Contexts (State Mgmt)  │        │    Extension Slots       │
│  - ChatContext           │        │  - 9 extensibility       │
│  - MessageContext        │        │    points for features   │
│  - UIContext             │        │                          │
│  - AIContext             │        │                          │
└──────────────┬───────────┘        └──────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│    Service Layer         │
│  - MessageQueueService   │
│  - SearchService         │
│  - CacheService          │
│  - SyncService           │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐        ┌──────────────────────────┐
│   Repository Layer       │───────▶│   Redux (Legacy State)   │
│  - MessageRepository     │        │  - lastMessages          │
└──────────────┬───────────┘        │  - fetchQueue            │
               │                    └──────────────────────────┘
               ▼
┌──────────────────────────┐
│    Cache Layer           │
│  - localStorage          │
│  - IndexedDB (optional)  │
│  - Memory cache          │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│      API Layer           │
│  @services/api           │
└──────────────────────────┘
```

---

## Core Architectural Patterns

### 1. Context-Based State Management

**Pattern:** Contexts manage domain-specific state and orchestrate business logic through services.

**Four Main Contexts:**

#### **ChatContext** (`core/contexts/ChatContext.tsx`)
- **Responsibility:** Chat selection, conversation loading, chat lifecycle
- **State:** `activeChat`, `messages`, `currentChat`, `orderedChats`
- **Use When:** Selecting chats, loading conversations, managing chat list
- **Dependencies:** MessageRepository, Redux (for conversation list)

#### **MessageContext** (`core/contexts/MessageContext.tsx`)
- **Responsibility:** Message composition, sending, media uploads
- **State:** `inputMessage`, `highlightedMessageId`, `replyToMessage`
- **Use When:** Sending messages, uploading media, managing message UI
- **Dependencies:** MessageRepository, Firebase Storage, Socket.IO

#### **UIContext** (`core/contexts/UIContext.tsx`)
- **Responsibility:** UI state (modals, sidebar, search)
- **State:** `modals`, `isSidebarOpen`, `searchTerm`, `searchResults`
- **Services Used:** SearchService (for indexed search)
- **Use When:** Opening modals, toggling sidebar, searching conversations

#### **AIContext** (`core/contexts/AIContext.tsx`)
- **Responsibility:** AI chatbot controls, node selection, inquiry handling
- **State:** `isAIEnabled`, `selectedNode`, `inquiryResponse`
- **Dependencies:** ChatContext (for active chat)

**Provider Nesting Order (IMPORTANT):**
```tsx
<ChatProvider>
  <MessageProvider>
    <UIProvider>
      <AIProvider>
        {children}
      </AIProvider>
    </UIProvider>
  </MessageProvider>
</ChatProvider>
```

**Why This Order:**
- AIProvider depends on ChatContext
- UIProvider needs chat data for search
- MessageProvider needs chat selection from ChatContext

---

### 2. Service Layer

**Pattern:** Services contain business logic, contexts orchestrate them.

#### **MessageQueueService** (`core/services/MessageQueueService.ts`)
**Purpose:** Process fetch queue for incoming messages
**Responsibilities:**
- Handle real-time message integration
- Detect and replace optimistic updates
- Manage cache invalidation
- Coordinate message fetching

**Usage:**
```typescript
const queueService = createMessageQueueService();

const results = await queueService.processQueue(
  queuedChatIds,
  { activeChat, currentMessages, currentChat, projectName },
  { repository, realtimeMessages }
);
```

#### **SearchService** (`core/services/SearchService.ts`)
**Purpose:** Fast indexed search across conversations and messages
**Technology:** MiniSearch (lightweight full-text search)
**Performance:** O(log n) indexed search vs O(n) linear scan

**Features:**
- Indexes conversations (phone, name, last message)
- Indexes messages for active chats
- Fuzzy matching support (optional)
- Fallback to cache for non-indexed chats

**Usage:**
```typescript
const searchService = createSearchService();

// Index conversations
searchService.indexConversations(lastMessages);

// Index active chat messages
searchService.indexChatMessages(chatId, messages);

// Perform search
const results = searchService.search(term, conversations, {
  activeChat,
  loadedMessages,
  projectName
});
```

#### **CacheService** (`core/services/CacheService.ts`)
**Purpose:** Multi-strategy caching with TTL and LRU eviction
**Strategies:**
- `localStorage` (default, 5-10MB limit)
- `IndexedDB` (for larger datasets)
- `memory` (for testing/dev)

**Usage:**
```typescript
const cache = createCacheService('localStorage');

// Set with TTL
await cache.set('messages-123', 'projectName', messages, 5 * 60 * 1000);

// Get
const cached = await cache.get('messages-123', 'projectName');

// Invalidate
await cache.invalidate('messages-123', 'projectName');
```

#### **SyncService** (`core/services/SyncService.ts`)
**Purpose:** WebSocket connection management and real-time sync
**Features:**
- Automatic reconnection
- Event subscription management
- Request/response correlation

---

### 3. Repository Pattern

**File:** `core/repositories/MessageRepository.ts`

**Purpose:** Data access layer that coordinates API, Redux, and Cache.

**Responsibilities:**
- Coordinate data fetching from multiple sources
- Manage fetch queue (prevent duplicate requests)
- Handle cache invalidation
- Dispatch Redux actions for state updates

**Key Methods:**
```typescript
class MessageRepository {
  // Load conversation messages
  async loadConversation(projectName: string, chatId: string): Promise<Conversation>

  // Mark conversation as read
  async markAsRead(projectName: string, chatId: string, chat: LastMessage): Promise<void>

  // Invalidate conversation cache
  async invalidateConversationCache(projectName: string, chatId: string): Promise<void>

  // Clear fetch queue
  clearFetchQueue(): void
}
```

---

### 4. Extension Slot System

**Pattern:** Plugin architecture for adding features without modifying core components.

**Inspiration:** WordPress hooks, VSCode extension API

#### **Available Slots:**

**Chat List Sidebar:**
- `sidebar-top` - Global actions, settings, filters
- `chat-list-toolbar` - Search filters, tabs, action buttons
- `sidebar-bottom` - Stats, footer, additional actions

**Chat View:**
- `chat-header-after` - Notifications, banners below header
- `message-view-before` - Pinned messages, context banners
- `message-view-after` - Floating action buttons, scroll indicators
- `message-item-actions` - Per-message actions (reactions, reply, forward)
- `message-input-before` - Quick replies, suggestions
- `message-input-after` - Send options, scheduled messages
- `message-input-toolbar` - Formatting buttons (bold, italic, etc.)

#### **Slot Usage:**

**Registering a component in a slot:**
```typescript
// In your feature's featureConfig.ts
export const myFeatureConfig: FeatureConfig = {
  id: 'my-feature',
  name: 'My Feature',
  version: '1.0.0',
  slots: {
    'message-item-actions': {
      component: MyActionButton,
      order: 10, // Lower numbers render first
    },
  },
};
```

**Rendering a slot:**
```tsx
// In core components
<Slot name="message-item-actions" data={{ message, chatId }} />
```

**Benefits:**
- ✅ Add features without modifying core code
- ✅ Features are isolated and independently testable
- ✅ Easy to enable/disable features
- ✅ No merge conflicts when multiple teams add features

---

## State Management Strategy

### Current Pattern: **Dual State (Context + Redux)**

**Context State (Primary):**
- UI state (active chat, messages being viewed)
- Transient state (input values, scroll positions)
- **Source of Truth** for current UI state

**Redux State (Legacy Cache):**
- Conversation list (`lastMessages`)
- Fetch queue (`fetchQueue`)
- Real-time messages (`realtimeMessages`)
- **Eventually will be migrated to Context + Service layer**

**Data Flow:**
```
User Action
    ↓
Context (orchestrates)
    ↓
Service (business logic)
    ↓
Repository (data access)
    ↓
├─▶ Cache (performance)
├─▶ Redux (dispatch for list updates)
└─▶ API (source of truth)
```

---

## Code Splitting Strategy

**Pattern:** Lazy load components that aren't always needed.

**Current Implementation:**
```typescript
// Modals are lazy loaded (only load when opened)
const InquiryModal = lazy(() => import('./InquiryModal'));
const NodeSelectionModal = lazy(() => import('./NodeSelectionModal'));

// Wrapped in Suspense
<Suspense fallback={null}>
  <InquiryModal isOpen={isOpen} {...props} />
</Suspense>
```

**Why NOT split main components:**
- ChatList, MessageView, MessageInput are always rendered
- Lazy loading them adds latency with no benefit
- Code splitting is for **conditionally rendered** features

**What TO split:**
- Modals (✅ Done)
- Feature components in slots (when registered)
- Route-level components (already done by React Router)

---

## Performance Optimizations

### 1. **Virtualization** (ChatList)
- Only renders visible items
- Threshold: 20+ items
- Uses `@tanstack/react-virtual`

### 2. **Memoization**
- Components wrapped in `React.memo`
- Callbacks wrapped in `useCallback`
- Computations wrapped in `useMemo`

### 3. **Indexed Search**
- MiniSearch provides O(log n) search
- Significantly faster than linear scan for 1000+ chats

### 4. **Caching**
- 3-tier cache (memory → localStorage → API)
- TTL-based expiration
- LRU eviction when quota exceeded

### 5. **Optimistic Updates**
- Messages appear immediately
- Replaced with server confirmation
- Automatic rollback on failure

---

## File Organization

```
src/features/messagesDashboard/
├── index.tsx                      # Entry point
├── featureConfig.ts               # Feature registry config
├── README.md                      # User guide
├── ARCHITECTURE.md                # This file
├── FEATURES.md                    # Feature documentation
│
├── components/                    # Main containers
│   ├── MessagesDashboardContainer/
│   ├── ChatListPanel/
│   ├── ChatViewPanel/
│   └── TestChatButton/
│
├── core/                          # Core infrastructure
│   ├── contexts/                  # State management
│   ├── services/                  # Business logic
│   ├── repositories/              # Data access
│   ├── slots/                     # Extension system
│   └── registry/                  # Feature loading
│
├── domains/                       # Domain components
│   ├── chat/components/
│   └── message/components/
│
└── hooks/                         # Custom hooks
```

---

## Adding New Features

### Example: Adding Message Reactions

**1. Create Feature File**
```typescript
// features/messageReactions/ReactionButton.tsx
export const ReactionButton: React.FC<{ message: Message }> = ({ message }) => {
  return <button onClick={() => addReaction(message.id, '👍')}>👍</button>;
};
```

**2. Register in Slot**
```typescript
// features/messageReactions/featureConfig.ts
export const reactionsFeatureConfig: FeatureConfig = {
  id: 'message-reactions',
  name: 'Message Reactions',
  version: '1.0.0',
  slots: {
    'message-item-actions': {
      component: ReactionButton,
      order: 1,
    },
  },
};
```

**3. Register Feature**
```typescript
// features/messagesDashboard/index.tsx
import { reactionsFeatureConfig } from '../messageReactions/featureConfig';

registry.register(reactionsFeatureConfig);
```

**That's it!** No changes to core components needed.

---

## Testing Strategy

### Unit Tests
- Services (SearchService, MessageQueueService)
- Utility functions
- Context logic (when extracted to hooks)

### Integration Tests
- Context + Service integration
- Repository + Cache + API coordination
- Slot system rendering

### Component Tests
- Individual components with mocked contexts
- User interaction flows
- Error states

---

## Future Improvements (Phase 2+)

### Recommended:
1. **Migrate Redux to Services**
   - Move `lastMessages` to ConversationService
   - Move `fetchQueue` to SyncService
   - Simplify state management to Context + Services only

2. **WebSocket Clustering**
   - Add Redis pub/sub for multi-server deployments
   - Handle connection failover
   - Load balancing

3. **IndexedDB Migration**
   - Move from localStorage to IndexedDB by default
   - Eliminate 5-10MB quota issues
   - Better performance for large datasets

4. **Performance Monitoring**
   - Add PerformanceMonitor (from CLAUDE.md)
   - Track slow renders
   - Monitor bundle size

5. **Offline-First Patterns**
   - Service worker for offline support
   - Queue mutations when offline
   - Sync when back online

### Nice to Have:
- Storybook for component documentation
- E2E tests with Playwright
- Bundle analyzer integration
- Analytics and error tracking

---

## Decision Log

### Why Context over Redux?
- **Simpler** for new developers to understand
- **Better TypeScript** integration
- **More flexible** for domain-specific logic
- **Easier testing** (no global store needed)

### Why Keep Redux (for now)?
- **Legacy code** already uses it
- **Migration risk** too high for Phase 1
- **Gradual migration** to services is safer

### Why Service Layer?
- **Separation of concerns** (UI vs business logic)
- **Reusability** across contexts
- **Testability** (services can be unit tested)
- **Maintainability** (complex logic isolated)

### Why Slot System?
- **Extensibility** for 100+ future features
- **Zero coupling** between features
- **Team scalability** (parallel development)
- **Feature toggles** built-in

---

## Questions?

For questions about this architecture, contact the frontend team or refer to:
- `README.md` - Feature overview
- `FEATURES.md` - Detailed feature documentation
- `CLAUDE.md` - Project-wide coding standards
