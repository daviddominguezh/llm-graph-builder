# Agent Editor UI (Sub-project 2) — Design Spec

## Overview

Build the editor UI for agent-type apps. Instead of a ReactFlow canvas, agents have a form-based editor for system prompt, context items, and max steps. Reuses the same toolbar, MCP panels, status check, publish, version switching, simulation, import/export, and auto-save infrastructure as workflows.

---

## 1. Editor Layout

When `app_type === 'agent'`, the `GraphBuilder` component renders the agent editor instead of the ReactFlow canvas. The toolbar, side panels, and all chrome remain identical.

**Main editor area** (replaces the canvas):
- **System prompt** — large textarea, auto-saved via operation queue
- **Context items** — ordered list of text entries, add/remove/reorder, auto-saved
- **Max steps** — optional number input, auto-saved

MCP servers are managed via the existing tools side panel (unchanged).

---

## 2. Operation Types

New operations added to the `Operation` union in `graph-types`:

```ts
// Update agent scalar fields
{ type: 'updateAgentConfig'; data: { systemPrompt?: string; maxSteps?: number | null } }

// Context item CRUD
{ type: 'insertContextItem'; data: { sortOrder: number; content: string } }
{ type: 'updateContextItem'; data: { sortOrder: number; content: string } }
{ type: 'deleteContextItem'; data: { sortOrder: number } }
{ type: 'reorderContextItems'; data: { sortOrders: number[] } }
```

These flow through the existing operation queue → `POST /agents/:id/graph/operations` → `operationDispatch.ts`.

---

## 3. Backend — Operation Dispatch

New file `packages/backend/src/db/queries/agentConfigOperations.ts` handles:
- `updateAgentConfig` — updates `agents.system_prompt` and/or `agents.max_steps`
- `insertContextItem` — inserts into `agent_context_items`
- `updateContextItem` — updates content by agent_id + sort_order
- `deleteContextItem` — deletes by agent_id + sort_order
- `reorderContextItems` — re-numbers sort_order values

`operationDispatch.ts` gains cases for these new operation types.

---

## 4. Backend — Agent Graph Loader

The existing `GET /agents/:id/graph` returns graph data for workflows. For agents, it returns the agent config instead.

Response shape for agents:
```ts
{
  appType: 'agent';
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
  mcpServers: McpServerConfig[];
}
```

The `getGraph` handler checks `app_type` and returns the appropriate shape. The frontend `useGraphLoader` is updated to handle both shapes.

---

## 5. Backend — Publish for Agents

New Postgres function `publish_agent_version_tx(p_agent_id uuid)`:
- Locks the agent row
- Assembles JSONB from `system_prompt`, `max_steps`, `agent_context_items`, `graph_mcp_servers`
- Inserts snapshot into `agent_versions`
- Increments `current_version`
- Promotes staging API key to production

The backend `publishVersion` function checks `app_type` and calls the appropriate RPC.

---

## 6. Frontend — Agent Editor Component

New component `packages/web/app/components/AgentEditor.tsx`:
- Receives agent config from the graph loader
- Renders system prompt textarea, context items list, max steps input
- Pushes operations through `pushOperation` on changes (debounced for text fields)
- Consumes the same `HandleContext`, operation queue, and auto-save as the graph canvas

### Context Items UI
- Ordered list with drag-to-reorder (or up/down buttons)
- "Add" button appends a new item
- Each item has a textarea + delete button
- Changes push `insertContextItem`, `updateContextItem`, `deleteContextItem`, or `reorderContextItems` operations

---

## 7. Frontend — GraphBuilder Branching

`GraphBuilder` checks `app_type` (from the loaded graph or the agent row):
- `'workflow'` → renders `GraphCanvas` + workflow-specific toolbar items
- `'agent'` → renders `AgentEditor` + agent-specific toolbar items

Toolbar differences for agents:
- No "Add node" button
- No "Auto-layout" button
- Import/Export still works (serializes/deserializes agent config JSON)
- Publish, version switching, status check, simulate — all work

---

## 8. Frontend — Status Check for Agents

The `StatusButton` already accepts `mcpHealth` and graph errors separately. For agents:
- Pass empty `nodes` and `edges` arrays (no graph validation)
- Pass `mcpHealth` as-is (same MCP readiness checks)
- `canPublish` for agents: `agentConfig !== null && !hasMcpErrors(mcpHealth)`

---

## 9. Simulation for Agents

`useSimulation` gains an `appType` param. When `appType === 'agent'`:
- Builds agent config payload instead of graph payload
- Calls a new `/simulate-agent` endpoint (or the same `/simulate` with a type discriminator)
- The backend routes to the new agent executor (sub-project 3)
- SSE events are similar but simpler: no `node_visited`, just `step_processed` events
- The `SimulationPanel` renders the same chat interface regardless of type

---

## 10. Import/Export for Agents

Export serializes agent config to JSON:
```json
{
  "appType": "agent",
  "systemPrompt": "...",
  "maxSteps": 10,
  "contextItems": ["..."],
  "mcpServers": [...]
}
```

Import validates and loads from this format. The toolbar's import/export buttons call type-appropriate serializers.
