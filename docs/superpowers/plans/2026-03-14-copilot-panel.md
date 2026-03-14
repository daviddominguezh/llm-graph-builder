# Copilot Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Copilot chat panel to the agents section with session persistence, rich message rendering, and mock streaming responses.

**Architecture:** React Context provider at the AgentsLayout level via a `CopilotShell` client wrapper. State split across `useCopilotSessions` (CRUD + localStorage) and `useCopilotStreaming` (word-by-word reveal). Panel renders as a fixed overlay on the right side. Mutual exclusion with node/edge selection panel via shared context.

**Tech Stack:** React Context, localStorage, shadcn/ui (Button, Textarea, Select, Separator), lucide-react, next-intl, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-03-14-copilot-panel-design.md`

---

## Chunk 1: Types, Mocks, Translations, and Session Hook

### Task 1: Create shared type definitions

**Files:**
- Create: `packages/web/app/components/copilot/copilotTypes.ts`

- [ ] **Step 1: Create the types file**

```typescript
// copilotTypes.ts
export type CopilotTextBlock = {
  type: 'text';
  content: string;
};

export type CopilotActionBlock = {
  type: 'action';
  icon: string;
  title: string;
  description: string;
};

export type CopilotMessageBlock = CopilotTextBlock | CopilotActionBlock;

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: CopilotMessageBlock[];
  timestamp: number;
}

export interface CopilotSession {
  id: string;
  title: string;
  messages: CopilotMessage[];
  createdAt: number;
}

export interface CopilotPersistedState {
  sessions: CopilotSession[];
  activeSessionId: string | null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/copilot/copilotTypes.ts
git commit -m "feat(copilot): add shared type definitions"
```

---

### Task 2: Create mock response data

**Files:**
- Create: `packages/web/app/components/copilot/copilotMocks.ts`

- [ ] **Step 1: Create the mocks file**

Define 4 canned mock responses as `CopilotMessageBlock[]` arrays. Each response should reference graph concepts (nodes, edges, tools). At least 2 responses should include an `action` block.

```typescript
// copilotMocks.ts
import type { CopilotMessageBlock } from './copilotTypes';

const MOCK_RESPONSES: CopilotMessageBlock[][] = [
  [
    { type: 'text', content: 'I can help you set up a refund handling flow. Let me suggest a structure:' },
    { type: 'action', icon: 'plus-circle', title: 'Add node: Refund Handler', description: 'An agent node that processes refund requests and validates eligibility.' },
    { type: 'text', content: 'You can then connect it from your main router with an agent_decision edge.' },
  ],
  [
    { type: 'text', content: 'Looking at your graph, I notice the checkout node has no error handling path. I\'d recommend adding a fallback:' },
    { type: 'action', icon: 'git-branch', title: 'Add edge: Error fallback', description: 'A user_reply edge from Checkout to Error Handler for failed transactions.' },
  ],
  [
    { type: 'text', content: 'To integrate an external API, you should use a tool_call edge. This lets the agent invoke the tool and wait for the result before proceeding to the next node.' },
  ],
  [
    { type: 'text', content: 'Great question! Here\'s how I\'d restructure that flow:' },
    { type: 'action', icon: 'plus-circle', title: 'Add node: Intent Classifier', description: 'An agent_decision node that routes user requests to the appropriate handler.' },
    { type: 'action', icon: 'plus-circle', title: 'Add node: FAQ Responder', description: 'An agent node that handles common questions using a knowledge base tool.' },
    { type: 'text', content: 'Connect the Intent Classifier to each handler with agent_decision edges, using descriptive labels so the LLM knows when to route there.' },
  ],
];

let mockIndex = 0;

export function getNextMockResponse(): CopilotMessageBlock[] {
  const response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length]!;
  mockIndex++;
  return response;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/copilot/copilotMocks.ts
git commit -m "feat(copilot): add mock response data"
```

---

### Task 3: Add translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add the copilot namespace**

Add to `messages/en.json` at the top level, alphabetically after `common`:

```json
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
```

- [ ] **Step 2: Run format**

Run: `npm run format -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat(copilot): add translation keys"
```

---

### Task 4: Create the sessions hook with localStorage persistence

**Files:**
- Create: `packages/web/app/components/copilot/useCopilotSessions.ts`

This hook manages session CRUD and localStorage persistence with error handling.

- [ ] **Step 1: Create the hook file**

```typescript
// useCopilotSessions.ts
'use client';

import { useCallback, useRef, useState } from 'react';

import type { CopilotMessage, CopilotPersistedState, CopilotSession } from './copilotTypes';

const STORAGE_KEY = 'copilot-state';
const MAX_SESSIONS = 50;
const TITLE_MAX_LENGTH = 40;

// --- localStorage helpers (pure functions, no hooks) ---

function loadState(): CopilotPersistedState {
  // try/catch for corrupted JSON or unavailable localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { sessions: [], activeSessionId: null };
    return JSON.parse(raw) as CopilotPersistedState;
  } catch {
    return { sessions: [], activeSessionId: null };
  }
}

