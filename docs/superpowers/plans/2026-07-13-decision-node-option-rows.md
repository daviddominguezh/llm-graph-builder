# Decision Node Option Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `agent_decision` and `user_routing` nodes with one row per outgoing branch, each branch's edge leaving from a handle anchored to the right of its row.

**Architecture:** Purely render-time. A shared `nodeKind` util decides when a node is "row mode". A pure `normalizeRowModeHandles(edges)` runs at the ReactFlow render boundary and sets each row-mode branch edge's `sourceHandle` to the edge's own id (`sourceHandle === edge.id`); a `<Handle id={edge.id}>` nested inside each option row anchors the edge to that row via React Flow's DOM measurement. No schema change — `rfEdgeToSchemaEdge` already drops handles.

**Tech Stack:** Next.js 16 (App Router), `@xyflow/react`, TypeScript (strict, ESM, `noUncheckedIndexedAccess`), Jest (ts-jest ESM, `testEnvironment: node`), Tailwind + shadcn/ui, next-intl.

## Global Constraints

- ESLint (never disable): `max-lines-per-function` 40, `max-lines` 300 per file, `max-depth` 2. Fix by extracting helpers / splitting files — never single-line compression.
- TypeScript: never use `any`; explicit types; `noUncheckedIndexedAccess` is on (indexed access is `T | undefined`).
- Never use `!important` in CSS/Tailwind.
- Always use shadcn/ui components from `components/ui/`; don't build from scratch.
- Always add translations for new user-facing text (next-intl; `messages/*.json`).
- Prettier: single quotes, 2-space indent, 110 print width, trailing comma es5.
- Automated tests run under Jest with `testEnvironment: node` (no jsdom) and `testMatch: **/__tests__/**/*.test.ts`. Only **pure-function** unit tests are automatable; component/interaction behavior is verified manually in the running app.
- Do NOT run `npm run check` unless explicitly asked. Run individual package checks (`npm run lint -w packages/web`, `npm run typecheck -w packages/web`, `npm run test -w packages/web`).
- Do not start the dev server; the user runs it.
- Run web commands from repo root with `-w packages/web` (the shell cwd is repo root; do not `cd`).

## File Structure

- **Create** `packages/web/app/utils/nodeKind.ts` — shared `NodeKind` type, `getNodeKind`, `isRowModeNodeKind`, `getRowModeSourceIds`, `normalizeRowModeHandles`. One responsibility: derive node kind + row-mode handle routing from edges.
- **Create** `packages/web/app/utils/__tests__/nodeKind.test.ts` — unit tests for the above.
- **Create** `packages/web/app/components/nodes/NodeOptions.tsx` — the option-rows list (rows + per-row source handle + delete + "Add option").
- **Create** `packages/web/app/components/nodes/NodeOptionRow.tsx` — a single option row (kept separate to respect `max-lines`/`max-lines-per-function`).
- **Modify** `packages/web/app/components/nodes/NodeHeader.tsx` — import `NodeKind` from `nodeKind.ts` (stop defining it locally).
- **Modify** `packages/web/app/components/nodes/Node.tsx` — use shared `getNodeKind`; compute `rowMode`; render `NodeOptions`; dynamic height; pass `rowMode` to `Handles`; pass outgoing edges down.
- **Modify** `packages/web/app/components/nodes/Handles.tsx` — add `rowMode` prop; suppress `right-source` when `rowMode`.
- **Modify** `packages/web/app/components/nodes/HandleContext.tsx` — add `onDeleteOption` and `onAddOption` callbacks.
- **Modify** `packages/web/app/components/GraphBuilder.tsx` — pass `normalizeRowModeHandles(edges)` to `<ReactFlow edges>`; wire `onDeleteOption`/`onAddOption` into the handle context provider.
- **Modify** `packages/web/app/components/dashboard/DebugCanvas.tsx` — normalize edges the same way at its ReactFlow boundary.
- **Modify** `packages/web/app/hooks/useGraphActions.ts` — new edges created from a row-mode source get an explicit id with `sourceHandle === id` and a default precondition matching node kind; add an `onAddOption` entry point.
- **Modify** `packages/web/app/hooks/useDeleteConfirmation.ts` — expose `requestDeleteEdge(edgeId, from, to)` so the row × opens the existing confirm modal.
- **Modify** `packages/web/app/utils/loadGraphData.ts` — `calculateNodeDimensions` accounts for row-mode option count so Dagre spacing reflects taller cards.
- **Modify** `packages/web/messages/en.json` — add "Add option" / delete-option labels under the existing `nodePanel` namespace (`en.json` is the only locale file).

