# Keyboard-First Foundation + Undo (⌘Z) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FE-only ⌘Z undo for the graph canvas, built on an extensible action-registry + declarative-shortcut foundation, plus commit-on-blur/debounce for side-panel text fields.

**Architecture:** Three new layers in `packages/web/app`: `editor-actions/` (action registry — the single mutation entry point), `editor-history/` (snapshot stack + state-diff persistence through the existing operation queue), `editor-keyboard/` (react-hotkeys-hook bindings from a declarative shortcut table). Existing mutation logic stays in its current hooks; the registry wraps it. Spec: `docs/superpowers/specs/2026-07-15-keyboard-undo-design.md`.

**Tech Stack:** React 19 / Next 16, @xyflow/react, react-hotkeys-hook v5, Jest (ESM via ts-jest) + @testing-library/react (jsdom), TypeScript strict.

## Global Constraints

- Never use `any`; never add `eslint-disable`; ESLint: `max-lines` 300, `max-lines-per-function` 40, `max-depth` 2 — split files/functions instead of compressing.
- Prettier: single quotes, 110 width, import sorting via `@trivago/prettier-plugin-sort-imports`.
- Never run `npm run check` (user runs it). Verify with `npm run typecheck -w packages/web`, `npx eslint <files>` and `npm run test -w packages/web -- --testPathPatterns=<pattern>`.
- Never run `npm run dev`. Stage files explicitly in commits (no `git add -A`, no `-am`).
- Web tests: ESM Jest. jsdom suites need `/** @jest-environment jsdom */` as the FIRST lines of the file. Mock modules with `jest.unstable_mockModule` BEFORE `await import(...)` of the module under test. NEVER `await import()` a module inside its own mock factory (OOM).
- Undo has no UI strings → no translations in this slice. If you add any user-facing text you MUST add it to `packages/web/messages/en.json`.
- History snapshots are SHALLOW copies. Never `structuredClone`/JSON-clone editor state.

---

### Task 1: `EditorHistory` snapshot stack

**Files:**
- Create: `packages/web/app/editor-history/historyStore.ts`
- Test: `packages/web/app/editor-history/__tests__/historyStore.test.ts`

**Interfaces:**
- Consumes: `Node<RFNodeData>`, `Edge<RFEdgeData>` from `@xyflow/react` / `app/utils/graphTransformers`.
- Produces (used by Tasks 2, 3, 6):
  ```ts
  export interface HistorySnapshot {
    nodes: Array<Node<RFNodeData>>;
    edges: Array<Edge<RFEdgeData>>;
  }
  export interface HistoryEntry extends HistorySnapshot {
    coalesceKey?: string;
  }
  export class EditorHistory {
    constructor(cap?: number);           // default 100
    push(entry: HistoryEntry): void;
    pop(): HistoryEntry | undefined;
    clear(): void;
    get depth(): number;
  }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from '@jest/globals';
import type { Node } from '@xyflow/react';

import type { RFNodeData } from '../../utils/graphTransformers';
import { EditorHistory } from '../historyStore';

function node(id: string): Node<RFNodeData> {
  return { id, type: 'agent', position: { x: 0, y: 0 }, data: { nodeId: id, text: '', description: '' } };
}

describe('EditorHistory', () => {
  it('pushes and pops entries LIFO', () => {
    const h = new EditorHistory();
    h.push({ nodes: [node('a')], edges: [] });
    h.push({ nodes: [node('a'), node('b')], edges: [] });
    expect(h.depth).toBe(2);
    expect(h.pop()?.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(h.pop()?.nodes.map((n) => n.id)).toEqual(['a']);
    expect(h.pop()).toBeUndefined();
  });

  it('stores shallow copies: mutating the pushed array later does not affect the entry', () => {
    const h = new EditorHistory();
    const nodes = [node('a')];
    h.push({ nodes, edges: [] });
    nodes.push(node('b'));
    expect(h.pop()?.nodes).toHaveLength(1);
  });

  it('preserves object references inside snapshots (structural sharing)', () => {
    const h = new EditorHistory();
    const a = node('a');
    h.push({ nodes: [a], edges: [] });
    expect(h.pop()?.nodes[0]).toBe(a);
  });

  it('caps at the given size, dropping oldest', () => {
    const h = new EditorHistory(2);
    h.push({ nodes: [node('1')], edges: [] });
    h.push({ nodes: [node('2')], edges: [] });
    h.push({ nodes: [node('3')], edges: [] });
    expect(h.depth).toBe(2);
    expect(h.pop()?.nodes[0]?.id).toBe('3');
    expect(h.pop()?.nodes[0]?.id).toBe('2');
  });

  it('coalesces consecutive entries with the same coalesceKey (oldest pre-state wins)', () => {
    const h = new EditorHistory();
    h.push({ nodes: [node('before-typing')], edges: [], coalesceKey: 'node.commitProps:a:text#1' });
    h.push({ nodes: [node('mid-typing')], edges: [], coalesceKey: 'node.commitProps:a:text#1' });
    expect(h.depth).toBe(1);
    expect(h.pop()?.nodes[0]?.id).toBe('before-typing');
  });

  it('does not coalesce different keys or undefined keys', () => {
    const h = new EditorHistory();
    h.push({ nodes: [node('1')], edges: [], coalesceKey: 'k#1' });
    h.push({ nodes: [node('2')], edges: [], coalesceKey: 'k#2' });
    h.push({ nodes: [node('3')], edges: [] });
    h.push({ nodes: [node('4')], edges: [] });
    expect(h.depth).toBe(4);
  });

  it('clear empties the stack', () => {
    const h = new EditorHistory();
    h.push({ nodes: [node('a')], edges: [] });
    h.clear();
    expect(h.depth).toBe(0);
    expect(h.pop()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPatterns=historyStore`
Expected: FAIL — cannot find module `../historyStore`.

- [ ] **Step 3: Implement `historyStore.ts`**

```ts
import type { Edge, Node } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';

export interface HistorySnapshot {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
}

export interface HistoryEntry extends HistorySnapshot {
  /** Entries with the same key merge: the oldest pre-state wins (typing bursts = one undo). */
  coalesceKey?: string;
}

const DEFAULT_CAP = 100;

/**
 * FE-only undo stack for the graph editor. Entries are SHALLOW copies of
 * immutably-updated React state — node/edge objects are shared between
 * entries (structural sharing), so pushes are O(n) pointer copies and
 * restoring a snapshot re-renders only the nodes that actually changed.
 */
export class EditorHistory {
  private stack: HistoryEntry[] = [];

  constructor(private readonly cap = DEFAULT_CAP) {}

  push(entry: HistoryEntry): void {
    const top = this.stack.at(-1);
    if (entry.coalesceKey !== undefined && top?.coalesceKey === entry.coalesceKey) return;

    this.stack = [...this.stack, { ...entry, nodes: [...entry.nodes], edges: [...entry.edges] }];
    if (this.stack.length > this.cap) {
      this.stack = this.stack.slice(this.stack.length - this.cap);
    }
  }

  pop(): HistoryEntry | undefined {
    const top = this.stack.at(-1);
    this.stack = this.stack.slice(0, -1);
    return top;
  }

  clear(): void {
    this.stack = [];
  }

  get depth(): number {
    return this.stack.length;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/web -- --testPathPatterns=historyStore`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npx eslint packages/web/app/editor-history --no-warn-ignored
