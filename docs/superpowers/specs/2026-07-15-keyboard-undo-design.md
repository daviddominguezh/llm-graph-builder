# Keyboard-First Foundation + Undo (⌘Z) — Design

**Date:** 2026-07-15
**Status:** Approved (pending final spec review)
**Package:** `packages/web`

## Context

Editing graphs in the workflow builder is rough. This project lays the foundation for a
keyboard-first editor experience and ships its first feature: **⌘Z / Ctrl+Z undo**.

Constraints set by the product owner:

- Undo history is **FE-only**: lost on page reload and on switching to another workflow
  (returning to a workflow gives an empty history).
- Undo must persist its effect to the DB by **letting the original action save and then
  overriding it** with new writes — correct whether the undone action was already flushed
  or still queued.
- ⌘Z inside a text input/textarea/contentEditable must do nothing (native browser text
  undo stays intact).
- Architecture must extend to future shortcuts (duplicate node, copy/paste, keyboard
  navigation, node/edge creation) **without duplicating mutation logic** — a shortcut is
  only a new caller of an existing action.
- Keyboard library: **react-hotkeys-hook** (new dependency).
- Scope of undoable mutations in v1: **canvas graph only** (nodes, edges, connections,
  node/edge properties). MCP servers, output schemas, agents, presets, and agent-mode
  config are not undoable yet.
- **Undo only** — no redo in this release (the stack design permits adding it later).
- Related fix folded in: side-panel text fields currently push one persistence operation
  **per keystroke**. They must commit per burst (debounce + blur), and one ⌘Z reverts the
  whole burst.

Decision history (from brainstorming):

- Snapshot-based history (Photoshop model) chosen over command-pattern inverses and
  op-log inversion: single-user-per-workflow editing, small immutable state with
  structural sharing, zero inverse-logic maintenance. Real-time multiplayer is not on the
  roadmap; if it ever is, the history strategy sits behind its own module boundary and can
  be swapped for per-action inverse ops without touching the action or keyboard layers.
- Snapshots are **shallow array copies** of immutably-updated React state. Untouched node
  objects stay reference-identical, so memoized node components bail out of re-render on
  undo — an undo renders exactly what the original edit rendered, never the whole canvas.

## Architecture

Three new modules in `packages/web/app`:

```
editor-actions/
  actionRegistry.ts        — EditorAction type + registry (pure TS, no React)
  useGraphEditorActions.ts — binds registry to editor state setters + op queue
editor-history/
  historyStore.ts          — EditorHistory snapshot stack (pure TS class)
  useGraphHistory.ts       — React binding: snapshot capture, undo execution, diff persistence
editor-keyboard/
  shortcuts.ts             — declarative shortcut table (EDITOR_SHORTCUTS)
  useEditorHotkeys.ts      — react-hotkeys-hook bindings, mounted once per GraphBuilder
```

Existing mutation logic (in `useGraphActions`, `useDeleteConfirmation`,
`useStructuredNodeCreation`, `nodePanelOps`, `edgePanelOps`, …) **stays where it is**.

### Action layer (keystone)

```ts
interface EditorAction<P = void> {
  id: string;          // 'node.delete', 'edge.connect', 'node.updateProps', …
  undoable: boolean;   // gates history snapshotting
  run: (params: P) => void;  // existing logic, unchanged
}
```

- `useGraphEditorActions` composes the existing hooks and exposes
  `dispatch(actionId, params)`.
- The registry wraps every `undoable` action with exactly one behavior: push a history
  snapshot **before** running. That is the entire coupling between actions and history.
- All callers converge on `dispatch`: dialogs, connection menu, toolbar, keyboard.
  A future shortcut (e.g. duplicate node) = register one action + add one table row.
- Non-undoable interactions (selection, zoom, panel open/close, auto-format) never go
  through the registry's undoable path and cannot pollute history.
- `history.undo` is itself a registered action with `undoable: false` — pressing ⌘Z must
  never snapshot (that would corrupt the stack).
- For text-field bursts, `dispatch` accepts an optional `preState` override (the state
  captured at field-session start) so the history entry predates the burst even though
  local state mutated per keystroke.

### History

```ts
class EditorHistory {
  push(entry: { nodes: Node[]; edges: Edge[]; coalesceKey?: string }): void;
  pop(): Entry | undefined;
  clear(): void;
  get depth(): number;
}
```

- Cap: 100 entries, drop oldest.
- Entries are shallow copies (`[...nodes]`, `[...edges]`). **Invariant:** all state
  updates are immutable (already true; React Flow's `useNodesState` requires it). Never
  deep-clone — deep cloning would both waste memory and break the no-rerender guarantee.
- **Coalescing:** if `coalesceKey` matches the top entry's key (same action + node +
  field within one focus session), the new push is dropped (the older pre-state wins).
  One ⌘Z then reverts the whole typing burst.
- No redo: undo is a plain `pop`. A later redo feature adds a second stack; the module
  boundary already isolates that change.