---

## Task 1: Shared node-kind + row-mode handle utilities

**Files:**
- Create: `packages/web/app/utils/nodeKind.ts`
- Create: `packages/web/app/utils/__tests__/nodeKind.test.ts`
- Modify: `packages/web/app/components/nodes/NodeHeader.tsx:6-10` (remove local `NodeKind`, import it)
- Modify: `packages/web/app/components/nodes/Node.tsx:7,13-40` (import `getNodeKind`/`NodeKind`, delete local copy)

**Interfaces:**
- Produces:
  - `type NodeKind = 'agent' | 'user_routing' | 'agent_decision' | 'tool_call'`
  - `getNodeKind(nodeId: string, edges: Edge<RFEdgeData>[]): NodeKind`
  - `isRowModeNodeKind(kind: NodeKind): boolean`
  - `getRowModeSourceIds(edges: Edge<RFEdgeData>[]): Set<string>`
  - `normalizeRowModeHandles(edges: Edge<RFEdgeData>[]): Edge<RFEdgeData>[]`
- Consumes: `RFEdgeData` from `packages/web/app/utils/graphTransformers.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/app/utils/__tests__/nodeKind.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import type { Edge } from '@xyflow/react';

import type { RFEdgeData } from '../graphTransformers';
import {
  getNodeKind,
  getRowModeSourceIds,
  isRowModeNodeKind,
  normalizeRowModeHandles,
} from '../nodeKind';

function edge(id: string, source: string, target: string, type?: RFEdgeData['preconditions']): Edge<RFEdgeData> {
  return { id, source, target, data: { preconditions: type } };
}

const decision = [{ type: 'agent_decision' as const, value: 'c' }];
const userSaid = [{ type: 'user_said' as const, value: 'c' }];
const toolCall = [{ type: 'tool_call' as const, tool: { toolName: 't' } } as unknown as NonNullable<RFEdgeData['preconditions']>[number]];

describe('getNodeKind', () => {
  it('returns agent when no outgoing edges', () => {
    expect(getNodeKind('A', [])).toBe('agent');
  });
  it('classifies agent_decision and user_routing from first precondition', () => {
    const edges = [edge('A-B-0', 'A', 'B', decision), edge('C-D-0', 'C', 'D', userSaid)];
    expect(getNodeKind('A', edges)).toBe('agent_decision');
    expect(getNodeKind('C', edges)).toBe('user_routing');
  });
  it('classifies tool_call', () => {
    expect(getNodeKind('A', [edge('A-B-0', 'A', 'B', toolCall)])).toBe('tool_call');
  });
});

describe('isRowModeNodeKind', () => {
  it('is true only for decision and user routing', () => {
    expect(isRowModeNodeKind('agent_decision')).toBe(true);
    expect(isRowModeNodeKind('user_routing')).toBe(true);
    expect(isRowModeNodeKind('tool_call')).toBe(false);
    expect(isRowModeNodeKind('agent')).toBe(false);
  });
});

describe('getRowModeSourceIds', () => {
  it('collects only row-mode source nodes', () => {
    const edges = [edge('A-B-0', 'A', 'B', decision), edge('T-U-0', 'T', 'U', toolCall)];
    const ids = getRowModeSourceIds(edges);
    expect(ids.has('A')).toBe(true);
    expect(ids.has('T')).toBe(false);
  });
});

describe('normalizeRowModeHandles', () => {
  it('sets sourceHandle to edge id and targetHandle left-target for row-mode branch edges', () => {
    const edges = [
      edge('A-B-0', 'A', 'B', decision),
      edge('A-C-1', 'A', 'C', decision),
      edge('T-U-0', 'T', 'U', toolCall),
    ].map((e) => ({ ...e, sourceHandle: 'right-source', targetHandle: 'left-target' }));
    const out = normalizeRowModeHandles(edges);
    expect(out[0]?.sourceHandle).toBe('A-B-0');
    expect(out[1]?.sourceHandle).toBe('A-C-1');
    expect(out[0]?.targetHandle).toBe('left-target');
    expect(out[2]?.sourceHandle).toBe('right-source'); // tool edge untouched
  });
  it('returns the same edge reference when already normalized (idempotent)', () => {
    const e = { ...edge('A-B-0', 'A', 'B', decision), sourceHandle: 'A-B-0', targetHandle: 'left-target' };
    const out = normalizeRowModeHandles([e]);
    expect(out[0]).toBe(e);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w packages/web -- --testPathPattern=nodeKind`