function saveState(state: CopilotPersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // QuotaExceededError or unavailable — silently drop
  }
}

// --- Hook ---

export interface UseCopilotSessionsReturn {
  sessions: CopilotSession[];
  activeSession: CopilotSession | null;
  createSession: () => string;
  switchSession: (id: string) => void;
  addMessage: (message: CopilotMessage) => void;
  updateLastMessage: (blocks: CopilotMessage['blocks']) => void;
}
```

The hook body should:
- Initialize from `loadState()` using lazy `useState` initializer.
- `createSession`: generate a new session with `crypto.randomUUID()`, enforce `MAX_SESSIONS` by removing oldest, set it as active, persist.
- `switchSession`: set active session id, persist.
- `addMessage`: append to active session's messages, auto-set title from first user message (truncated to `TITLE_MAX_LENGTH`), persist.
- `updateLastMessage`: replace the `blocks` of the last message in active session (used for streaming updates), persist.
- Use a `useRef` to hold current state for the persist helper (avoids stale closures).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint -w packages/web`
Expected: PASS (file should be under 150 lines, functions under 40)

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/copilot/useCopilotSessions.ts
git commit -m "feat(copilot): add sessions hook with localStorage persistence"
```

---

### Task 5: Create the streaming hook

**Files:**
- Create: `packages/web/app/components/copilot/useCopilotStreaming.ts`

This hook handles word-by-word mock streaming of assistant responses.

- [ ] **Step 1: Create the hook file**

The hook should:
- Accept callbacks: `addMessage`, `updateLastMessage` (from sessions hook).
- Expose: `isStreaming: boolean`, `startStreaming(userText: string): void`, `stopStreaming(): void`.
- `startStreaming`:
  1. Create a user message with a single `text` block and call `addMessage`.
  2. Call `getNextMockResponse()` to get the response blocks.
  3. Create an assistant message with empty `blocks: []` and call `addMessage`.
  4. Stream text blocks word-by-word (30ms per word via `setInterval`). Action blocks appear whole after the preceding text block finishes.
  5. Call `updateLastMessage` on each tick with the progressively-built blocks array.
  6. Set `isStreaming = false` when done.
- `stopStreaming`: clear the interval, finalize current state, set `isStreaming = false`.
- Clean up interval on unmount via `useEffect` return.
- Use `useRef` for the interval ID and current streaming state to avoid stale closures.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/copilot/useCopilotStreaming.ts
git commit -m "feat(copilot): add mock streaming hook"
```

---

## Chunk 2: Context Provider and Shell

### Task 6: Create CopilotProvider and CopilotShell

**Files:**
- Create: `packages/web/app/components/copilot/CopilotProvider.tsx`

This file defines the React Context, the provider that composes the sessions and streaming hooks, and the `CopilotShell` client component that wraps children with the provider and renders the button + panel.

- [ ] **Step 1: Create the provider file**

The context should expose:

```typescript
export interface CopilotContextValue {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  sessions: CopilotSession[];
  activeSession: CopilotSession | null;
  createSession: () => string;
  switchSession: (id: string) => void;
  sendMessage: (text: string) => void;
  stopStreaming: () => void;
  isStreaming: boolean;
}
```