Undo execution (`useGraphHistory`):

1. `pop()`; empty stack → silent no-op.
2. `before = current {nodes, edges}`; `setNodes(snapshot.nodes)`; `setEdges(snapshot.edges)`.
3. Diff `before` vs `snapshot` — nodes keyed by `id`, edges by `(from, to)` — and push
   the operations **that transform `before` into `snapshot`**
   (`insertNode/updateNode/deleteNode/insertEdge/updateEdge/deleteEdge`, built with the
   existing `operationBuilders.ts`) into the existing operation queue.
4. The queue's strict flush serialization (2026-07 data-loss fix) guarantees convergence
   in both orderings: original ops flushed → undo ops override them; original ops still
   queued → both batches apply in order to the same final DB state. No cancellation logic.

Lifetime:

- Reload → in-memory instance, gone automatically.
- Workflow switch → `EditorCacheProvider` keeps editors **mounted but hidden**, so
  clearing must be explicit: `GraphBuilder` watches `isActiveEditor` and calls
  `history.clear()` on the active→inactive transition.

Auto-layout interaction: the editor auto-formats (Dagre) when node/edge count changes and
nodes are not user-draggable. Undo restoring a deleted node triggers auto-format exactly
like manual re-creation. Format is not an undoable action and never pushes history.

### Keyboard layer

```ts
interface ShortcutDef {
  id: string;                  // 'history.undo'
  keys: string;                // 'mod+z' (mod = ⌘ on macOS, Ctrl elsewhere)
  actionId: string;            // dispatched through the action registry
  description: string;         // future: command palette / shortcut help sheet
  enabled?: (ctx: ShortcutContext) => boolean;
}

export const EDITOR_SHORTCUTS: ShortcutDef[] = [
  { id: 'history.undo', keys: 'mod+z', actionId: 'history.undo', description: 'Undo last change' },
];
```

- `useEditorHotkeys` iterates the table, binding each with `useHotkeys`. Mounted once per
  `GraphBuilder`; gated on `isActiveEditor && !readOnly && !agentMode` so hidden cached
  editors never respond.
- Text-field safety is react-hotkeys-hook's default: events from
  `input`/`textarea`/`select`/contentEditable are ignored unless opted in. ⌘Z in a field
  keeps native browser text undo.
- **Migration (in scope):** the raw `keydown` listeners for Delete/Backspace
  (`useDeleteConfirmation`) and ⌘F (`useSearchKeyboard`) move into the table. This fixes
  a latent bug: those listeners stay attached in hidden cached editors today, so Delete
  pressed in workflow B could act on workflow A's state.

### Input-commit fix (`useCommittedField`)

Side-panel text fields (`NodePanel`, `EdgePanel`) currently push an update operation per
keystroke. New shared hook `useCommittedField`:

- Local/canvas state still updates per keystroke (live preview unchanged).
- The operation push moves to commit points: **800 ms typing idle or blur, whichever
  comes first**; blur/unmount flushes any pending commit. No-op commit when the value is
  unchanged.
- On field-session start (first change after focus), capture the pre-burst
  `{nodes, edges}` refs; commits dispatch the property-update action with that
  `preState` and a `coalesceKey` of `(actionId, nodeId, field)` so the whole burst is one
  undo entry even if the debounce commits mid-burst.

This also cuts save-batch noise dramatically, independent of undo.

## Error handling

- Undo with empty history: silent no-op (standard editor behavior; no toast).
- Diff produces zero ops (state identical): skip queue push entirely.
- Persistence failures of undo ops follow the existing queue behavior: requeued at the
  front, retried by autosave, surfaced by the existing `autoSaveFailed` toast and
  `[GraphSave#n]` debug logs. Undo does not add new failure UI.
- History overflow (>100): oldest entries dropped silently.

## Testing

- `EditorHistory` unit tests: cap/drop-oldest, clear, coalescing rules, shallow-copy
  invariant — after undo, untouched node objects are **reference-identical** (the
  no-full-rerender guarantee).
- Diff engine unit tests: node insert/update/delete, edge insert/update/delete,
  precondition changes, mixed batches; convergence test against a mocked queue for
  "undo after original ops already flushed" and "undo while original ops still queued".
- Hotkeys tests (jsdom): fires on mod+z; inert in inputs/contentEditable; inert when
  editor inactive or readOnly; Delete/⌘F migrations behave as before but only in the
  active editor.
- `useCommittedField` tests: debounce commit, blur flush, unmount flush, unchanged-value
  no-op, preState capture at session start.

## Out of scope (explicitly)

- Redo (⌘⇧Z / Ctrl+Y).
- Undo for MCP servers, output schemas, agents, presets, agent-mode config.
- Multiplayer-safe inverse operations (module boundary reserved).
- Command palette / shortcut help UI (the `description` field anticipates it).
- New user-facing strings (undo is silent; no translations needed in this slice).