Expected: FAIL — `Cannot find module '../nodeKind'`.

- [ ] **Step 3: Create `packages/web/app/utils/nodeKind.ts`**

```ts
import type { Edge } from '@xyflow/react';

import type { RFEdgeData } from './graphTransformers';

export type NodeKind = 'agent' | 'user_routing' | 'agent_decision' | 'tool_call';

const ROW_MODE_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(['agent_decision', 'user_routing']);

export function isRowModeNodeKind(kind: NodeKind): boolean {
  return ROW_MODE_KINDS.has(kind);
}

function kindFromPreconditionType(type: string): NodeKind | undefined {
  if (type === 'user_said') return 'user_routing';
  if (type === 'agent_decision') return 'agent_decision';
  if (type === 'tool_call') return 'tool_call';
  return undefined;
}

export function getNodeKind(nodeId: string, edges: Edge<RFEdgeData>[]): NodeKind {
  const outgoing = edges.filter((e) => e.source === nodeId);
  if (outgoing.length === 0) return 'agent';

  for (const edge of outgoing) {
    const first = edge.data?.preconditions?.[0];
    const kind = first === undefined ? undefined : kindFromPreconditionType(first.type);
    if (kind !== undefined) return kind;
  }
  return 'agent';
}

export function getRowModeSourceIds(edges: Edge<RFEdgeData>[]): Set<string> {
  const result = new Set<string>();
  for (const source of new Set(edges.map((e) => e.source))) {
    if (isRowModeNodeKind(getNodeKind(source, edges))) result.add(source);
  }
  return result;
}

export function normalizeRowModeHandles(edges: Edge<RFEdgeData>[]): Edge<RFEdgeData>[] {
  const rowModeSources = getRowModeSourceIds(edges);
  return edges.map((edge) => {
    if (!rowModeSources.has(edge.source)) return edge;
    if (edge.sourceHandle === edge.id && edge.targetHandle === 'left-target') return edge;
    return { ...edge, sourceHandle: edge.id, targetHandle: 'left-target' };
  });
}
```