npm run typecheck -w packages/web
git add packages/web/app/editor-history
git commit -m "feat(editor): EditorHistory snapshot stack with coalescing"
```

---

### Task 2: Graph state diff → operations

**Files:**
- Create: `packages/web/app/editor-history/graphDiff.ts`
- Test: `packages/web/app/editor-history/__tests__/graphDiff.test.ts`

**Interfaces:**
- Consumes: `HistorySnapshot` (Task 1); `buildInsertNodeOp/buildUpdateNodeOp/buildDeleteNodeOp/buildInsertEdgeOp/buildUpdateEdgeOp/buildDeleteEdgeOp` from `app/utils/operationBuilders`.
- Produces (used by Task 6):
  ```ts
  export function diffGraphStates(before: HistorySnapshot, after: HistorySnapshot): Operation[];
  ```
  Ops transform `before` (what the DB will hold after the original action saves) into `after` (the restored snapshot). Unchanged entities (reference-equal) emit nothing.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from '@jest/globals';
import type { Edge, Node } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { diffGraphStates } from '../graphDiff';

function node(id: string, text = ''): Node<RFNodeData> {
  return { id, type: 'agent', position: { x: 0, y: 0 }, data: { nodeId: id, text, description: '' } };
}

function edge(from: string, to: string, data?: RFEdgeData): Edge<RFEdgeData> {
  return { id: `${from}-${to}-0`, source: from, target: to, data };
}

describe('diffGraphStates', () => {
  it('returns no ops for identical states (shared references)', () => {
    const a = node('a');
    const e = edge('a', 'a');
    const state = { nodes: [a], edges: [e] };
    expect(diffGraphStates(state, { nodes: [a], edges: [e] })).toEqual([]);
  });

  it('emits insertNode for nodes only in after (undo of a delete)', () => {
    const a = node('a');
    const ops = diffGraphStates({ nodes: [], edges: [] }, { nodes: [a], edges: [] });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: 'insertNode', data: { nodeId: 'a' } });
  });

  it('emits deleteNode for nodes only in before (undo of a create)', () => {
    const ops = diffGraphStates({ nodes: [node('a')], edges: [] }, { nodes: [], edges: [] });
    expect(ops).toEqual([{ type: 'deleteNode', nodeId: 'a' }]);
  });

  it('emits updateNode when the node object changed', () => {
    const ops = diffGraphStates(
      { nodes: [node('a', 'new text')], edges: [] },
      { nodes: [node('a', 'old text')], edges: [] }
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: 'updateNode', data: { nodeId: 'a', text: 'old text' } });
  });

  it('restores edges alongside their restored node, nodes first', () => {
    const a = node('a');
    const b = node('b');
    const ab = edge('a', 'b', { preconditions: [{ type: 'user_said', value: 'hi', description: '' }] });
    const ops = diffGraphStates({ nodes: [a], edges: [] }, { nodes: [a, b], edges: [ab] });
    expect(ops.map((o) => o.type)).toEqual(['insertNode', 'insertEdge']);
    expect(ops[1]).toMatchObject({ type: 'insertEdge', data: { from: 'a', to: 'b' } });
  });

  it('emits deleteEdge before node deletes for removed edges (undo of a connect)', () => {
    const a = node('a');
    const b = node('b');
    const ab = edge('a', 'b');
    const ops = diffGraphStates({ nodes: [a, b], edges: [ab] }, { nodes: [a], edges: [] });
    expect(ops.map((o) => o.type)).toEqual(['deleteEdge', 'deleteNode']);
  });

  it('emits updateEdge when edge data changed (undo of a precondition edit)', () => {
    const a = node('a');
    const b = node('b');
    const beforeEdge = edge('a', 'b', { preconditions: [] });
    const afterEdge = edge('a', 'b', {
      preconditions: [{ type: 'user_said', value: 'yes', description: '' }],
    });
    const ops = diffGraphStates({ nodes: [a, b], edges: [beforeEdge] }, { nodes: [a, b], edges: [afterEdge] });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: 'updateEdge',
      data: { from: 'a', to: 'b', preconditions: [{ type: 'user_said', value: 'yes' }] },
    });
  });

  it('handles a rename (delete old id + insert new id + reconnect edges)', () => {
    const a = node('a');
    const renamed = node('a2');
    const ops = diffGraphStates(
      { nodes: [renamed], edges: [edge('a2', 'a2')] },
      { nodes: [a], edges: [edge('a', 'a')] }
    );
    const types = ops.map((o) => o.type).sort();
    expect(types).toEqual(['deleteEdge', 'deleteNode', 'insertEdge', 'insertNode']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPatterns=graphDiff`
Expected: FAIL — cannot find module `../graphDiff`.

- [ ] **Step 3: Implement `graphDiff.ts`**

Op ordering rule (matters because the backend applies sequentially and node deletes cascade edge deletes): `deleteEdge` → `deleteNode` → `insertNode` → `updateNode` → `insertEdge` → `updateEdge`.

```ts
import type { Operation } from '@daviddh/graph-types';
import type { Edge } from '@xyflow/react';

import type { RFEdgeData } from '../utils/graphTransformers';
import {
  buildDeleteEdgeOp,
  buildDeleteNodeOp,
  buildInsertEdgeOp,
  buildInsertNodeOp,
  buildUpdateEdgeOp,
  buildUpdateNodeOp,
} from '../utils/operationBuilders';
import type { HistorySnapshot } from './historyStore';

function edgeKey(e: Edge<RFEdgeData>): string {
  return `${e.source} ${e.target}`;
}

function diffNodes(before: HistorySnapshot, after: HistorySnapshot): { deletes: Operation[]; upserts: Operation[] } {
  const beforeById = new Map(before.nodes.map((n) => [n.id, n]));
  const afterById = new Map(after.nodes.map((n) => [n.id, n]));
  const deletes: Operation[] = [];
  const upserts: Operation[] = [];

  for (const n of before.nodes) {
    if (!afterById.has(n.id)) deletes.push(buildDeleteNodeOp(n.id));
  }
  for (const n of after.nodes) {
    const prev = beforeById.get(n.id);
    if (prev === undefined) {
      upserts.push(buildInsertNodeOp(n));
    } else if (prev !== n) {
      upserts.push(buildUpdateNodeOp(n));
    }
  }
  return { deletes, upserts };
}

function diffEdges(before: HistorySnapshot, after: HistorySnapshot): { deletes: Operation[]; upserts: Operation[] } {
  const beforeByKey = new Map(before.edges.map((e) => [edgeKey(e), e]));
  const afterByKey = new Map(after.edges.map((e) => [edgeKey(e), e]));
  const deletes: Operation[] = [];
  const upserts: Operation[] = [];

  for (const e of before.edges) {
    if (!afterByKey.has(edgeKey(e))) deletes.push(buildDeleteEdgeOp(e.source, e.target));
  }
  for (const e of after.edges) {
    const prev = beforeByKey.get(edgeKey(e));
    if (prev === undefined) {
      upserts.push(buildInsertEdgeOp(e.source, e.target, e.data));
    } else if (prev !== e) {
      upserts.push(buildUpdateEdgeOp(e.source, e.target, e.data));
    }
  }
  return { deletes, upserts };
}

/**
 * Operations that transform `before` into `after`. Used by undo: `before` is
 * the state being reverted (which the DB converges to via the serialized save
 * queue), `after` is the restored snapshot. Reference-equal entities emit
 * nothing — snapshots share object references with live state.
 */
export function diffGraphStates(before: HistorySnapshot, after: HistorySnapshot): Operation[] {
  const nodes = diffNodes(before, after);
  const edges = diffEdges(before, after);
  return [...edges.deletes, ...nodes.deletes, ...nodes.upserts, ...edges.upserts];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/web -- --testPathPatterns=graphDiff`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npx eslint packages/web/app/editor-history --no-warn-ignored
npm run typecheck -w packages/web
git add packages/web/app/editor-history
git commit -m "feat(editor): graph state diff producing persistence operations"
```

---

### Task 3: Action registry

**Files:**
- Create: `packages/web/app/editor-actions/actionRegistry.ts`
- Test: `packages/web/app/editor-actions/__tests__/actionRegistry.test.ts`

**Interfaces:**
- Consumes: `EditorHistory`, `HistorySnapshot` (Task 1).
- Produces (used by Tasks 5, 6, 7, 8):
  ```ts
  export interface DispatchOptions {
    preState?: HistorySnapshot;   // overrides the snapshot (text-burst sessions)
    coalesceKey?: string;         // merges consecutive entries (typing bursts)
  }
  export interface EditorActionDef<P = void> {
    id: string;
    undoable: boolean;
    run: (params: P) => void;
  }
  export class ActionRegistry {
    constructor(history: EditorHistory, getState: () => HistorySnapshot);
    register<P>(def: EditorActionDef<P>): void;   // throws on duplicate id
    dispatch<P>(id: string, params: P, opts?: DispatchOptions): void;  // throws on unknown id
  }
  export type Dispatch = ActionRegistry['dispatch'];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, jest } from '@jest/globals';

