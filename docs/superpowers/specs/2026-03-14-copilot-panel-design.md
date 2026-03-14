# Copilot Panel Design Spec

## Overview

A chat-based AI assistant panel for the LLM Graph Builder. The Copilot lives at the agents-section level (not inside the canvas), persists across agent switches, and provides a rich conversational interface for graph-aware assistance. This phase implements UI only with mocked responses.

## Architecture

### Placement

- **CopilotProvider** — A client component (`CopilotShell.tsx`) wraps `AgentsLayout`'s `{children}`. Since `AgentsLayout` is an async Server Component, it cannot directly use a Context provider. Instead, `AgentsLayout` renders `<CopilotShell>{children}</CopilotShell>`, which is a `'use client'` component that wraps children with the provider and renders the button + panel.
- **CopilotButton** (floating wand icon) — Rendered inside `CopilotShell`, positioned `fixed bottom-4 right-4 z-50`. Always visible on the agents tab. Toggles the panel open/closed. When the panel is open, the button hides (the panel has its own close button).
- **CopilotPanel** — Rendered inside `CopilotShell` as a fixed overlay (`fixed right-0 top-0 bottom-0 z-40`, 400px wide). Overlays content rather than pushing layout. Visible on both the agents list page and the editor page.

### Mutual Exclusion with Node Panel

- `GraphBuilder.tsx` consumes `CopilotContext` via `useCopilotContext()`.
- On mount, it registers a `closeCopilot` callback from the context.
- In `useGraphSelection.ts`, the `onPaneClick` / node-click / edge-click handlers already receive a `panels` object with panel setters. A new `setCopilotOpen` is added to this object, sourced from the context.
- **Opening Copilot**: calls `panels.setGlobalPanelOpen(false)` and clears `selectedNodeId`/`selectedEdgeId` so the selection panel closes.
- **Clicking a node/edge**: calls `setCopilotOpen(false)` alongside the existing panel closures.
- **Reopening Copilot** via the wand button resumes the last active session (persisted `activeSessionId`).

### State Scope

The provider lives at the `AgentsLayout` level via `CopilotShell`, making it independent of any specific agent. The wand button and panel are visible whether or not an agent is selected.

## Panel Layout

Three vertical zones inside a `flex flex-col h-full` container:

### Header

- Left: Combobox/dropdown showing the current chat title. Selecting switches sessions. "New chat" option at the top of the list.
- Right: Close button (X icon) with `aria-label={t('close')}`.
- Styling: `border-b`, consistent with existing panel headers.

### Message Area

- `flex-1 overflow-y-auto`, auto-scrolls to bottom on new messages.
- **Empty state**: Centered text `t('emptyState')` when no messages in the session.
- **User messages**: Right-aligned, subtle primary-colored left border, text only.
- **AI messages**: Left-aligned, full-width. Content is a `CopilotMessageBlock[]` array (see Data Model). Block types:
  - `text` — Plain text paragraph.
  - `action` — Bordered card with icon, title, and description (e.g. "Add node: Refund Handler"). Static for now, structured for future interactivity.

### Input Area

- `border-t` separator.
- `Textarea` that auto-grows from 1 to 4 rows based on content.
- Send button (arrow-up icon), activates when text is non-empty.
- Enter sends, Shift+Enter adds newline.
- During streaming: send button shows stop icon, input is disabled.

## Chat Sessions

### Data Model

```typescript
interface CopilotMessageBlock {
  type: 'text';
  content: string;
} | {
  type: 'action';
  icon: string;        // lucide icon name (e.g. 'plus-circle', 'git-branch')
  title: string;
  description: string;
}

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: CopilotMessageBlock[];  // user messages have a single text block
  timestamp: number;
}

interface CopilotSession {
  id: string;              // crypto.randomUUID()
  title: string;           // first user message truncated to ~40 chars, or t('newChat')
  messages: CopilotMessage[];
  createdAt: number;       // Date.now()
}

interface CopilotPersistedState {
  sessions: CopilotSession[];
  activeSessionId: string | null;
}
```

