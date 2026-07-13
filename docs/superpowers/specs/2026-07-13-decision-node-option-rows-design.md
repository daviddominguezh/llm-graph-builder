# Decision & User-Routing Nodes: Per-Option Rows With Row-Anchored Edges

**Date:** 2026-07-13
**Status:** Design — pending implementation
**Area:** `packages/web` — graph builder (nodes, edges, transformers, layout, graph actions)

## Goal

Render `agent_decision` and `user_routing` nodes so that **each outgoing branch is a
row inside the node body**, and the branch's edge leaves from a **handle on the right
edge of that specific row**, pointing to the branch's target node:

```
|---------------|
|  DECISION     |
|  title/desc   |
|---------------|
| condition A →→|-------------->  TargetA
| condition B →→|-------------->  TargetB
| condition C →→|-------------->  TargetC
|_______________|
```

Today all outgoing edges of such a node fan out from a single shared `right-source`
handle. The condition text lives only on the edge label/tooltip. This change surfaces
each branch as a first-class row with its own anchored edge.

## Key architectural facts (why this is render-time only)

- `agent` and `agent_decision` node kinds both render as `AgentNode` (`nodes/Node.tsx`,
  registered in `nodes/index.ts`). The *visual* kind is inferred at render time by
  `getNodeKind(nodeId, edges)` from the precondition type of the outgoing edges — not
  from the schema `kind`.
- **Handles are ephemeral.** `rfEdgeToSchemaEdge` persists only `from`, `to`,
  `preconditions`, `contextPreconditions`. `schemaEdgeToRFEdge` recomputes
  `sourceHandle`/`targetHandle` from node positions on every load
  (`utils/graphTransformers.ts`). => We can assign per-row handles at transform time
  with **no schema change**.
- Each outgoing edge carries exactly one branch precondition. For `agent_decision` the
  precondition `value` is the decision criterion; for `user_said` it is the user-intent
  criterion. The edge `target` is the branch's destination node.
- React Flow (`@xyflow/react`) measures each `<Handle>`'s real DOM position relative to
  its node. A handle rendered *inside a row element* is therefore anchored at that row's
  vertical center automatically — no manual pixel math, rows may have varying heights.
- Edge creation flows through `useGraphActions` (`onSourceHandleClick` opens a
  connection menu → `handleConnectionMenuSelectNode` / `handleConnectionMenuCreateNode`
  add the edge with an explicit `sourceHandle`).
- Dagre layout (`utils/layoutGraph.ts`) sizes each node from `nodeDimensions[nodeId]`
  or a default; taller nodes must feed a real height in for correct spacing.

## Decisions (locked)

1. **Scope:** row mode applies to `agent_decision` **and** `user_routing` nodes.
   `agent` and `tool_call` nodes are unchanged.
2. **Row label:** condition text (primary, one line, truncated, full text on hover) +
   target node id (secondary, small).
3. **Body composition:** keep the existing header, title (`nodeId`), description, and
   text; append the option-rows list beneath them.
4. **Editing:** include the in-node **"+ Add option"** row (reusing the connection menu)
   and a per-row **delete** control.
5. **Back-edges/loops:** every option leaves from its row's right-side handle uniformly.
   React Flow's smoothstep path curves back for leftward/upward targets.

## Core mechanic

**Rule: for an option edge, `sourceHandle === edge.id`.**

- Row mode = `getNodeKind(...) ∈ { 'agent_decision', 'user_routing' }`.
- The node body maps its outgoing option edges (`useEdges()` filtered by `source`, in
  array order) to rows. Each row renders `<Handle type="source" position={Right}
  id={edge.id}>` pinned to the row's right edge.
- `schemaEdgeToRFEdge`: when the **source** node is row mode, set
  `sourceHandle = <the edge's own id>` and `targetHandle = 'left-target'`, instead of the
  position-based assignment. (`edge.id` is already `${from}-${to}-${index}`.)
- Because the handle id equals the edge id and React Flow measures the handle's DOM
  position, the edge auto-anchors to the correct row with zero coupling to row order or
  height.

This mirrors the existing "handles derived at transform time" model — no new persisted
state, no central re-assignment pass.

### Rejected alternative

Index-based handles with manually computed `top` pixels plus a re-assignment pass on
every edge add/remove. Requires fixed row heights and is brittle to ordering. No upside
over nesting handles in rows.

## Components & changes

### `nodes/Node.tsx`
- Compute `rowMode` from `getNodeKind`.
- For row-mode nodes, drop the fixed `maxHeight: 220px` (keep a `minHeight`) so the card
  grows with option count.
- Pass the outgoing option edges (source === id) into the body.
- In row mode, suppress the generic right-source handle (see `Handles.tsx`); target
  (incoming) handles remain.