import { EditorHistory } from '../../editor-history/historyStore';
import type { HistorySnapshot } from '../../editor-history/historyStore';
import { ActionRegistry } from '../actionRegistry';

function makeRegistry(state: HistorySnapshot = { nodes: [], edges: [] }) {
  const history = new EditorHistory();
  const registry = new ActionRegistry(history, () => state);
  return { history, registry };
}

describe('ActionRegistry', () => {
  it('dispatch runs the registered action with params', () => {
    const { registry } = makeRegistry();
    const run = jest.fn();
    registry.register<{ nodeId: string }>({ id: 'node.delete', undoable: true, run });
    registry.dispatch('node.delete', { nodeId: 'a' });
    expect(run).toHaveBeenCalledWith({ nodeId: 'a' });
  });

  it('snapshots state BEFORE running an undoable action', () => {
    const state: HistorySnapshot = { nodes: [], edges: [] };
    const { registry, history } = makeRegistry(state);
    registry.register({
      id: 'mutate',
      undoable: true,
      run: () => {
        expect(history.depth).toBe(1);
      },
    });
    registry.dispatch('mutate', undefined);
    expect(history.depth).toBe(1);
  });

  it('does not snapshot non-undoable actions', () => {
    const { registry, history } = makeRegistry();
    registry.register({ id: 'search.toggle', undoable: false, run: () => undefined });
    registry.dispatch('search.toggle', undefined);
    expect(history.depth).toBe(0);
  });

  it('uses preState override and coalesceKey when provided', () => {
    const { registry, history } = makeRegistry({ nodes: [], edges: [] });
    const preState: HistorySnapshot = {
      nodes: [{ id: 'x', position: { x: 0, y: 0 }, data: { nodeId: 'x', text: '', description: '' } }],
      edges: [],
    };
    registry.register({ id: 'node.commitProps', undoable: true, run: () => undefined });
    registry.dispatch('node.commitProps', undefined, { preState, coalesceKey: 'k#1' });
    registry.dispatch('node.commitProps', undefined, { preState, coalesceKey: 'k#1' });
    expect(history.depth).toBe(1);
    expect(history.pop()?.nodes[0]?.id).toBe('x');
  });

  it('throws on duplicate registration and unknown dispatch', () => {
    const { registry } = makeRegistry();
    registry.register({ id: 'a', undoable: false, run: () => undefined });
    expect(() => registry.register({ id: 'a', undoable: false, run: () => undefined })).toThrow('a');
    expect(() => registry.dispatch('missing', undefined)).toThrow('missing');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPatterns=actionRegistry`
Expected: FAIL — cannot find module `../actionRegistry`.

- [ ] **Step 3: Implement `actionRegistry.ts`**

```ts
import type { EditorHistory, HistorySnapshot } from '../editor-history/historyStore';

export interface DispatchOptions {
  /** Snapshot to record instead of current state (pre-burst state for text sessions). */
  preState?: HistorySnapshot;
  /** Merges consecutive history entries produced by the same editing session. */
  coalesceKey?: string;
}

export interface EditorActionDef<P = void> {
  id: string;
  /** Undoable actions snapshot state (or opts.preState) before running. */
  undoable: boolean;
  run: (params: P) => void;
}

/**
 * Single entry point for editor mutations. Buttons, menus, and keyboard
 * shortcuts all dispatch actions by id — a new shortcut is a new caller of an
 * existing action, never duplicated mutation logic. The registry's only
 * coupling to undo: undoable actions push a history snapshot before running.
 */
export class ActionRegistry {
  private actions = new Map<string, EditorActionDef<never>>();

  constructor(
    private readonly history: EditorHistory,
    private readonly getState: () => HistorySnapshot
  ) {}

  register<P>(def: EditorActionDef<P>): void {
    if (this.actions.has(def.id)) throw new Error(`Action already registered: ${def.id}`);
    this.actions.set(def.id, def as EditorActionDef<never>);
  }

  dispatch<P>(id: string, params: P, opts?: DispatchOptions): void {
    const def = this.actions.get(id);
    if (def === undefined) throw new Error(`Unknown action: ${id}`);

    if (def.undoable) {
      const snapshot = opts?.preState ?? this.getState();
      this.history.push({ ...snapshot, coalesceKey: opts?.coalesceKey });
    }
    (def as EditorActionDef<P>).run(params);
  }
}

export type Dispatch = ActionRegistry['dispatch'];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/web -- --testPathPatterns=actionRegistry`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npx eslint packages/web/app/editor-actions --no-warn-ignored
npm run typecheck -w packages/web
git add packages/web/app/editor-actions
git commit -m "feat(editor): action registry with pre-run history snapshotting"
```

---

### Task 4: `useCommittedField` (debounce + blur commit)

**Files:**
- Create: `packages/web/app/editor-actions/useCommittedField.ts`
- Test: `packages/web/app/editor-actions/__tests__/useCommittedField.test.ts` (jsdom)

**Interfaces:**
- Consumes: `HistorySnapshot` (Task 1).
- Produces (used by Task 7):
  ```ts
  export interface CommittedFieldParams {
    value: string;                              // committed value from state
    fieldKey: string;                           // e.g. `${nodeId}:description`
    getState: () => HistorySnapshot;
    onLiveChange: (value: string) => void;      // per-keystroke local/canvas update
    onCommit: (commit: { value: string; preState: HistorySnapshot; coalesceKey: string }) => void;
    debounceMs?: number;                        // default 800
  }
  export function useCommittedField(params: CommittedFieldParams): {
    onChange: (value: string) => void;
    onBlur: () => void;
  };
  ```
  Behavior: first `onChange` after an idle/committed state opens a session — captures `preState = getState()` BEFORE applying the live change and mints `coalesceKey = ${fieldKey}#${sessionCounter}`. Commit fires on 800ms idle or blur (also on unmount); a commit with `value === last committed value` is a no-op. Multiple debounce commits within one focus session share the coalesceKey (one undo entry per burst).

- [ ] **Step 1: Write the failing tests**

```ts
/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';

import type { HistorySnapshot } from '../../editor-history/historyStore';
import type { CommittedFieldParams } from '../useCommittedField';
import { useCommittedField } from '../useCommittedField';

const DEBOUNCE = 800;

type Commit = Parameters<CommittedFieldParams['onCommit']>[0];

function setup(initial = 'hello') {
  const state: HistorySnapshot = { nodes: [], edges: [] };
  const live = jest.fn<(v: string) => void>();
  const commits: Commit[] = [];
  const props: CommittedFieldParams = {
    value: initial,
    fieldKey: 'node-1:text',
    getState: () => state,
    onLiveChange: live,
    onCommit: (c) => commits.push(c),
  };
  const hook = renderHook((p: CommittedFieldParams) => useCommittedField(p), { initialProps: props });
  return { hook, live, commits, props, state };
}

describe('useCommittedField', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('applies live changes per keystroke but does not commit until idle', () => {
    const { hook, live, commits } = setup();
    act(() => hook.result.current.onChange('h'));
    act(() => hook.result.current.onChange('he'));
    expect(live).toHaveBeenCalledTimes(2);
    expect(commits).toHaveLength(0);
    act(() => jest.advanceTimersByTime(DEBOUNCE));
    expect(commits).toHaveLength(1);
    expect(commits[0]?.value).toBe('he');
  });

  it('captures preState before the first keystroke of a session', () => {
    const { hook, commits, state } = setup();
    act(() => hook.result.current.onChange('x'));
    act(() => jest.advanceTimersByTime(DEBOUNCE));
    expect(commits[0]?.preState).toBe(state);
  });

  it('blur commits immediately and cancels the pending debounce', () => {
    const { hook, commits } = setup();
    act(() => hook.result.current.onChange('draft'));
    act(() => hook.result.current.onBlur());
    expect(commits).toHaveLength(1);
    act(() => jest.advanceTimersByTime(DEBOUNCE));
    expect(commits).toHaveLength(1);
  });

  it('debounce commits mid-burst share one coalesceKey; a new focus session mints a new one', () => {
    const { hook, commits } = setup();
    act(() => hook.result.current.onChange('a'));
    act(() => jest.advanceTimersByTime(DEBOUNCE));
    act(() => hook.result.current.onChange('ab'));
    act(() => hook.result.current.onBlur());
    expect(commits).toHaveLength(2);
    expect(commits[1]?.coalesceKey).toBe(commits[0]?.coalesceKey);

    act(() => hook.result.current.onChange('abc'));
    act(() => hook.result.current.onBlur());
    expect(commits[2]?.coalesceKey).not.toBe(commits[0]?.coalesceKey);
  });

  it('no-op commit when the value did not change', () => {
    const { hook, commits } = setup('same');
    act(() => hook.result.current.onChange('same'));
    act(() => hook.result.current.onBlur());
    expect(commits).toHaveLength(0);
  });

  it('flushes a pending commit on unmount', () => {
    const { hook, commits } = setup();
    act(() => hook.result.current.onChange('bye'));
    hook.unmount();
    expect(commits).toHaveLength(1);
    expect(commits[0]?.value).toBe('bye');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPatterns=useCommittedField`
Expected: FAIL — cannot find module `../useCommittedField`.

- [ ] **Step 3: Implement `useCommittedField.ts`**

Implementation notes: keep all session state in one `useRef` object (`{ preState, coalesceKey, lastCommitted, pending, timer, session }`); module-level counter for session ids; `useEffect` cleanup flushes pending commit on unmount; keep every function under 40 lines (extract `openSession`, `commit` helpers). `blur` closes the session (next change starts a new one); a debounce commit keeps the session open.

```ts
'use client';

import { useEffect, useRef } from 'react';

import type { HistorySnapshot } from '../editor-history/historyStore';

const DEFAULT_DEBOUNCE_MS = 800;

export interface CommittedFieldParams {
  value: string;
  fieldKey: string;
  getState: () => HistorySnapshot;
  onLiveChange: (value: string) => void;
  onCommit: (commit: { value: string; preState: HistorySnapshot; coalesceKey: string }) => void;
  debounceMs?: number;
}

interface FieldSession {
  preState: HistorySnapshot;
  coalesceKey: string;
}

interface FieldState {
  session: FieldSession | null;
  lastCommitted: string;
  pending: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

let sessionCounter = 0;

export function useCommittedField(params: CommittedFieldParams): {
  onChange: (value: string) => void;
  onBlur: () => void;
} {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const stateRef = useRef<FieldState>({
    session: null,
    lastCommitted: params.value,
    pending: null,
    timer: null,
  });

  const apiRef = useRef<{ onChange: (value: string) => void; onBlur: () => void } | null>(null);
  if (apiRef.current === null) {
    apiRef.current = buildFieldApi(stateRef.current, paramsRef);
  }

  useEffect(() => {
    const s = stateRef.current;
    const api = apiRef.current;
    return () => {
      if (s.timer !== null) clearTimeout(s.timer);
      api?.onBlur();
    };
  }, []);

  return apiRef.current;
}

function buildFieldApi(
  s: FieldState,
  paramsRef: React.RefObject<CommittedFieldParams>
): { onChange: (value: string) => void; onBlur: () => void } {
  const commit = (): void => {
    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = null;
    const { session, pending } = s;
    if (session === null || pending === null || pending === s.lastCommitted) return;
    s.lastCommitted = pending;
    s.pending = null;
    paramsRef.current.onCommit({ value: pending, preState: session.preState, coalesceKey: session.coalesceKey });
  };

  const onChange = (value: string): void => {
    if (s.session === null) {
      sessionCounter++;
      s.session = {
        preState: paramsRef.current.getState(),
        coalesceKey: `${paramsRef.current.fieldKey}#${String(sessionCounter)}`,
      };
    }
    s.pending = value;
    paramsRef.current.onLiveChange(value);
    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = setTimeout(commit, paramsRef.current.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  };

  const onBlur = (): void => {
    commit();
    s.session = null;
  };

  return { onChange, onBlur };
}
```

(If ESLint complains about function length or ref-access rules, split `buildFieldApi` further into `createCommit` / `createOnChange` helpers in the same file — same pattern as `operationQueueCore`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/web -- --testPathPatterns=useCommittedField`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npx eslint packages/web/app/editor-actions --no-warn-ignored
npm run typecheck -w packages/web
git add packages/web/app/editor-actions
git commit -m "feat(editor): useCommittedField debounce+blur commit hook"
```

---

### Task 5: Keyboard layer (shortcut table + bindings)

**Files:**
- Create: `packages/web/app/editor-keyboard/shortcuts.ts`
- Create: `packages/web/app/editor-keyboard/EditorHotkeys.tsx`
- Test: `packages/web/app/editor-keyboard/__tests__/EditorHotkeys.test.tsx` (jsdom)
- Modify: `packages/web/package.json` (add dependency)

**Interfaces:**
- Consumes: `Dispatch` type (Task 3).
- Produces (used by Task 6):
  ```ts
  // shortcuts.ts
  export interface ShortcutContext { searchOpen: boolean }
  export interface ShortcutDef {
    id: string;
    keys: string;                 // react-hotkeys-hook syntax, e.g. 'mod+z'
    actionId: string;
    description: string;
    enableOnFormTags?: boolean;   // default false — hotkey inert in inputs
    enabled?: (ctx: ShortcutContext) => boolean;
  }
  export const EDITOR_SHORTCUTS: ShortcutDef[];
  // EditorHotkeys.tsx
  export function EditorHotkeys(props: {
    dispatch: Dispatch;
    active: boolean;              // isActiveEditor && !readOnly && !agentMode
    ctx: ShortcutContext;
  }): React.ReactNode;            // renders null; one <ShortcutBinding> per table row
  ```

- [ ] **Step 1: Install react-hotkeys-hook**

```bash
npm i -w packages/web react-hotkeys-hook@^5
```

- [ ] **Step 2: Write the failing tests**

Note: one `ShortcutBinding` child component per table row keeps `useHotkeys` out of loops (rules-of-hooks). Test through the public `EditorHotkeys` component by firing real `KeyboardEvent`s at `document`.

```tsx
/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react';

import type { Dispatch } from '../../editor-actions/actionRegistry';
import { EditorHotkeys } from '../EditorHotkeys';

function pressUndo(target: EventTarget = document.body): void {
  const event = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
}

function makeDispatch(): { dispatch: Dispatch; calls: string[] } {
  const calls: string[] = [];
  const dispatch = ((id: string) => {
    calls.push(id);
  }) as unknown as Dispatch;
  return { dispatch, calls };
}

describe('EditorHotkeys', () => {
  it('dispatches history.undo on mod+z when active', () => {
    const { dispatch, calls } = makeDispatch();
    render(<EditorHotkeys dispatch={dispatch} active={true} ctx={{ searchOpen: false }} />);
    pressUndo();
    expect(calls).toContain('history.undo');
  });

  it('does nothing when inactive (hidden cached editor / readOnly / agent mode)', () => {
    const { dispatch, calls } = makeDispatch();
    render(<EditorHotkeys dispatch={dispatch} active={false} ctx={{ searchOpen: false }} />);
    pressUndo();
    expect(calls).toHaveLength(0);
  });

  it('is inert while typing in an input (native text undo preserved)', () => {
    const { dispatch, calls } = makeDispatch();
    render(
      <div>
        <EditorHotkeys dispatch={dispatch} active={true} ctx={{ searchOpen: false }} />
        <input data-testid="field" />
      </div>
    );
    const input = document.querySelector('input');
    input?.focus();
    if (input) pressUndo(input);
    expect(calls).toHaveLength(0);
  });

  it('is inert in contentEditable elements', () => {
    const { dispatch, calls } = makeDispatch();
    render(<EditorHotkeys dispatch={dispatch} active={true} ctx={{ searchOpen: false }} />);
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.appendChild(editable);
    pressUndo(editable);
    expect(calls).toHaveLength(0);
  });

  it('respects per-shortcut enabled(ctx) gating', () => {
    const { dispatch, calls } = makeDispatch();
    render(<EditorHotkeys dispatch={dispatch} active={true} ctx={{ searchOpen: false }} />);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    expect(calls).not.toContain('search.close'); // searchOpen: false → disabled
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPatterns=EditorHotkeys`
Expected: FAIL — cannot find module `../EditorHotkeys`.

- [ ] **Step 4: Implement `shortcuts.ts` and `EditorHotkeys.tsx`**

`shortcuts.ts` (Delete/⌘F/Escape rows are added in Task 8 — start with undo only):

```ts
export interface ShortcutContext {
  searchOpen: boolean;
}

export interface ShortcutDef {
  id: string;
  keys: string;
  actionId: string;
  description: string;
  enableOnFormTags?: boolean;
  enabled?: (ctx: ShortcutContext) => boolean;
}

/**
 * Declarative editor shortcut table — the single place future shortcuts are
 * added. Each row binds keys to an action id dispatched through the action
 * registry; `description` feeds a future shortcut-help / command palette.
 */
export const EDITOR_SHORTCUTS: ShortcutDef[] = [
  { id: 'history.undo', keys: 'mod+z', actionId: 'history.undo', description: 'Undo last change' },
];
```

`EditorHotkeys.tsx`:

```tsx
'use client';

import { useHotkeys } from 'react-hotkeys-hook';

import type { Dispatch } from '../editor-actions/actionRegistry';
import type { ShortcutContext, ShortcutDef } from './shortcuts';
import { EDITOR_SHORTCUTS } from './shortcuts';

interface EditorHotkeysProps {
  dispatch: Dispatch;
  /** isActiveEditor && !readOnly && !agentMode — hidden cached editors must not respond. */
  active: boolean;
  ctx: ShortcutContext;
}

interface ShortcutBindingProps extends EditorHotkeysProps {
  def: ShortcutDef;
}

function ShortcutBinding({ def, dispatch, active, ctx }: ShortcutBindingProps) {
  const enabled = active && (def.enabled?.(ctx) ?? true);

  useHotkeys(
    def.keys,
    () => {
      dispatch(def.actionId, undefined);
    },
    {
      enabled,
      preventDefault: true,
      enableOnFormTags: def.enableOnFormTags === true ? ['input', 'textarea', 'select'] : false,
      enableOnContentEditable: def.enableOnFormTags === true,
    },
    [dispatch, enabled]
  );

  return null;
}

/** Mounts one hotkey binding per EDITOR_SHORTCUTS row. Renders nothing. */
export function EditorHotkeys(props: EditorHotkeysProps) {
  return (
    <>
      {EDITOR_SHORTCUTS.map((def) => (
        <ShortcutBinding key={def.id} def={def} {...props} />
      ))}
    </>
  );
}
```

(Verify the exact `enableOnFormTags` option shape against the installed react-hotkeys-hook v5 typings — v4/v5 accept `boolean | FormTags[]`; adjust to the typings if they differ, without `any`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -w packages/web -- --testPathPatterns=EditorHotkeys`
Expected: PASS (5 tests).

- [ ] **Step 6: Lint, typecheck, commit**

```bash
npx eslint packages/web/app/editor-keyboard --no-warn-ignored
npm run typecheck -w packages/web
git add packages/web/app/editor-keyboard packages/web/package.json package-lock.json
git commit -m "feat(editor): declarative shortcut table bound via react-hotkeys-hook"
```

---

### Task 6: Wire history + actions + hotkeys into GraphBuilder

**Files:**
- Create: `packages/web/app/editor-actions/useEditorIntegration.ts`
- Create: `packages/web/app/editor-history/useGraphHistory.ts`
- Test: `packages/web/app/editor-history/__tests__/useGraphHistory.test.ts` (jsdom)
- Modify: `packages/web/app/components/GraphBuilder.tsx` (inside `useGraphBuilderHooks` and `LoadedEditor`)

**Interfaces:**
- Consumes: everything from Tasks 1–3, 5; existing `useGraphActions`, `useDeleteConfirmation`, `useStructuredNodeCreation` return values; `opQueue.pushOperation`; `useEditorCache().activeEditorId`.
- Produces (used by Tasks 7, 8):
  ```ts
  // useGraphHistory.ts
  export function useGraphHistory(params: {
    getState: () => HistorySnapshot;
    setNodes: (nodes: Array<Node<RFNodeData>>) => void;
    setEdges: (edges: Array<Edge<RFEdgeData>>) => void;
    pushOperation: PushOperation;
  }): { history: EditorHistory; undo: () => void };

  // useEditorIntegration.ts — builds registry, registers all v1 actions, returns
  export interface EditorIntegration {
    dispatch: Dispatch;
    history: EditorHistory;
    getState: () => HistorySnapshot;
  }
  ```
- Registered actions (v1):

  | id | undoable | delegates to |
  |---|---|---|
  | `history.undo` | no | `useGraphHistory().undo` |
  | `node.add` | yes | `graphActions.handleAddNode` |
  | `edge.connect` | yes | `graphActions.onConnect(params)` |
  | `menu.selectNode` | yes | `graphActions.handleConnectionMenuSelectNode(targetNodeId)` |
  | `menu.createNode` | yes | `graphActions.handleConnectionMenuCreateNode` |
  | `menu.createUserNode` | yes | `createUserNode` |
  | `menu.createToolNode` | yes | `createToolNode(params)` |
  | `menu.createIfElse` | yes | `createIfElse` |
  | `menu.createLoop` | yes | `createLoop` |
  | `graph.confirmDelete` | yes | `deleteConfirmation.confirmDelete` |
  | `node.commitProps` | yes | pushes `buildUpdateNodeOp` for the given node (Task 7 wires callers) |
  | `edge.updateProps` | yes | `pushUpdateEdge` for the given edge (Task 7 wires callers) |

- [ ] **Step 1: Write the failing tests for `useGraphHistory`**

```ts
/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { Operation } from '@daviddh/graph-types';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { useGraphHistory } from '../useGraphHistory';

function node(id: string, text = ''): Node<RFNodeData> {
  return { id, type: 'agent', position: { x: 0, y: 0 }, data: { nodeId: id, text, description: '' } };
}

function setup(initialNodes: Array<Node<RFNodeData>>) {
  let nodes = initialNodes;
  let edges: Array<Edge<RFEdgeData>> = [];
  const ops: Operation[] = [];
  const hook = renderHook(() =>
    useGraphHistory({
      getState: () => ({ nodes, edges }),
      setNodes: (n) => {
        nodes = n;
      },
      setEdges: (e) => {
        edges = e;
      },
      pushOperation: (op) => ops.push(op),
    })
  );
  return { hook, ops, getNodes: () => nodes };
}

describe('useGraphHistory', () => {
  it('undo restores the popped snapshot and persists the diff', () => {
    const a = node('a');
    const { hook, ops, getNodes } = setup([a, node('b')]);
    act(() => hook.result.current.history.push({ nodes: [a], edges: [] }));

    act(() => hook.result.current.undo());

    expect(getNodes().map((n) => n.id)).toEqual(['a']);
    expect(ops).toEqual([{ type: 'deleteNode', nodeId: 'b' }]);
  });

  it('untouched nodes stay reference-identical after undo (no full rerender)', () => {
    const a = node('a');
    const { hook, getNodes } = setup([a, node('b')]);
    act(() => hook.result.current.history.push({ nodes: [a], edges: [] }));
    act(() => hook.result.current.undo());
    expect(getNodes()[0]).toBe(a);
  });

  it('undo on empty history is a silent no-op', () => {
    const { hook, ops, getNodes } = setup([node('a')]);
    act(() => hook.result.current.undo());
    expect(ops).toHaveLength(0);
    expect(getNodes()).toHaveLength(1);
  });

  it('identical snapshot produces no ops and no state churn', () => {
    const a = node('a');
    const { hook, ops } = setup([a]);
    act(() => hook.result.current.history.push({ nodes: [a], edges: [] }));
    act(() => hook.result.current.undo());
    expect(ops).toHaveLength(0);
  });

  it('history instance is stable across rerenders', () => {
    const { hook } = setup([node('a')]);
    const first = hook.result.current.history;
    hook.rerender();
    expect(hook.result.current.history).toBe(first);
  });

  it('DB converges whether the undone ops were flushed or still queued', async () => {
    // Simulated DB: applies node ops in order, keyed by nodeId.
    const db = new Map<string, string>();
    const applyOps = (ops: Operation[]): void => {
      for (const op of ops) {
        if (op.type === 'insertNode' || op.type === 'updateNode') db.set(op.data.nodeId, op.data.text);
        if (op.type === 'deleteNode') db.delete(op.nodeId);
      }
    };

    const runScenario = async (flushBetween: boolean): Promise<Map<string, string>> => {
      db.clear();
      db.set('a', '');
      const { OperationQueueCore } = await import('../../hooks/operationQueueCore');
      const queue = new OperationQueueCore(async (ops) => applyOps(ops), () => undefined);

      const a = node('a');
      const { hook } = (() => {
        let nodes = [a, node('b', 'created')];
        return {
          hook: renderHook(() =>
            useGraphHistory({
              getState: () => ({ nodes, edges: [] }),
              setNodes: (n) => {
                nodes = n;
              },
              setEdges: () => undefined,
              pushOperation: (op) => queue.push(op),
            })
          ),
        };
      })();

      // The original action (create node b) already pushed its op:
      queue.push({ type: 'insertNode', data: { nodeId: 'b', text: 'created', kind: 'agent' } });
      if (flushBetween) await queue.flush(); // scenario 1: original op reached the DB first

      act(() => hook.result.current.history.push({ nodes: [a], edges: [] }));
      act(() => hook.result.current.undo());
      await queue.flush();
      return new Map(db);
    };

    const flushedFirst = await runScenario(true);
    const queuedTogether = await runScenario(false);
    expect(flushedFirst).toEqual(queuedTogether); // both end without node b
    expect(flushedFirst.has('b')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPatterns=useGraphHistory`
Expected: FAIL — cannot find module `../useGraphHistory`.

- [ ] **Step 3: Implement `useGraphHistory.ts`**

```ts
'use client';

import type { Edge, Node } from '@xyflow/react';
import { useCallback, useState } from 'react';

import type { PushOperation } from '../utils/operationBuilders';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { diffGraphStates } from './graphDiff';
import type { HistorySnapshot } from './historyStore';
import { EditorHistory } from './historyStore';

interface UseGraphHistoryParams {
  getState: () => HistorySnapshot;
  setNodes: (nodes: Array<Node<RFNodeData>>) => void;
  setEdges: (edges: Array<Edge<RFEdgeData>>) => void;
  pushOperation: PushOperation;
}

/**
 * Undo execution: pop the snapshot, restore it, and persist the state diff
 * through the operation queue. The queue's serialized flushing makes the DB
 * converge whether the undone action's ops were already flushed or still
 * queued (undo ops simply apply after them).
 */
export function useGraphHistory(params: UseGraphHistoryParams): { history: EditorHistory; undo: () => void } {
  const [history] = useState(() => new EditorHistory());

  const { getState, setNodes, setEdges, pushOperation } = params;

  const undo = useCallback(() => {
    const entry = history.pop();
    if (entry === undefined) return;

    const before = getState();
    setNodes(entry.nodes);
    setEdges(entry.edges);

    for (const op of diffGraphStates(before, entry)) {
      pushOperation(op);
    }
  }, [history, getState, setNodes, setEdges, pushOperation]);

  return { history, undo };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/web -- --testPathPatterns=useGraphHistory`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement `useEditorIntegration.ts`**

This hook is called from `useGraphBuilderHooks` AFTER `graphActions`, `deleteConfirmation`, and the four structured-creation callbacks exist. It owns the registry and registers the action table above.

```ts
'use client';

import type { Connection, Edge, Node } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { PushOperation } from '../utils/operationBuilders';
import { buildUpdateNodeOp } from '../utils/operationBuilders';
import { buildUpdateEdgeOp } from '../utils/operationBuilders';
import type { HistorySnapshot } from '../editor-history/historyStore';
import { useGraphHistory } from '../editor-history/useGraphHistory';
import type { Dispatch } from './actionRegistry';
import { ActionRegistry } from './actionRegistry';
import type { EditorHistory } from '../editor-history/historyStore';

export interface EditorIntegrationParams {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  setNodes: (nodes: Array<Node<RFNodeData>>) => void;
  setEdges: (edges: Array<Edge<RFEdgeData>>) => void;
  pushOperation: PushOperation;
  isActiveEditor: boolean;
  callbacks: {
    handleAddNode: () => void;
    onConnect: (params: Connection) => void;
    handleConnectionMenuSelectNode: (targetNodeId: string) => void;
    handleConnectionMenuCreateNode: () => void;
    createUserNode: () => void;
    createToolNode: (params: { providerType: 'builtin' | 'mcp'; providerId: string; toolName: string }) => void;
    createIfElse: () => void;
    createLoop: () => void;
    confirmDelete: () => void;
  };
}

export interface EditorIntegration {
  dispatch: Dispatch;
  history: EditorHistory;
  getState: () => HistorySnapshot;
}
```

Implementation skeleton (split registration into helpers to satisfy `max-lines-per-function`):

```ts
export function useEditorIntegration(params: EditorIntegrationParams): EditorIntegration {
  // Latest-value refs so registered closures never go stale.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const getState = useRef((): HistorySnapshot => ({
    nodes: paramsRef.current.nodes,
    edges: paramsRef.current.edges,
  })).current;

  const { history, undo } = useGraphHistory({
    getState,
    setNodes: (n) => paramsRef.current.setNodes(n),
    setEdges: (e) => paramsRef.current.setEdges(e),
    pushOperation: (op) => paramsRef.current.pushOperation(op),
  });

  const undoRef = useRef(undo);
  undoRef.current = undo;

  const [registry] = useState(() => buildRegistry(history, getState, paramsRef, undoRef));

  // History is FE-only per workflow: clear on the active→inactive transition
  // (cached editors stay mounted when switching workflows).
  useEffect(() => {
    if (!params.isActiveEditor) history.clear();
  }, [params.isActiveEditor, history]);

  return { dispatch: registry.dispatch.bind(registry), history, getState };
}
```

`buildRegistry` — the complete registration list (delegating through `paramsRef.current.callbacks.*` so closures stay fresh; split across two helper functions if `max-lines-per-function` trips):

```ts
function buildRegistry(
  history: EditorHistory,
  getState: () => HistorySnapshot,
  paramsRef: React.RefObject<EditorIntegrationParams>,
  undoRef: React.RefObject<() => void>
): ActionRegistry {
  const registry = new ActionRegistry(history, getState);
  const cb = () => paramsRef.current.callbacks;

  registry.register({ id: 'history.undo', undoable: false, run: () => undoRef.current() });
  registry.register({ id: 'node.add', undoable: true, run: () => cb().handleAddNode() });
  registry.register<Connection>({ id: 'edge.connect', undoable: true, run: (p) => cb().onConnect(p) });
  registry.register<string>({
    id: 'menu.selectNode',
    undoable: true,
    run: (id) => cb().handleConnectionMenuSelectNode(id),
  });
  registry.register({ id: 'menu.createNode', undoable: true, run: () => cb().handleConnectionMenuCreateNode() });
  registry.register({ id: 'menu.createUserNode', undoable: true, run: () => cb().createUserNode() });
  registry.register<Parameters<EditorIntegrationParams['callbacks']['createToolNode']>[0]>({
    id: 'menu.createToolNode',
    undoable: true,
    run: (p) => cb().createToolNode(p),
  });
  registry.register({ id: 'menu.createIfElse', undoable: true, run: () => cb().createIfElse() });
  registry.register({ id: 'menu.createLoop', undoable: true, run: () => cb().createLoop() });
  registry.register({ id: 'graph.confirmDelete', undoable: true, run: () => cb().confirmDelete() });
  registry.register<{ nodeId: string }>({
    id: 'node.commitProps',
    undoable: true,
    run: ({ nodeId }) => {
      const n = paramsRef.current.nodes.find((x) => x.id === nodeId);
      if (n !== undefined) paramsRef.current.pushOperation(buildUpdateNodeOp(n));
    },
  });
  registry.register<{ from: string; to: string; data: RFEdgeData }>({
    id: 'edge.updateProps',
    undoable: true,
    run: ({ from, to, data }) => {
      paramsRef.current.pushOperation(buildUpdateEdgeOp(from, to, data));
    },
  });
  return registry;
}
```

(Task 8 later appends `graph.requestDeleteSelected`, `search.toggle`, `search.close` here.)

Note on `node.commitProps`: by commit time the live state already holds the final value (per-keystroke `setNodes` in the panel), so the action only emits the persistence op; the pre-burst snapshot arrives via `dispatch(..., { preState, coalesceKey })` from `useCommittedField` (Task 7).

- [ ] **Step 6: Wire into `GraphBuilder.tsx`**

In `useGraphBuilderHooks` (after `graphActions` and the structured-creation hooks are created):

```ts
const { activeEditorId } = useEditorCache();
const editorIntegration = useEditorIntegration({
  nodes,
  edges,
  setNodes,
  setEdges,
  pushOperation: opQueue.pushOperation,
  isActiveEditor: agentId !== undefined && agentId === activeEditorId,
  callbacks: {
    handleAddNode: graphActions.handleAddNode,
    onConnect: graphActions.onConnect,
    handleConnectionMenuSelectNode: graphActions.handleConnectionMenuSelectNode,
    handleConnectionMenuCreateNode: graphActions.handleConnectionMenuCreateNode,
    createUserNode,
    createToolNode,
    createIfElse,
    createLoop,
    confirmDelete: deleteConfirmation.confirmDelete,
  },
});
```

Return `dispatch: editorIntegration.dispatch` and `getState: editorIntegration.getState` from `useGraphBuilderHooks`. Then swap the **callers** to dispatch (each is a one-line change in `LoadedEditor`'s JSX / props):

- `GraphCanvas onConnect` → `(params) => h.dispatch('edge.connect', params)`
- `Toolbar onAddNode` → `() => h.dispatch('node.add', undefined)`
- `ConnectionMenu onSelectNode` → `(id) => h.dispatch('menu.selectNode', id)`
- `ConnectionMenu onCreateNode` → `() => h.dispatch('menu.createNode', undefined)`
- `ConnectionMenu onCreateUserNode/onCreateToolNode/onCreateIfElse/onCreateLoop` → corresponding dispatches
- `DeleteConfirmDialog onConfirm` → `() => h.dispatch('graph.confirmDelete', undefined)`

Mount the hotkeys inside `LoadedEditor` (workflow mode only):

```tsx
{h.agentConfig === undefined && (
  <EditorHotkeys
    dispatch={h.dispatch}
    active={isActiveEditor && !isReadOnly}
    ctx={{ searchOpen: h.searchOpen }}
  />
)}
```

(`isActiveEditor` already exists in `LoadedEditor` — line ~633.)

- [ ] **Step 7: Verify — full web suite + typecheck + lint**

```bash
npm run typecheck -w packages/web
npx eslint packages/web/app/components/GraphBuilder.tsx packages/web/app/editor-actions packages/web/app/editor-history --no-warn-ignored
npm run test -w packages/web
```
Expected: all pass. If `GraphBuilder.tsx` trips `max-lines`, move `useEditorIntegration` param assembly into a small helper hook file (e.g. `editor-actions/useGraphBuilderIntegration.ts`) rather than compressing lines.

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/editor-actions packages/web/app/editor-history packages/web/app/components/GraphBuilder.tsx
git commit -m "feat(editor): wire action registry, undo history, and mod+z hotkey into GraphBuilder"
```

---

### Task 7: Commit-on-blur/debounce for panel text fields

**Files:**
- Modify: `packages/web/app/components/panels/NodePanel.tsx` (description ~line 215, text ~line 228 — the two per-keystroke `updateNodeData` textareas)
- Modify: `packages/web/app/components/panels/EdgePanel.tsx` (precondition value/description text inputs that call `updateEdgeData` per keystroke; structured click-driven updates switch to a plain `dispatch('edge.updateProps', …)`)
- Modify: `packages/web/app/components/SidePanels.tsx` (thread `dispatch` + `getState` props through to both panels)
- Test: extend `packages/web/app/editor-actions/__tests__/useCommittedField.test.ts` only if gaps found; panel changes are covered by typecheck + existing suite + manual verify.

**Interfaces:**
- Consumes: `useCommittedField` (Task 4), `dispatch`/`getState` (Task 6).
- Produces: no new exports. `NodePanel`/`EdgePanel` gain `dispatch: Dispatch` and `getState: () => HistorySnapshot` props.

- [ ] **Step 1: NodePanel — replace per-keystroke op pushes**

Current shape (line ~105):

```ts
const updateNodeData = (updates: Partial<RFNodeData>) => {
  setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)));
  pushUpdateNode(node, updates, pushOperation);   // ← fires per keystroke
};
```

New shape — live state update stays per keystroke; the op push moves to commits. For each text field (description, text) create a committed field:

```ts
const updateNodeDataLive = (updates: Partial<RFNodeData>): void => {
  setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)));
};