### Persistence

Stored in `localStorage` under key `copilot-state` as a `CopilotPersistedState` object.

**Error handling:**
- `JSON.parse` is wrapped in try/catch. On corruption, falls back to empty state (no sessions, no active session).
- `localStorage.setItem` is wrapped in try/catch. On `QuotaExceededError`, old sessions are pruned (oldest first) until the write succeeds, or silently dropped if pruning doesn't help.
- If `localStorage` is unavailable (SSR, private browsing restrictions), state works in-memory only with no persistence.

**Session cap:** Maximum 50 sessions. When creating a new session that would exceed the cap, the oldest session is removed.

### Session Management

- **New chat**: Creates a fresh session, makes it active. Previous sessions remain in dropdown (up to 50).
- **Switch session**: Selecting from dropdown loads that session's messages.
- **Session title**: Auto-generated from first user message (truncated to ~40 chars). Shows `t('newChat')` until first message is sent.
- **Reopen**: Clicking the wand button reopens the last active session (`activeSessionId` persisted in localStorage), not a new one.

## Mock Streaming

1. User sends a message; an empty assistant message (empty `blocks` array) is appended immediately.
2. A canned mock response is selected (rotating through 3-4 responses that reference graph concepts). Each mock response is a `CopilotMessageBlock[]` array.
3. For `text` blocks: words are revealed one at a time with ~30ms intervals via `setInterval`. For `action` blocks: the entire card appears at once after the preceding text block finishes streaming.
4. During streaming: send button shows stop icon, input is disabled.
5. Mock responses include at least one `action` block to demonstrate rich card rendering.

## File Structure

```
packages/web/app/
├── components/
│   └── copilot/
│       ├── CopilotProvider.tsx    — React Context definition + CopilotShell wrapper component
│       ├── useCopilotSessions.ts  — Session CRUD, localStorage persistence, error handling
│       ├── useCopilotStreaming.ts  — Mock streaming logic (setInterval, word-by-word reveal)
│       ├── CopilotPanel.tsx       — Panel shell (header with dropdown, message area, input)
│       ├── CopilotMessages.tsx    — Message list + individual message/block rendering
│       ├── CopilotInput.tsx       — Textarea + send button
│       ├── CopilotButton.tsx      — Floating wand button (fixed position)
│       ├── copilotMocks.ts        — Canned mock responses as CopilotMessageBlock[] arrays
│       └── copilotTypes.ts        — Shared type definitions (CopilotSession, CopilotMessage, etc.)
```

### Existing File Changes

- **`app/orgs/[slug]/(dashboard)/(agents)/layout.tsx`** — Import `CopilotShell`. Wrap `{children}` with `<CopilotShell>{children}</CopilotShell>`.
- **`app/components/GraphBuilder.tsx`** — Consume `useCopilotContext()` to get `isOpen` and `setOpen`. Pass `setOpen` into the panels object for mutual exclusion. On copilot open, clear selection state.
- **`app/components/panels/Toolbar.tsx`** — Remove the wand button (`<Button>` with `<WandSparkles>`) from the bottom-right `div.absolute` and its associated imports if no longer used.
- **`messages/en.json`** — Add `copilot` translation namespace.

## Translations

```json
{
  "copilot": {
    "title": "Copilot",
    "newChat": "New chat",
    "placeholder": "Ask about your graph...",
    "send": "Send",
    "stop": "Stop",
    "close": "Close",
    "emptyState": "Ask me anything about your graph.",
    "selectChat": "Select a chat"
  }
}
```

## Constraints

- No `any` types. All TypeScript types explicit.
- No ESLint disables. Files under 300 lines, functions under 40 lines.
- Use shadcn/ui components (Button, Textarea, Select/Combobox, Separator).
- No `!important` in CSS/Tailwind.
- All user-facing text uses translations.