Note: `max-depth` 2 is satisfied — the `for` loop (depth 1) contains only straight-line statements (depth ≤ 1 inside); classification is factored into `kindFromPreconditionType`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w packages/web -- --testPathPattern=nodeKind`
Expected: PASS (all `nodeKind` describe blocks green).

- [ ] **Step 5: Refactor `Node.tsx` and `NodeHeader.tsx` to use the shared util**

In `packages/web/app/components/nodes/NodeHeader.tsx`, replace the local type (lines 6-10):

```ts
import type { NodeKind } from "../../utils/nodeKind";
```

(remove `export type NodeKind = ...`; keep using `NodeKind` in `NodeHeaderProps`). If any other file imported `NodeKind` from `./NodeHeader`, re-point it to `../../utils/nodeKind`.

In `packages/web/app/components/nodes/Node.tsx`, delete the local `getNodeKind` (lines 13-40) and its now-unused imports, and import from the util:

```ts
import { getNodeKind } from "../../utils/nodeKind";
import type { NodeKind } from "../../utils/nodeKind";
```

Leave the rest of `AgentNodeComponent` unchanged for this task.

- [ ] **Step 6: Verify lint + typecheck + tests**

Run: `npm run lint -w packages/web && npm run typecheck -w packages/web && npm run test -w packages/web -- --testPathPattern=nodeKind`
Expected: lint clean, typecheck clean, tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/utils/nodeKind.ts packages/web/app/utils/__tests__/nodeKind.test.ts packages/web/app/components/nodes/Node.tsx packages/web/app/components/nodes/NodeHeader.tsx
git commit -m "refactor: extract shared nodeKind util with row-mode handle normalization

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Normalize row-mode handles at the ReactFlow render boundaries

**Files:**
- Modify: `packages/web/app/components/GraphBuilder.tsx:652` (`edges={...}` passed to `<ReactFlow>`)
- Modify: `packages/web/app/components/dashboard/DebugCanvas.tsx:110-115,163` (`toRFEdges`)

**Interfaces:**
- Consumes: `normalizeRowModeHandles` (Task 1).
- Produces: the edges array handed to `<ReactFlow>` always satisfies `sourceHandle === edge.id` for row-mode branch edges. This is the invariant Task 3's per-row `<Handle id={edge.id}>` relies on.

- [ ] **Step 1: Normalize in GraphBuilder**

In `packages/web/app/components/GraphBuilder.tsx`, add the import:

```ts
import { normalizeRowModeHandles } from '../utils/nodeKind';
```

Find the component that renders `<ReactFlow ... edges={h.edges} ...>` (around line 652). Immediately before the `return`/JSX that uses `h.edges`, derive:

```ts
const displayEdges = useMemo(() => normalizeRowModeHandles(h.edges), [h.edges]);
```

Change the ReactFlow prop to `edges={displayEdges}`. Leave `onEdgesChange` and all other `h.edges` consumers (panels, minimap) untouched — change ids are preserved, so changes map back to state correctly.

- [ ] **Step 2: Normalize in DebugCanvas**

In `packages/web/app/components/dashboard/DebugCanvas.tsx`, import `normalizeRowModeHandles` from `@/app/utils/nodeKind`. In `toRFEdges` (line ~110), after building `rfEdges`, return `normalizeRowModeHandles(rfEdges)` (wrap the final array). Keep muted-edge logic intact.

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run typecheck -w packages/web && npm run lint -w packages/web`
Expected: clean. (No behavior change yet visible — nodes still render the old body; edges now carry row-mode handles that currently point at the single `right-source` until Task 3 adds per-row handles. This is intentionally a no-visual-op commit.)

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/GraphBuilder.tsx packages/web/app/components/dashboard/DebugCanvas.tsx
git commit -m "feat: normalize row-mode edge handles at ReactFlow boundaries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Render option rows with per-row source handles

**Files:**
- Create: `packages/web/app/components/nodes/NodeOptionRow.tsx`
- Create: `packages/web/app/components/nodes/NodeOptions.tsx`
- Modify: `packages/web/app/components/nodes/Node.tsx` (compute `rowMode`, gather outgoing edges, render `NodeOptions`, dynamic height, pass `rowMode` to `Handles`)
- Modify: `packages/web/app/components/nodes/Handles.tsx` (add `rowMode` prop; suppress `right-source`)
- Modify: `packages/web/app/components/nodes/HandleContext.tsx` (add `onDeleteOption`, `onAddOption` — used in Tasks 4/5; declared here)

**Interfaces:**
- Consumes: `getNodeKind`, `isRowModeNodeKind`, `NodeKind` (Task 1); `getPreconditionDisplayValue` from `packages/web/app/utils/preconditionHelpers.ts`; `RFEdgeData` from `graphTransformers.ts`; `useEdges` from `@xyflow/react`.
- Produces:
  - `NodeOptions` props: `{ nodeId: string; nodeKind: NodeKind; options: Edge<RFEdgeData>[] }`
  - `NodeOptionRow` props: `{ edge: Edge<RFEdgeData>; onDelete: () => void }`
  - `HandleContextValue` gains `onDeleteOption?: (edgeId: string, from: string, to: string) => void` and `onAddOption?: (nodeId: string, nodeKind: NodeKind, event: React.MouseEvent) => void`.

- [ ] **Step 1: Extend HandleContext**

In `packages/web/app/components/nodes/HandleContext.tsx`, extend the interface:

```ts
import type { NodeKind } from "../../utils/nodeKind";

interface HandleContextValue {
  onSourceHandleClick?: (nodeId: string, handleId: string, event: React.MouseEvent) => void;
  onZoomToNode?: (nodeId: string) => void;
  onDeleteOption?: (edgeId: string, from: string, to: string) => void;
  onAddOption?: (nodeId: string, nodeKind: NodeKind, event: React.MouseEvent) => void;
  readOnly?: boolean;
}
```