### `nodes/NodeOptions.tsx` (new)
- Purpose: render the option-rows list for a row-mode node.
- Input: `nodeId`, the node kind, and the ordered outgoing option edges.
- Each row: primary condition line (truncated + tooltip, reuse `NodeBody`'s tooltip
  pattern), secondary target id, a right-anchored `<Handle id={edge.id}>`, and a small
  delete (×) control that removes that edge (reuse the existing edge-delete path used by
  `useDeleteConfirmation`).
- Footer row: **"+ Add option"** button that calls `onSourceHandleClick` with a
  dedicated add-option handle id so the connection menu opens anchored to the node.
- Extract the condition-value rendering helper so `NodeOptions` and the edge tooltip
  share one source of truth (`utils/preconditionHelpers`).
- Keep the file within the 300-line / 40-line-per-function ESLint limits; split helper
  rows (`NodeOptionRow`) into their own component if needed.

### `nodes/NodeBody.tsx`
- Unchanged for non-row nodes. Row-mode nodes render `NodeBody` (title/desc/text) then
  `NodeOptions` beneath, composed in `Node.tsx`.

### `nodes/Handles.tsx`
- Add a `rowMode` prop. When true, do **not** render `right-source` (rows own the source
  handles). Top/bottom target handles are retained for incoming edges. The "+ Add option"
  affordance is a plain button (not a `<Handle>`); it calls `onSourceHandleClick`, which
  anchors the connection menu to the button's bounding rect.

### `utils/graphTransformers.ts`
- `schemaEdgeToRFEdge`: detect row-mode source (needs the precondition type of the
  edge — already available via `edge.preconditions[0].type ∈ { 'agent_decision',
  'user_said' }`). When row-mode, `sourceHandle = <edge id>`, `targetHandle =
  'left-target'`. Otherwise keep `getClosestHandles`.
- Factor the "is this a row-mode branch edge" predicate into a shared helper so the node
  and the transformer agree.

### `utils/layoutGraph.ts` / caller
- When building `nodeDimensions`, estimate row-mode node height as
  `BASE_HEIGHT + optionCount × ROW_HEIGHT` so Dagre spaces neighbors correctly.

### `hooks/useGraphActions.ts`
- `handleConnectionMenuSelectNode` / `handleConnectionMenuCreateNode`: when the source
  node is row mode, set the new edge's `sourceHandle` to the newly created edge's id, and
  seed a default precondition matching the node kind (`agent_decision` value `''` or
  `user_said` value `''`).
- The "+ Add option" affordance reuses `onSourceHandleClick` with a sentinel handle id
  (e.g. `add-option`) so `computeNewNodePosition` / `resolveTargetHandle` place the new
  node to the right (`left-target`).

## Data flow

1. Load: schema → `schemaEdgeToRFEdge` assigns `sourceHandle = edge.id` for row-mode
   branch edges → `Node.tsx` detects row mode → `NodeOptions` renders a row + `<Handle
   id={edge.id}>` per outgoing edge → React Flow anchors each edge to its row.
2. Add option: click "+ Add option" → connection menu → pick/create target → new edge
   added with `sourceHandle = newEdge.id` and a default precondition → new row appears.
3. Delete option: row × → existing edge-delete path removes the edge → row disappears.
4. Save: `rfEdgeToSchemaEdge` drops handles as today → schema unchanged.

## Error / edge cases

- **Mixed precondition types on one node:** `getNodeKind` already picks the first
  precondition's type; row mode follows it. Rows still render one per outgoing edge
  regardless of individual type.
- **Zero options:** a row-mode node with no outgoing edges falls back to `agent` kind
  (existing `getNodeKind` behavior) → normal single-handle rendering. The "+ Add option"
  entry point for a brand-new decision node comes from the normal right-source flow until
  the first branch exists.
- **Long condition text:** one-line truncation + tooltip; never expand row height
  unbounded.
- **Back-edges:** right-side handle + smoothstep curve; acceptable per decision 5.
- **Muted / error / selected states:** rows inherit the existing muted/error/selection
  styling on the node container; no per-row error state added.

## Testing

- Unit: shared "row-mode branch edge" predicate (agent_decision / user_said true; tool /
  agent false).
- Unit: `schemaEdgeToRFEdge` assigns `sourceHandle === edge.id` for row-mode source and
  keeps position-based handles otherwise.
- Unit: row-mode height estimate for `nodeDimensions`.
- Component/interaction (as project harness allows): a decision node with N edges renders
  N rows each with a handle; "+ Add option" adds a row; row × removes it.

## i18n

- Add translations for "Add option" and any new visible strings (delete tooltip). No new
  user-facing text without a translation key.

## Out of scope

- Persisting handles or row order in the schema.
- Reordering options via drag.
- Changing `tool_call` node rendering.
- Editing the condition text inline in the row (remains in the side panel) — may be a
  follow-up.