const descriptionField = useCommittedField({
  value: nodeData.description,
  fieldKey: `${nodeId}:description`,
  getState,
  onLiveChange: (v) => updateNodeDataLive({ description: v }),
  onCommit: ({ preState, coalesceKey }) =>
    dispatch('node.commitProps', { nodeId }, { preState, coalesceKey }),
});
// <Textarea value={nodeData.description} onChange={(e) => descriptionField.onChange(e.target.value)} onBlur={descriptionField.onBlur} />
```

Same pattern for the `text` field. **Non-text updates** (selects, checkboxes, `fallbackNodeId`, output-schema picker — single discrete changes) switch from `updateNodeData` to:

```ts
const updateNodeDataCommitted = (updates: Partial<RFNodeData>): void => {
  const preState = getState();
  updateNodeDataLive(updates);
  dispatch('node.commitProps', { nodeId }, { preState });
};
```

Hooks-order caution: `NodePanel` currently early-returns (`if (!node || !nodeData) return null;`) BEFORE where these hooks would sit. `useCommittedField` calls must be placed **above** the early return (use `node?.data.description ?? ''`), or the early return moved below the hooks — hooks must run unconditionally.

- [ ] **Step 2: EdgePanel — same treatment**

`updateEdgeData` (line ~129) currently pushes per call. Click-driven updates (add/remove precondition, type changes) become:

```ts
const updateEdgeDataCommitted = (updates: Partial<RFEdgeData>): void => {
  const preState = getState();
  applyEdgeDataLive(updates);   // the existing setEdges(...) part of updateEdgeData
  const merged = { ...edge.data, ...updates };
  dispatch('edge.updateProps', { from, to, data: merged }, { preState });
};
```

Any per-keystroke text inputs inside the precondition editor use `useCommittedField` with `fieldKey: `${from}->${to}:precondition:${index}:value`` and commit via the same `edge.updateProps` dispatch (with `coalesceKey` from the hook).

- [ ] **Step 3: Thread props through `SidePanels.tsx`**

Add `dispatch` and `getState` to `SidePanelsProps`, pass from `LoadedEditor` (`h.dispatch`, `h.getState`), forward to `NodePanel`/`EdgePanel`.

- [ ] **Step 4: Verify**

```bash
npm run typecheck -w packages/web
npx eslint packages/web/app/components/panels/NodePanel.tsx packages/web/app/components/panels/EdgePanel.tsx packages/web/app/components/SidePanels.tsx --no-warn-ignored
npm run test -w packages/web
```
Expected: all pass. Manual check (user-run dev server): typing in description produces ONE `[GraphSave]` op batch after idle/blur, and one ⌘Z restores pre-typing text.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/panels/NodePanel.tsx packages/web/app/components/panels/EdgePanel.tsx packages/web/app/components/SidePanels.tsx
git commit -m "feat(editor): commit panel text fields on blur/idle; one undo entry per burst"
```