- [ ] **Step 2: Create `NodeOptionRow.tsx`**

```tsx
import { memo } from "react";
import { Handle, Position, type Edge } from "@xyflow/react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RFEdgeData } from "../../utils/graphTransformers";
import { getPreconditionDisplayValue } from "../../utils/preconditionHelpers";
import { useHandleContext } from "./HandleContext";

interface NodeOptionRowProps {
  edge: Edge<RFEdgeData>;
  onDelete: () => void;
}

const rowHandleStyle = {
  width: "10px",
  height: "10px",
  borderRadius: "100px",
  backgroundColor: "var(--background)",
  borderColor: "var(--input)",
  right: "-5px",
  top: "50%",
} as const;

const NodeOptionRowComponent = ({ edge, onDelete }: NodeOptionRowProps) => {
  const t = useTranslations("nodePanel");
  const { readOnly } = useHandleContext();
  const first = edge.data?.preconditions?.[0];
  const label = first === undefined ? edge.target : getPreconditionDisplayValue(first);

  return (
    <div className="relative flex items-center gap-1 border-t border-border/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger className="line-clamp-1! block text-left text-xs text-foreground">
            {label}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            {label}
          </TooltipContent>
        </Tooltip>
        <p className="line-clamp-1! text-[10px] text-muted-foreground">{edge.target}</p>
      </div>
      {!readOnly && (
        <button
          type="button"
          aria-label={t("deleteOption")}
          className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <Handle type="source" position={Position.Right} id={edge.id} style={rowHandleStyle} />
    </div>
  );
};

export const NodeOptionRow = memo(NodeOptionRowComponent);
```

Note: the `<Handle>` is nested in the `relative` row; React Flow measures its DOM rect relative to the node, so the edge anchors at the row's vertical center. The negative `right` seats it on the node's border like the existing handles. Visual offset is confirmed in Step 8.

- [ ] **Step 3: Create `NodeOptions.tsx`**

```tsx
import { memo } from "react";
import { type Edge } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RFEdgeData } from "../../utils/graphTransformers";
import type { NodeKind } from "../../utils/nodeKind";
import { NodeOptionRow } from "./NodeOptionRow";
import { useHandleContext } from "./HandleContext";

interface NodeOptionsProps {
  nodeId: string;
  nodeKind: NodeKind;
  options: Edge<RFEdgeData>[];
}

const NodeOptionsComponent = ({ nodeId, nodeKind, options }: NodeOptionsProps) => {
  const t = useTranslations("nodePanel");
  const { onDeleteOption, onAddOption, readOnly } = useHandleContext();

  return (
    <div className="group/options">
      {options.map((edge) => (
        <NodeOptionRow
          key={edge.id}
          edge={edge}
          onDelete={() => onDeleteOption?.(edge.id, edge.source, edge.target)}
        />
      ))}
      {!readOnly && (
        <button
          type="button"
          className="flex w-full items-center gap-1 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onAddOption?.(nodeId, nodeKind, e);
          }}
        >
          <Plus className="h-3 w-3" />
          {t("addOption")}
        </button>
      )}
    </div>
  );
};

export const NodeOptions = memo(NodeOptionsComponent);
```

- [ ] **Step 4: Wire `NodeOptions` into `Node.tsx`**

In `packages/web/app/components/nodes/Node.tsx`:
- Import `isRowModeNodeKind` from `../../utils/nodeKind` and `NodeOptions` from `./NodeOptions`.
- After `const nodeKind = getNodeKind(id, edges);`, add:

```ts
const rowMode = isRowModeNodeKind(nodeKind);
const options = rowMode ? edges.filter((e) => e.source === id) : [];
```

- Change the container height style so row-mode nodes grow. Replace the fixed `minHeight/maxHeight: "220px"` for row mode:

```ts
const heightStyle = rowMode
  ? { minHeight: "160px" as const }
  : { minHeight: "220px" as const, maxHeight: "220px" as const };
```

and use `style={{ width: `${width}px`, ...heightStyle }}`.

- Pass `rowMode` to `Handles`: `<Handles nodeId={id} nextNodeIsUser={nextNodeIsUser} rowMode={rowMode} />`.
- Render options after the existing `NodeBody`:

