# Messages Dashboard

A scalable, feature-based messaging dashboard architecture that supports hundreds of features without exponential complexity growth.

## 🏗️ Architecture

The dashboard uses a three-layer architecture:

```
┌─────────────────────────────────────────────────┐
│         Feature Registry (Top Layer)            │
│  Manages what features are enabled/disabled     │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│          Slot System (Middle Layer)             │
│   Extension points where features inject UI     │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│        Context System (Bottom Layer)            │
│    Global state (Chat, Message, UI)             │
└─────────────────────────────────────────────────┘
```

## 🚀 Phase 1 Improvements (2025)

Recent architectural enhancements to improve scalability, performance, and maintainability:

### **Service Layer Separation**
- ✅ **MessageQueueService** - Extracted 95 lines of queue processing logic from UI components
- ✅ **SearchService** - Indexed search using MiniSearch (O(log n) vs O(n) linear scan)
- ✅ Contexts now orchestrate services instead of containing business logic

### **Performance Optimizations**
- ✅ **Indexed Search** - Handles 1000+ chats without performance degradation
- ✅ **Code Splitting** - Modals lazy-loaded (only load when opened)
- ✅ **Reduced UIContext** - From 336 lines to ~230 lines by moving logic to services

### **Extensibility Enhancements**
- ✅ **9 Extension Slots** - Added 3 new slots for greater flexibility:
  - `sidebar-top`, `sidebar-bottom` - For filters, stats, global actions
  - `message-item-actions` - For reactions, reply, forward buttons
  - `message-input-toolbar` - For WYSIWYG editors, formatting buttons

### **Code Quality**
- ✅ **Removed Unused Code** - Deleted 551 lines of unused MessageService infrastructure
- ✅ **Better Separation** - Business logic in services, UI logic in components
- ✅ **All TypeScript** - Type-safe with proper interfaces throughout

### **Documentation**
- ✅ **ARCHITECTURE.md** - Comprehensive architecture documentation
- ✅ **Decision Log** - Documented architectural decisions and rationale

**See `ARCHITECTURE.md` for detailed information about the current architecture patterns.**

---

## 📁 Directory Structure

```
src/features/messagesDashboard/
├── components/              # Core UI components
│   ├── ChatListPanel/      # Left sidebar with chat list
│   ├── ChatViewPanel/      # Main chat view with messages
│   └── MessagesDashboardContainer/  # Top-level container
│
├── core/                   # Core infrastructure
│   ├── contexts/          # State management contexts
│   │   ├── ChatContext.tsx       # Chat selection & data
│   │   ├── MessageContext.tsx    # Message sending & interaction
│   │   └── UIContext.tsx         # UI state (modals, search)
│   │
│   ├── slots/             # UI extension point system
│   │   ├── SlotManager.tsx       # Slot registration & management
│   │   └── Slot.tsx              # Slot rendering component
│   │
│   └── registry/          # Feature management system
│       ├── types.ts              # Feature interfaces
│       └── FeatureRegistry.tsx   # Feature loading & enabling
│
├── domains/               # Domain-specific components
│   ├── chat/             # Chat-related components
│   └── message/          # Message-related components
│
├── hooks/                # Custom React hooks
│   ├── useChatSelection.ts
│   ├── useMessageSending.ts
│   └── useSearchMessages.ts
│
├── featureConfig.ts      # Feature configuration (add features here!)
├── FEATURES.md           # Guide for creating new features
├── MIGRATION_GUIDE.md    # Detailed migration documentation
└── README.md             # This file
```

## 🚀 Quick Start

### Adding a New Feature

1. **Create your feature component:**

```typescript
// src/features/messagesDashboard/features/notes/NotesFeature.tsx
import React, { useEffect } from 'react';
import { useSlotManager } from '../../core/slots';
import { useChat } from '../../core/contexts';

const NotesButton: React.FC = () => {
  const { activeChat } = useChat();

  return (
    <button onClick={() => console.log('Notes for', activeChat)}>
      Notes
    </button>
  );
};

export const NotesFeature: React.FC = () => {
  const { registerSlot, unregisterSlot } = useSlotManager();

  useEffect(() => {
    registerSlot('chat-header-after', {
      id: 'notes-button',
      component: NotesButton,
      priority: 10,
    });

    return () => unregisterSlot('chat-header-after', 'notes-button');
  }, [registerSlot, unregisterSlot]);

  return null;
};
```

2. **Register in `featureConfig.ts`:**

```typescript
import { NotesFeature } from './features/notes';

export const featureConfig: FeatureRegistryConfig = {
  features: [
    {
      config: {
        id: 'notes',
        name: 'Message Notes',
        description: 'Add notes to conversations',
        category: 'productivity',
        enabled: true,
      },
      component: NotesFeature,
    },
  ],
  enabledFeatureIds: ['notes'],
};
```

3. **Done!** Your feature will automatically load.

## 🎯 Available Slots

Features can inject UI at these extension points:

### ChatViewPanel
- `chat-header-after` - After chat header (notifications, banners)
- `message-view-before` - Before messages (pinned messages)
- `message-view-after` - After messages (floating buttons)
- `message-input-before` - Before input (quick replies)
- `message-input-after` - After input (formatting toolbar)

### ChatListPanel
- `chat-list-toolbar` - After search (filters, tabs)

## 🧩 Available Contexts

Access global state in your features:

```typescript
// Chat state
const { activeChat, currentChat, messages, selectChat } = useChat();

// Message operations
const { sendMessage, setInputMessage } = useMessage();

// UI state
const { openModal, searchTerm } = useUI();

// Feature registry
const { isFeatureEnabled, enabledFeatures } = useFeatureRegistry();
```

## 📚 Documentation

- **[FEATURES.md](./FEATURES.md)** - Comprehensive guide for creating features
- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Architecture migration details
- **[featureConfig.ts](./featureConfig.ts)** - Feature configuration file

## ✅ Architecture Benefits

### Before Migration
- ❌ 356-line monolithic container
- ❌ Adding features required modifying core code
- ❌ No clear separation of concerns
- ❌ Difficult to disable features
- ❌ High coupling between features

### After Migration
- ✅ 44-line container (92% reduction)
- ✅ Features are self-contained modules
- ✅ Clear separation: Contexts → Slots → Features
- ✅ Enable/disable via configuration
- ✅ Zero coupling between features

## 🎨 Example Feature Ideas

Want to contribute? Here are some feature ideas:

- **Notes** - Add private notes to conversations
- **Reminders** - Set follow-up reminders
- **Tags** - Tag and categorize chats
- **Templates** - Save message templates
- **Analytics** - Track conversation metrics
- **Scheduled Messages** - Schedule messages to send later
- **Quick Actions** - Custom action buttons
- **Media Gallery** - View all media from a chat
- **Contact Panels** - Extended contact information
- **Export** - Export conversation history

## 🔧 Development

```bash
# Type checking
npm run typecheck

# Start dev server
npm run dev

# Lint
npm run lint
```

## 📖 Further Reading

1. Start with [FEATURES.md](./FEATURES.md) to learn how to create features
2. Read [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for architecture details
3. Look at the code in `core/` to understand the infrastructure

## 🙋 Questions?

Check the documentation files or review the examples in:
- `core/contexts/` - Context implementations
- `core/slots/` - Slot system
- `core/registry/` - Feature registry

---

**Last Updated**: November 3, 2024
**Architecture Version**: 2.0 (Feature-Based)