- `CopilotProvider` composes `useCopilotSessions` and `useCopilotStreaming`.
- `sendMessage` calls `startStreaming(text)`.
- `useCopilotContext()` is the consumer hook (throws if used outside provider).
- `CopilotShell` is the `'use client'` wrapper:

```tsx
export function CopilotShell({ children }: { children: React.ReactNode }) {
  return (
    <CopilotProvider>
      {children}
      <CopilotButton />
      <CopilotPanel />
    </CopilotProvider>
  );
}
```

Note: `CopilotButton` and `CopilotPanel` don't exist yet — import them as stubs or add them in the next tasks. For now, comment out or use conditional imports. Best approach: create this file after Tasks 6-8 so all imports resolve, OR create placeholder files first.

**Recommended approach:** Create `CopilotProvider.tsx` with the context and provider logic. Export `CopilotShell` that just wraps children with the provider (no button/panel yet). We'll add those imports in Task 9.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/copilot/CopilotProvider.tsx
git commit -m "feat(copilot): add context provider and shell"
```

---

## Chunk 3: UI Components

### Task 7: Create CopilotButton

**Files:**
- Create: `packages/web/app/components/copilot/CopilotButton.tsx`

- [ ] **Step 1: Create the button component**

A floating wand button. Uses `useCopilotContext()` to toggle `isOpen`. Hidden when panel is open.

```tsx
// CopilotButton.tsx
'use client';

import { Button } from '@/components/ui/button';
import { WandSparkles } from 'lucide-react';

import { useCopilotContext } from './CopilotProvider';

