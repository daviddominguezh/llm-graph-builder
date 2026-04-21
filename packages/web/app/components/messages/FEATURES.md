# Messages Dashboard Features

This document explains how to create and register new features for the messages dashboard.

## Architecture Overview

The messages dashboard uses a **feature-based architecture** that allows you to add new functionality without modifying core code:

1. **Contexts** - Global state management (ChatContext, MessageContext, UIContext)
2. **Slots** - Extension points where features can inject UI components
3. **Feature Registry** - System for enabling/disabling features

## Creating a New Feature

### Step 1: Create Your Feature Component

Features are React components that can:
- Register UI components in slots
- Consume contexts (useChat, useMessage, useUI)
- Add new functionality without touching existing code

**Example**: `src/features/messagesDashboard/features/notes/NotesFeature.tsx`

```typescript
import React, { useEffect } from 'react';
import { useSlotManager } from '../../core/slots';
import { useChat } from '../../core/contexts';

const NotesButton: React.FC = () => {
  const { activeChat } = useChat();

  const handleClick = () => {
    console.log('Open notes for chat:', activeChat);
    // Your notes logic here
  };

  return (
    <button
      onClick={handleClick}
      className="tw:px-3 tw:py-1 tw:bg-blue-500 tw:text-white tw:rounded"
    >
      Notes
    </button>
  );
};

export const NotesFeature: React.FC = () => {
  const { registerSlot, unregisterSlot } = useSlotManager();

  useEffect(() => {
    // Register the notes button in the chat header
    registerSlot('chat-header-after', {
      id: 'notes-button',
      component: NotesButton,
      priority: 10,
    });

    // Cleanup on unmount
    return () => {
      unregisterSlot('chat-header-after', 'notes-button');
    };
  }, [registerSlot, unregisterSlot]);

  // Feature components don't render anything - they just register slots
  return null;
};
```

### Step 2: Register Your Feature

Add your feature to `featureConfig.ts`:

```typescript
import { NotesFeature } from './features/notes';

export const featureConfig: FeatureRegistryConfig = {
  features: [
    {
      config: {
        id: 'notes',
        name: 'Message Notes',
        description: 'Add private notes to conversations',
        category: 'productivity',
        enabled: true, // Enable by default
      },
      component: NotesFeature,
    },
  ],
  enabledFeatureIds: ['notes'], // Explicitly enable
};
```

### Step 3: Test Your Feature

That's it! Your feature will now:
- ✅ Automatically load when the dashboard loads
- ✅ Have access to all contexts
- ✅ Be able to inject UI anywhere via slots
- ✅ Clean up properly when unmounted

## Available Slots

Features can inject UI components into these slots:

### ChatViewPanel Slots

| Slot Name | Location | Use Case |
|-----------|----------|----------|
| `chat-header-after` | After chat header | Notifications, banners, alerts |
| `message-view-before` | Before message list | Pinned messages, context info |
| `message-view-after` | After message list | Floating actions, scroll to bottom |
| `message-input-before` | Before message input | Quick replies, suggestions, templates |
| `message-input-after` | After message input | Formatting toolbar, send options |

### ChatListPanel Slots

| Slot Name | Location | Use Case |
|-----------|----------|----------|
| `chat-list-toolbar` | After search bar | Filters, tabs, action buttons |

## Available Contexts

Features can access global state via these contexts:

### ChatContext

```typescript
const {
  activeChat,      // Current chat ID
  currentChat,     // Current chat data
  messages,        // Messages in current chat
  selectChat,      // Function to switch chats
  deleteChat,      // Function to delete a chat
  orderedChats,    // All chats sorted by timestamp
} = useChat();
```

### MessageContext

```typescript
const {
  inputMessage,    // Current input value
  setInputMessage, // Set input value
  sendMessage,     // Send a message
  sendMedia,       // Send media message
  highlightMessage, // Highlight a message
  replyToMessage,  // Reply to a message
} = useMessage();
```

### UIContext

```typescript
const {
  modals,          // All modal states
  openModal,       // Open a modal
  closeModal,      // Close a modal
  isModalOpen,     // Check if modal is open
  isSidebarOpen,   // Sidebar state
  setSidebarOpen,  // Set sidebar state
  searchTerm,      // Current search term
  setSearchTerm,   // Set search term
} = useUI();
```

## Feature Configuration Options

```typescript
interface FeatureConfig {
  id: string;              // Unique identifier
  name: string;            // Display name
  description?: string;    // What this feature does
  enabled?: boolean;       // Enable by default
  version?: string;        // Version for compatibility
  permissions?: string[];  // Required permissions
  category?: string;       // Category for organization
}
```

## Best Practices

### 1. Keep Features Self-Contained

Features should be independent modules that don't depend on each other:

```typescript
// ✅ Good - Self-contained
export const NotesFeature: React.FC = () => {
  // All notes logic here
  return null;
};

// ❌ Bad - Depends on another feature
export const NotesFeature: React.FC = () => {
  const { tagsData } = useTagsFeature(); // Don't do this!
  return null;
};
```

### 2. Clean Up Properly

Always unregister slots on unmount:

```typescript
useEffect(() => {
  registerSlot('slot-name', { ... });

  return () => {
    unregisterSlot('slot-name', 'slot-id');
  };
}, [registerSlot, unregisterSlot]);
```

### 3. Use Unique IDs

Ensure your slot IDs are unique across all features:

```typescript
// ✅ Good - Feature-prefixed ID
registerSlot('chat-header-after', {
  id: 'notes-header-button',
  component: NotesButton,
});

// ❌ Bad - Generic ID might conflict
registerSlot('chat-header-after', {
  id: 'button',
  component: NotesButton,
});
```

### 4. Handle Loading States

If your feature loads data, handle loading states:

```typescript
const NotesPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    loadNotes().then(data => {
      setNotes(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Loading notes...</div>;
  return <div>{/* Render notes */}</div>;
};
```

## Example Features

Here are some ideas for features you can build:

- **Notes** - Add private notes to conversations
- **Reminders** - Set reminders for follow-ups
- **Tags** - Tag conversations for organization
- **Templates** - Save and reuse message templates
- **Scheduled Messages** - Schedule messages to send later
- **Quick Actions** - Custom action buttons in chat header
- **Analytics** - Track conversation metrics
- **Typing Indicators** - Show when others are typing
- **Read Receipts** - Show when messages are read
- **Contact Info Panel** - Extended contact information
- **Media Gallery** - View all media from a conversation
- **Search Highlights** - Highlight search terms in messages

## Debugging Features

### Check if a Feature is Enabled

```typescript
const { isFeatureEnabled } = useFeatureRegistry();

if (isFeatureEnabled('notes')) {
  console.log('Notes feature is enabled');
}
```

### List All Enabled Features

```typescript
const { enabledFeatures } = useFeatureRegistry();

console.log('Enabled features:',
  enabledFeatures.map(f => f.config.name)
);
```

### Get Feature by ID

```typescript
const { getFeature } = useFeatureRegistry();

const notesFeature = getFeature('notes');
if (notesFeature) {
  console.log('Notes version:', notesFeature.config.version);
}
```

## Need Help?

Check these files for reference:
- `src/features/messagesDashboard/core/contexts/` - Context implementations
- `src/features/messagesDashboard/core/slots/` - Slot system
- `src/features/messagesDashboard/core/registry/` - Feature registry
- `MIGRATION_GUIDE.md` - Architecture migration details