```tsx
{rowMode && <NodeOptions nodeId={id} nodeKind={nodeKind} options={options} />}
```

If this pushes `AgentNodeComponent` past `max-lines-per-function` (40), extract the container JSX into a small `NodeShell` helper component in `Node.tsx` or a sibling file, keeping each function ≤ 40 lines.

- [ ] **Step 5: Add `rowMode` to `Handles.tsx`**

In `packages/web/app/components/nodes/Handles.tsx`, add `rowMode?: boolean` to `HandlesProps`. In `HandlesComponent`, when `rowMode` is true do not render the `right-source` `<Handle>` block (lines ~109-119). Keep all target handles and the top/bottom source handles unchanged. Extract the right-source JSX into a local `const rightSource = rowMode ? null : (<Handle .../>)` to keep the function within line limits.

- [ ] **Step 6: Add translations**

In `packages/web/messages/en.json`, inside the existing `nodePanel` namespace (starts ~line 485), add:

```json
"addOption": "Add option",
"deleteOption": "Delete option"
```

`en.json` is the only locale file — no other message files to update. Keep the keys and the `useTranslations("nodePanel")` calls in Steps 2-3 in agreement.

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck -w packages/web && npm run lint -w packages/web`
Expected: clean. (`onDeleteOption`/`onAddOption` are optional in context and simply no-op until Tasks 4/5 provide them.)

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/components/nodes/NodeOptions.tsx packages/web/app/components/nodes/NodeOptionRow.tsx packages/web/app/components/nodes/Node.tsx packages/web/app/components/nodes/Handles.tsx packages/web/app/components/nodes/HandleContext.tsx packages/web/messages/en.json
git commit -m "feat: render decision/user-routing nodes as per-option rows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 9: Manual visual verification (user-run app)**

Ask the user to open the graph editor (or use the `/run` skill / browser tools) and load a graph with a decision node (e.g. `app/data/ecommerce.json`, `IdentifyFirstContact`). Confirm: each branch is a row; each row's edge leaves from the right of that row and reaches its target; the "+ Add option" row shows. Adjust `rowHandleStyle.right`/`top` only if the handle is visibly off the border. Do NOT proceed to Task 4 until rows + edge anchoring look correct.

---

## Task 4: Add-option entry point and default precondition

**Files:**
- Modify: `packages/web/app/hooks/useGraphActions.ts` (new-edge id + `sourceHandle === id` + default precondition; `onAddOption`)
- Modify: `packages/web/app/components/GraphBuilder.tsx` (provide `onAddOption` in the handle context)

**Interfaces:**
- Consumes: `NodeKind` (Task 1); existing `useSourceHandleClick`, `useMenuSelectNode`, `useMenuCreateNode`, `buildInsertEdgeOp`, `makePrecondition` (from `preconditionHelpers`).
- Produces: `onAddOption(nodeId, nodeKind, event)` on `useGraphActions`'s return; new option edges carry `sourceHandle === edge.id` and a seeded precondition (`agent_decision` or `user_said`, `value: ''`).

- [ ] **Step 1: Seed precondition + explicit edge id when the source is row-mode**

In `useMenuSelectNode` and `useMenuCreateNode` (`useGraphActions.ts`), when the connection menu was opened from an "add option" action, build the edge with an explicit id and matching handle. Add a helper near the top of the file:

```ts
import { makePrecondition } from '../utils/preconditionHelpers';
import type { NodeKind } from '../utils/nodeKind';

