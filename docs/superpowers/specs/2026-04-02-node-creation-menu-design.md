# Node Creation Menu — Design Spec

## Overview

Enhance the workflow builder's "Create new node" button in the ConnectionMenu with a chevron dropdown that offers structured node creation options. Each option opens a dialog with a mini-graph preview and form fields for configuring precondition values before creation.

## Chevron Button & Dropdown

The existing "Create new node" button becomes a split button:
- **Main area**: Clicking creates a plain agent node (current behavior, unchanged).
- **Chevron icon** (`ChevronDown`): Sits at the far right, separated by a subtle vertical divider. Clicking opens a popover below with structured creation options.

### Dropdown Options

| Option | Icon | Color | Edge Type | Creates |
|--------|------|-------|-----------|---------|
| Agent node | `Send` | muted | none | 1 node, plain edge |
| User node | `MessageSquare` | green | `user_said` | 1 node, `user_said` edge |
| Routing node | `Brain` | purple | `agent_decision` | 1 node, `agent_decision` edge |
| Tool node | `Wrench` | orange | `tool_call` | 1 node, `tool_call` edge |
| If / Else | `GitFork` | purple | `agent_decision` | 2 nodes, 2 `agent_decision` edges |
| Loop | `Repeat` | purple | configurable | 2 nodes, loop structure |

### Disable Logic

All outgoing edges from a node must share the same precondition type (enforced by `validatePreconditionConsistency`). The dropdown reads the source node's existing outgoing edge type and disables incompatible options:

- **No outgoing edges**: All options enabled.
- **Existing type `none`**: Only "Agent node" enabled.
- **Existing type `user_said`**: Only "User node" enabled.
- **Existing type `agent_decision`**: "Routing node", "If/Else", and "Loop" enabled (Loop only if `agent_decision` connection type is available).
- **Existing type `tool_call`**: Only "Tool node" enabled.
- **Source is START node**: Only "User node" enabled (START always requires `user_said`).

Disabled options show a tooltip explaining the constraint.

## Dialog Designs

Each option except "Agent node" opens a dialog with:
1. **Mini-graph preview** — CSS-based illustration with colored boxes (nodes) and lines (edges). Current node shows its actual name (truncated). New nodes show dashed borders. Edge colors match precondition type colors (green = user, purple = decision, orange = tool).
2. **Form fields** — Below the preview, fields for configuring precondition values.
3. **Cancel / Create buttons** — Footer actions.

### User Node Dialog

- Preview: `[Current Node] --green--> [New Node]`
- Field: Text input labeled "When the user says:"
- Placeholder: `"I want to book a flight"`

### Routing Node Dialog

- Preview: `[Current Node] --purple--> [New Node]`
- Field: Text input labeled "When the agent decides:"
- Placeholder: `"The user is asking about pricing"`

### Tool Node Dialog

- Preview: `[Current Node] --orange--> [New Node]`
- Field: `ToolCombobox` component (existing, grouped by MCP server) labeled "Tool to call:"

### If/Else Dialog

- Preview: `[Current Node]` branching into two `[New Node]` boxes with purple edges.
- Fields:
  - Branch A: Text input labeled "Branch A — when the agent decides:" / Placeholder: `"The customer wants to purchase"`
  - Branch B: Text input labeled "Branch B — when the agent decides:" / Placeholder: `"The customer wants to return an item"`

### Loop Dialog

- Preview: `[Current Node] --(type)--> [Loop Body] --> [Exit]` with a back-arrow from Loop Body to Current Node.
- Fields:
  - **Connection type**: Segmented control / radio group: Agent | User | Tool. Only types compatible with source node's existing edges are enabled.
  - **Connection value** (conditional):
    - Agent selected: no extra field.
    - User selected: text input "When the user says:" / Placeholder: `"Process the next item"`
    - Tool selected: `ToolCombobox`
  - **Continue loop**: Text input "Continue loop — when the agent decides:" / Placeholder: `"There are more items to process"`
  - **Exit loop**: Text input "Exit loop — when the agent decides:" / Placeholder: `"All items have been processed"`

## Node & Edge Creation

### Agent Node (no dialog)
- 1 node (`type: 'agent'`), 1 edge (no preconditions). Current behavior.

### User Node
- 1 node (`type: 'agent'`)
- 1 edge with `{ type: 'user_said', value: <input> }` precondition
- Update source node: set `nextNodeIsUser: true` (required by validation)
- Operations: `insertNode`, `insertEdge`, `updateNode`

### Routing Node
- 1 node (`type: 'agent'`)
- 1 edge with `{ type: 'agent_decision', value: <input> }` precondition
- Operations: `insertNode`, `insertEdge`

### Tool Node
- 1 node (`type: 'agent'`)
- 1 edge with `{ type: 'tool_call', value: <tool_name> }` precondition
- Operations: `insertNode`, `insertEdge`

### If/Else
- 2 nodes (`type: 'agent'`), positioned vertically fanned from the handle position (one above, one below where a single node would go)
- 2 edges with `{ type: 'agent_decision', value: <branch_value> }` preconditions
- Operations: `insertNode` x2, `insertEdge` x2

### Loop
- 2 nodes: Loop Body + Exit Node
- Loop Body at standard new-node position; Exit Node offset one step further in the flow direction
- Edges:
  - Current Node -> Loop Body: type depends on user selection (none / `user_said` / `tool_call`)
  - Loop Body -> Current Node: `{ type: 'agent_decision', value: <continue_value> }` (back-edge)
  - Loop Body -> Exit Node: `{ type: 'agent_decision', value: <exit_value> }` (forward-edge)
- If user selected `user_said`, update source node `nextNodeIsUser: true`
- Operations: `insertNode` x2, `insertEdge` x3, optionally `updateNode`

## Auto-save

All operations go through `pushOperation()`. Multi-node options push all operations in the same callback so they batch naturally. No changes to the auto-save mechanism.

## File Changes

### New files
- `app/components/panels/NodeCreationDialog.tsx` — The dialog component with mini-graph preview and forms for each creation type.
- `app/components/panels/MiniGraphPreview.tsx` — Reusable CSS-based mini-graph illustration component.
- `app/components/panels/NodeTypeDropdown.tsx` — The chevron dropdown with creation options and disable logic.

### Modified files
- `app/components/panels/ConnectionMenu.tsx` — Split-button treatment on "Create new node", integrate chevron dropdown.
- `app/hooks/useGraphActions.ts` — New creation functions for each structured type (user node, routing node, tool node, if/else, loop). Extend `UseGraphActionsReturn` with new handlers.
- `app/components/GraphBuilder.tsx` — Pass MCP server/tool data and edges to ConnectionMenu for disable logic and ToolCombobox.

## Translations

All new user-facing strings must have translation keys added.