---

### Task 8: Migrate Delete/⌘F/Escape raw listeners into the shortcut table

**Files:**
- Modify: `packages/web/app/editor-keyboard/shortcuts.ts` (add three rows)
- Modify: `packages/web/app/hooks/useDeleteConfirmation.ts` (remove the internal `keydown` effect; export `requestDeleteSelected`)
- Modify: `packages/web/app/hooks/useGraphBuilderHelpers.ts` (delete `useSearchKeyboard`)
- Modify: `packages/web/app/components/GraphBuilder.tsx` (drop `useSearchKeyboard` call; register the new actions in `useEditorIntegration`'s registry builder)
- Modify: `packages/web/app/editor-actions/useEditorIntegration.ts` (register `graph.requestDeleteSelected`, `search.toggle`, `search.close`; extend `callbacks` with `requestDeleteSelected`, `toggleSearch`, `closeSearch`)
- Test: `packages/web/app/hooks/__tests__/useDeleteConfirmation.test.ts` (new — for `requestDeleteSelected` selection logic)

**Interfaces:**
- Consumes: `EDITOR_SHORTCUTS` (Task 5), registry (Task 6).
- Produces: `useDeleteConfirmation` return gains `requestDeleteSelected: () => void`; its internal keydown listener is gone.

- [ ] **Step 1: Add shortcut rows**

```ts
export const EDITOR_SHORTCUTS: ShortcutDef[] = [
  { id: 'history.undo', keys: 'mod+z', actionId: 'history.undo', description: 'Undo last change' },
  {
    id: 'graph.deleteSelected',
    keys: 'delete, backspace',
    actionId: 'graph.requestDeleteSelected',
    description: 'Delete selected node or edge',
  },
  {
    id: 'search.toggle',
    keys: 'mod+f',
    actionId: 'search.toggle',
    description: 'Search nodes',
    enableOnFormTags: true,
  },
  {
    id: 'search.close',
    keys: 'escape',
    actionId: 'search.close',
    description: 'Close search',
    enableOnFormTags: true,
    enabled: (ctx) => ctx.searchOpen,
  },
];
```

(Delete/Backspace stays form-tag-inert — the old `isEditingText()` guard comes free. ⌘F and Escape must fire from inputs, matching current behavior.)

- [ ] **Step 2: Refactor `useDeleteConfirmation`**

Remove the `useEffect` keydown listener (lines ~57–85) and `isEditingText`/`DELETE_KEYS`. Add:

```ts
const requestDeleteSelected = useCallback(() => {
  const selectedNode = findSelectedNode(nodes);
  if (selectedNode !== undefined) {
    setPendingDelete({ kind: 'node', nodeId: selectedNode.id });
    return;
  }
  const selectedEdge = findSelectedEdge(edges);
  if (selectedEdge !== undefined) {
    setPendingDelete({
      kind: 'edge',
      edgeId: selectedEdge.id,
      from: selectedEdge.source,
      to: selectedEdge.target,
    });
  }
}, [nodes, edges]);
```

Return it from the hook. Write the failing test first (jsdom, `renderHook`): selects node over edge, ignores start node (`findSelectedNode` already excludes `START_NODE_ID`), no-op when nothing selected.

- [ ] **Step 3: Register the actions**

In `useEditorIntegration`'s registry builder:

```ts
registry.register({ id: 'graph.requestDeleteSelected', undoable: false, run: () => paramsRef.current.callbacks.requestDeleteSelected() });
registry.register({ id: 'search.toggle', undoable: false, run: () => paramsRef.current.callbacks.toggleSearch() });
registry.register({ id: 'search.close', undoable: false, run: () => paramsRef.current.callbacks.closeSearch() });
```

(`graph.requestDeleteSelected` only opens the confirm dialog — the mutation happens in `graph.confirmDelete`, which is the undoable one.) In `GraphBuilder`, pass `requestDeleteSelected: deleteConfirmation.requestDeleteSelected`, `toggleSearch: () => setSearchOpen((p) => !p)`, `closeSearch: () => setSearchOpen(() => false)`. Delete the `useSearchKeyboard(setSearchOpen)` call and the function itself from `useGraphBuilderHelpers.ts`.

- [ ] **Step 4: Verify**

```bash
npm run typecheck -w packages/web
npm run test -w packages/web
npx eslint packages/web/app/hooks/useDeleteConfirmation.ts packages/web/app/hooks/useGraphBuilderHelpers.ts packages/web/app/editor-keyboard packages/web/app/editor-actions packages/web/app/components/GraphBuilder.tsx --no-warn-ignored
```
Expected: all pass. Note the latent-bug fix this delivers: Delete/⌘F no longer fire in hidden cached editors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/editor-keyboard/shortcuts.ts packages/web/app/hooks/useDeleteConfirmation.ts packages/web/app/hooks/useGraphBuilderHelpers.ts packages/web/app/editor-actions/useEditorIntegration.ts packages/web/app/components/GraphBuilder.tsx packages/web/app/hooks/__tests__/useDeleteConfirmation.test.ts
git commit -m "refactor(editor): migrate Delete and search shortcuts into the shortcut table"
```

---

### Task 9: Final verification sweep

**Files:** none created; runs checks.

- [ ] **Step 1: Full test suites**

```bash
npm run test -w packages/web
npm run typecheck -w packages/web
npm run lint -w packages/web
```
Expected: all green (lint may show the 2 pre-existing warnings in `MatrixSection.tsx` / `FileChunksTable.tsx`; zero errors, zero NEW warnings).

- [ ] **Step 2: Coverage spot-check on new modules**

```bash
npm run test -w packages/web -- --coverage \
  --collectCoverageFrom='app/editor-history/*.ts' \
  --collectCoverageFrom='app/editor-actions/{actionRegistry,useCommittedField}.ts' \
  --collectCoverageFrom='app/editor-keyboard/*.{ts,tsx}' \
  --testPathPatterns='historyStore|graphDiff|actionRegistry|useCommittedField|EditorHotkeys|useGraphHistory'
```
Expected: ≥95% lines on each listed file. Delete the generated `packages/web/coverage/` directory afterwards (it trips lint).

- [ ] **Step 3: Manual verification list (user-run dev server — do NOT start it yourself)**

Hand the user this checklist:
1. Delete a node with edges → ⌘Z → node and its edges return; `[GraphSave]` logs show delete ops then insert ops; reload → node still there.
2. Type a sentence in a node description → single op batch after idle/blur → one ⌘Z restores pre-typing text.
3. ⌘Z with cursor inside a text field → native text undo only, canvas unchanged.
4. Edit workflow A → switch to workflow B → back to A → ⌘Z does nothing.
5. Reload after edits → ⌘Z does nothing.
6. Delete key in workflow B no longer deletes anything in workflow A (cached-editor bug fix).
7. ⌘Z with empty history → nothing happens, no errors in console.

- [ ] **Step 4: Commit any stragglers**

```bash
git status --short   # review; stage explicitly, never -A
```