function buildOptionEdge(
  sourceNodeId: string,
  targetNodeId: string,
  nodeKind: NodeKind
): { id: string; edgeData: RFEdgeData } {
  const id = `${sourceNodeId}-${targetNodeId}-${nanoid(NANOID_LENGTH)}`;
  const type = nodeKind === 'user_routing' ? 'user_said' : 'agent_decision';
  return { id, edgeData: { preconditions: [makePrecondition({ type, value: '' })] } };
}
```

Extend `ConnectionMenuState` (line ~31 region) with an optional `addOptionKind?: NodeKind`. When present, `useMenuSelectNode`/`useMenuCreateNode` use `buildOptionEdge(...)` to create the edge with `{ id, sourceHandle: id, targetHandle: 'left-target', type: 'precondition', data: edgeData }` instead of the current default. When absent, keep today's behavior exactly.

- [ ] **Step 2: Add the `onAddOption` action**

Add a hook mirroring `useSourceHandleClick` that stores `addOptionKind` in the menu state:

```ts
function useAddOption(
  setMenu: (v: ConnectionMenuState | null) => void
): (nodeId: string, nodeKind: NodeKind, event: React.MouseEvent) => void {
  return useCallback(
    (nodeId, nodeKind, event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({
        position: { x: rect.right + HANDLE_OFFSET, y: rect.top },
        sourceNodeId: nodeId,
        sourceHandleId: 'add-option',
        addOptionKind: nodeKind,
      });
    },
    [setMenu]
  );
}
```

Return `onAddOption: useAddOption(setConnectionMenu)` from `useGraphActions`. Ensure `resolveTargetHandle('add-option')` returns `'left-target'` (it already falls through to `'left-target'`) and `computeNewNodePosition` treats `'add-option'` like the right case (it already falls through to the right-side branch).

- [ ] **Step 3: Provide `onAddOption` to the node context in GraphBuilder**

In `packages/web/app/components/GraphBuilder.tsx`, the `HandleContext.Provider` value (search for `onSourceHandleClick:`) — add `onAddOption: h.graphActions.onAddOption`.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck -w packages/web && npm run lint -w packages/web`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/hooks/useGraphActions.ts packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: add-option flow seeds default precondition and row handle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual verification**

In the running app: click "+ Add option" on a decision node → the connection menu opens → pick/create a target → a new row appears with an edge from its right handle; the new edge's precondition type matches the node kind (decision vs user). Verify the new row's edge anchors correctly (the normalization from Task 2 plus the explicit `sourceHandle === id` keep it consistent).

---

## Task 5: Per-row delete via the existing confirm modal

**Files:**
- Modify: `packages/web/app/hooks/useDeleteConfirmation.ts` (expose `requestDeleteEdge`)
- Modify: `packages/web/app/components/GraphBuilder.tsx` (wire `onDeleteOption` → `requestDeleteEdge`)

**Interfaces:**
- Consumes: existing `pendingDelete`/`confirmDelete` machinery in `useDeleteConfirmation`.
- Produces: `requestDeleteEdge(edgeId: string, from: string, to: string): void` on the hook's return; `onDeleteOption` in the handle context routes to it.

- [ ] **Step 1: Expose `requestDeleteEdge`**

In `packages/web/app/hooks/useDeleteConfirmation.ts`, add a callback that sets the same `pendingDelete` edge state the keyboard path uses:

```ts
const requestDeleteEdge = useCallback((edgeId: string, from: string, to: string) => {
  setPendingDelete({ kind: 'edge', edgeId, from, to });
}, []);
```

Return it alongside `pendingDelete`, `confirmDelete`, `cancelDelete`. Update the hook's return type/interface accordingly.

- [ ] **Step 2: Wire it into the handle context**

In `GraphBuilder.tsx`, in the `HandleContext.Provider` value, add:

```ts
onDeleteOption: (edgeId, from, to) => h.deleteConfirmation.requestDeleteEdge(edgeId, from, to),
```

(Use the actual accessor for the delete-confirmation hook result in that file — search for `confirmDelete`/`pendingDelete` to find its handle, e.g. `h.deleteConfirmation` or similar.)

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck -w packages/web && npm run lint -w packages/web`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/hooks/useDeleteConfirmation.ts packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: delete an option row via the edge confirm modal

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual verification**

Hover a row → the × appears → click it → the existing delete-edge confirmation modal opens → confirm → the row and its edge disappear.

---

## Task 6: Layout height for row-mode nodes

**Files:**
- Modify: `packages/web/app/utils/loadGraphData.ts` (`calculateNodeDimensions` accounts for options)
- Create/append test: `packages/web/app/utils/__tests__/nodeDimensions.test.ts`

**Interfaces:**
- Consumes: `SchemaEdge` (`from`/`to`/`preconditions`) from `graph.schema`.
- Produces: taller `height` in `nodeDimensions` for row-mode source nodes so Dagre spacing reflects the rows.

- [ ] **Step 1: Write the failing test**

Create `packages/web/app/utils/__tests__/nodeDimensions.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import { calculateNodeDimensions } from '../loadGraphData';
import type { Graph } from '../../schemas/graph.schema';