export function CopilotButton() {
  const { isOpen, setOpen } = useCopilotContext();

  if (isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        variant="default"
        size="sm"
        className="h-12 w-12 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <WandSparkles className="size-5" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/copilot/CopilotButton.tsx
git commit -m "feat(copilot): add floating wand button"
```

---

### Task 8: Create CopilotInput

**Files:**
- Create: `packages/web/app/components/copilot/CopilotInput.tsx`

- [ ] **Step 1: Create the input component**

A textarea with send/stop button. Enter sends, Shift+Enter adds newline.

Props: `onSend: (text: string) => void`, `onStop: () => void`, `isStreaming: boolean`.

Key behaviors:
- `Textarea` with `rows={1}` and a max-height of 4 rows (use `max-h-[6rem]` + `overflow-y-auto` alongside `field-sizing-content` from the existing Textarea component).
- `Textarea` has `disabled={isStreaming}` — input is disabled during streaming per spec.
- Send button uses `ArrowUp` icon when idle, `Square` icon when streaming.
- Button disabled when text is empty and not streaming.
- `onKeyDown`: if `Enter` without `Shift`, prevent default and call `onSend`.
- Clear text after sending.
- All user-facing text uses `useTranslations('copilot')`.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/copilot/CopilotInput.tsx
git commit -m "feat(copilot): add chat input component"
```

---

### Task 9: Create CopilotMessages

**Files:**
- Create: `packages/web/app/components/copilot/CopilotMessages.tsx`

- [ ] **Step 1: Create the messages component**

This component renders the message list for the active session.

Key details:
- Accepts `messages: CopilotMessage[]` prop.
- Uses a `scrollRef` on the container div. Auto-scrolls to bottom via `useEffect` watching `messages.length` and the last message's block count.
- **Empty state**: When `messages.length === 0`, show centered `t('emptyState')` text.
- **User messages**: Right-aligned with `border-r-2 border-primary` (matching SimulationPanel pattern). Text content from the single text block.
- **Assistant messages**: Left-aligned, full-width. Iterate over `message.blocks`:
  - `text` block: `<p className="text-xs leading-relaxed">` with the content.
  - `action` block: A bordered card (`rounded-lg border p-3`) with:
    - A header row: lucide icon (use a map of icon name → component for the 3-4 icons used in mocks: `plus-circle`, `git-branch`) + bold title.
    - Description text below in `text-muted-foreground`.
- Use `useTranslations('copilot')` for any translated strings.

The icon map approach (rather than dynamic import) keeps this simple and avoids `any`:

```typescript
import { GitBranch, PlusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ACTION_ICONS: Record<string, LucideIcon> = {
  'plus-circle': PlusCircle,
  'git-branch': GitBranch,
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/copilot/CopilotMessages.tsx
git commit -m "feat(copilot): add message list and block rendering"
```

---

### Task 10: Create CopilotPanel and wire CopilotShell

**Files:**
- Create: `packages/web/app/components/copilot/CopilotPanel.tsx`
- Modify: `packages/web/app/components/copilot/CopilotProvider.tsx`

- [ ] **Step 1: Create the panel component**

The panel shell with header (session dropdown + close), messages area, and input area.

```tsx
// CopilotPanel.tsx — high-level structure
'use client';

export function CopilotPanel() {
  const { isOpen, setOpen, sessions, activeSession, createSession, switchSession, sendMessage, stopStreaming, isStreaming } = useCopilotContext();
  const t = useTranslations('copilot');

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 z-40 flex w-[400px] flex-col border-l bg-background shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-2 px-3">
        {/* Left: Session Select dropdown */}
        {/* Right: Close button (X icon) */}
      </div>

      {/* Messages */}
      <CopilotMessages messages={activeSession?.messages ?? []} />

      {/* Input */}
      <CopilotInput onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
    </div>
  );
}
```

Header details:
- Use shadcn `Select` component (wraps `@base-ui/react/select`, NOT Radix). Follow the existing usage pattern in the codebase (see `VersionSelector.tsx` or `ApiKeySelectSection.tsx` for reference). Pass `items` array prop and use `onValueChange` with `(value: string | null)` signature.
- Items: `t('newChat')` option (value `"new"`), then each session `{ value: session.id, label: session.title }` sorted by `createdAt` descending.
- `onValueChange`: if value is `"new"`, call `createSession()`. Otherwise call `switchSession(value)`.
- The `SelectTrigger` shows the active session title or `t('newChat')`.
- Close button: `<Button variant="ghost" size="sm">` with `<X />` icon, `aria-label={t('close')}`, calls `setOpen(false)`.

- [ ] **Step 2: Update CopilotShell to render button and panel**

In `CopilotProvider.tsx`, update `CopilotShell` to import and render `CopilotButton` and `CopilotPanel`:

```tsx
import { CopilotButton } from './CopilotButton';
import { CopilotPanel } from './CopilotPanel';

export function CopilotShell({ children }: { children: React.ReactNode }) {
  return (
    <CopilotProvider>
      {children}
      <CopilotButton />
      <CopilotPanel />
    </CopilotProvider>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `npm run lint -w packages/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/copilot/CopilotPanel.tsx packages/web/app/components/copilot/CopilotProvider.tsx
git commit -m "feat(copilot): add panel UI and wire shell"
```

---

## Chunk 4: Integration with Existing Code

### Task 11: Wire CopilotShell into AgentsLayout

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/(agents)/layout.tsx`

- [ ] **Step 1: Import and wrap with CopilotShell**

The layout is an async Server Component. Import `CopilotShell` (a `'use client'` component) and wrap `{children}` with it. The shell renders provider + button + panel around the children.

Change the return from:

```tsx
<div className="flex h-full p-1.5">
  <AgentsSidebar agents={agents} orgId={org.id} orgSlug={org.slug} />
  <div className="flex-1 overflow-hidden">{children}</div>
</div>
```

To:

```tsx
<div className="flex h-full p-1.5">
  <AgentsSidebar agents={agents} orgId={org.id} orgSlug={org.slug} />
  <CopilotShell>
    <div className="flex-1 overflow-hidden">{children}</div>
  </CopilotShell>
</div>
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run check -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/orgs/\\[slug\\]/\\(dashboard\\)/\\(agents\\)/layout.tsx
git commit -m "feat(copilot): wire CopilotShell into AgentsLayout"
```

---

### Task 12: Remove wand button from Toolbar

**Files:**
- Modify: `packages/web/app/components/panels/Toolbar.tsx`

- [ ] **Step 1: Remove the wand button div**

In `Toolbar.tsx`, remove lines 268-272 (the `div.absolute.bottom-0.right-1` containing the `WandSparkles` button):

```tsx
// DELETE this block:
<div className="absolute bottom-0 right-1 z-1">
  <Button variant="default" size="sm" className="h-12 w-12 rounded-full">
    <WandSparkles className="size-5" />
  </Button>
</div>
```

Also remove `WandSparkles` from the lucide-react import if it's no longer used anywhere in the file. Remove the `generate` translation usage if present.

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run check -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/Toolbar.tsx
git commit -m "refactor: remove wand button from toolbar (moved to CopilotButton)"
```

---

### Task 13: Add mutual exclusion with node/edge panel

**Files:**
- Modify: `packages/web/app/hooks/useGraphSelection.ts`
- Modify: `packages/web/app/components/GraphBuilder.tsx`

- [ ] **Step 1: Add setCopilotOpen to PanelCloseState**

In `useGraphSelection.ts`, add to the `PanelCloseState` interface:

```typescript
interface PanelCloseState {
  setGlobalPanelOpen: (v: boolean) => void;
  setPresetsOpen: (v: boolean) => void;
  setToolsOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setLibraryOpen: (v: boolean) => void;
  setCopilotOpen: (v: boolean) => void;  // ADD
}
```

In `useClickHandlers`, add `panels.setCopilotOpen(false)` to `onNodeClick` and `onEdgeClick` callbacks (alongside the existing `panels.setGlobalPanelOpen(false)` etc.).

In `onPaneClick`, add `panels.setCopilotOpen(false)`.

- [ ] **Step 2: Pass setCopilotOpen from GraphBuilder**

In `GraphBuilder.tsx`, import `useCopilotContext`:

```typescript
import { useCopilotContext } from './copilot/CopilotProvider';
```

In the `useGraphBuilderHooks` function (or `LoadedEditor`), consume the context:

```typescript
const copilot = useCopilotContext();
```

Add `setCopilotOpen: copilot.setOpen` to the `panels` memo. The dependency array stays `[]` because `copilot.setOpen` is a stable `useState` setter (from `CopilotProvider`'s `useState(false)`) — same reason the existing setters don't need to be in the array:

```typescript
const panels = useMemo(
  () => ({
    setGlobalPanelOpen,
    setPresetsOpen,
    setToolsOpen,
    setSearchOpen,
    setLibraryOpen,
    setCopilotOpen: copilot.setOpen,
  }),
  []
);
```

Also: when the copilot opens from the button, clear the node/edge selection AND close other panels. Add a `useEffect` in `GraphBuilder.tsx`:

```typescript
useEffect(() => {
  if (copilot.isOpen) {
    selection.setSelectedNodeId(null);
    selection.setSelectedEdgeId(null);
    setGlobalPanelOpen(false);
    setPresetsOpen(false);
    setToolsOpen(false);
  }
}, [copilot.isOpen, selection, setGlobalPanelOpen, setPresetsOpen, setToolsOpen]);
```

Note: all setters are stable `useState` dispatchers so they won't cause re-runs.

- [ ] **Step 3: Run full check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/hooks/useGraphSelection.ts packages/web/app/components/GraphBuilder.tsx
git commit -m "feat(copilot): add mutual exclusion with node/edge selection panel"
```

---

### Task 14: Final integration test

- [ ] **Step 1: Run full check suite**

Run: `npm run check`
Expected: All format, lint, typecheck pass for all packages.

- [ ] **Step 2: Manual verification**

Run: `npm run dev -w packages/web`

Verify:
1. Wand button appears fixed at bottom-right on the agents list page (no agent selected).
2. Clicking wand opens the Copilot panel on the right side.
3. Wand button hides when panel is open.
4. Can type a message and send it (Enter key or click button).
5. Mock response streams word-by-word.
6. Can create a new chat from dropdown.
7. Can switch between chats.
8. Closing panel and reopening resumes the last session.
9. When in the editor: clicking a node closes the Copilot. Clicking the wand reopens it with session intact.
10. Refreshing the page preserves sessions in localStorage.

- [ ] **Step 3: Commit any fixes**

If any issues found during manual testing, fix and commit.