const nodes: Graph['nodes'] = [
  { id: 'A', kind: 'agent_decision', text: '', description: '' },
  { id: 'B', kind: 'agent', text: '', description: '' },
  { id: 'C', kind: 'agent', text: '', description: '' },
];
const edges: Graph['edges'] = [
  { from: 'A', to: 'B', preconditions: [{ type: 'agent_decision', value: 'x' }] },
  { from: 'A', to: 'C', preconditions: [{ type: 'agent_decision', value: 'y' }] },
];

describe('calculateNodeDimensions', () => {
  it('makes a row-mode node taller than a plain node by its option count', () => {
    const dims = calculateNodeDimensions(nodes, edges, 180);
    expect(dims.A?.height).toBeGreaterThan(dims.B?.height ?? 0);
  });
  it('leaves plain nodes at the fixed height', () => {
    const dims = calculateNodeDimensions(nodes, edges, 180);
    expect(dims.B?.height).toBe(dims.C?.height);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w packages/web -- --testPathPattern=nodeDimensions`
Expected: FAIL — `calculateNodeDimensions` is not exported / signature mismatch (currently takes `(nodes, nodeWidth)`).

- [ ] **Step 3: Update `calculateNodeDimensions`**

In `packages/web/app/utils/loadGraphData.ts`:
- Add a constant `const OPTION_ROW_HEIGHT = 40;`
- Add a helper:

```ts
function rowModeOptionCount(nodeId: string, edges: Graph['edges']): number {
  const outgoing = edges.filter((e) => e.from === nodeId);
  const first = outgoing.find((e) => (e.preconditions?.length ?? 0) > 0)?.preconditions?.[0];
  if (first?.type === 'agent_decision' || first?.type === 'user_said') return outgoing.length;
  return 0;
}
```

- Change the signature to `export function calculateNodeDimensions(nodes: Graph['nodes'], edges: Graph['edges'], nodeWidth: number)` and, in the loop body, after the `INITIAL_STEP` check:

```ts
const optionCount = rowModeOptionCount(node.id, edges);
const height = FIXED_NODE_HEIGHT + optionCount * OPTION_ROW_HEIGHT;
dimensions[node.id] = { width: nodeWidth, height };
```

- Update both call sites (`ensureNodePositions` line ~54 and `relayoutGraph` line ~77) to pass `graph.edges`: `calculateNodeDimensions(graph.nodes, graph.edges, nodeWidth)`.
- Export `calculateNodeDimensions` (add `export`).

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -w packages/web -- --testPathPattern=nodeDimensions`
Expected: PASS.

- [ ] **Step 5: Verify lint + typecheck + web unit tests**

Run: `npm run lint -w packages/web && npm run typecheck -w packages/web && npm run test -w packages/web -- --testPathPattern="nodeKind|nodeDimensions"`
Expected: all clean/PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/utils/loadGraphData.ts packages/web/app/utils/__tests__/nodeDimensions.test.ts
git commit -m "feat: row-mode layout height for decision nodes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (whole feature)

- [ ] Run `npm run lint -w packages/web`, `npm run typecheck -w packages/web`, `npm run test -w packages/web` — all clean/green.
- [ ] In the running app, exercise end-to-end on a real decision graph: rows render with condition + target; each edge leaves from its row; back-edges still leave from the right and curve; "+ Add option" adds a seeded branch; row × deletes via the confirm modal; plain `agent`/`tool_call` nodes are visually unchanged.
- [ ] Confirm import + "format/relayout" paths still position nodes sensibly (taller decision cards don't overlap).

## Notes on decisions carried from the spec

- Scope: `agent_decision` + `user_routing` only (`isRowModeNodeKind`). `tool_call`/`agent` unchanged.
- Row label: condition text (primary, truncated + tooltip) + target id (secondary).
- Body: keeps title/description/text, appends rows.
- Back-edges: all options leave from the right-side row handle (smoothstep curves back).
- No schema change: `rfEdgeToSchemaEdge` already omits handles; normalization is render-time.
