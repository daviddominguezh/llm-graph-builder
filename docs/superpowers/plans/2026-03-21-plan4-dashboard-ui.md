# Plan 4: Dashboard UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-level analytics dashboard showing agent execution data — agent summary (level 1), sessions per agent (level 2), and a debug view with read-only canvas and node inspection (level 3).

**Architecture:** Server pages fetch data via lib functions → Supabase with RLS. Client components handle filtering, sorting, pagination, and interaction. Shared `FilterBar` and `SortableTable` components are reused across levels 1 and 2. Level 3 uses a read-only React Flow canvas with the published graph trimmed to show only visited nodes + first nodes of unchosen branches (muted). Use impeccable skills (`frontend-design`, `critique`, `polish`) for UI quality.

**Tech Stack:** Next.js (App Router), @xyflow/react (read-only canvas), shadcn/ui, Supabase JS SDK, next-intl, dagre (layout), lucide-react

**Spec:** `docs/superpowers/specs/2026-03-21-agent-execution-api-design.md` (Section 6)

**Depends on:** Plan 1 (DB schema with execution tables + materialized view)

---

## File Structure

### New files — Shared components
- `packages/web/app/components/dashboard/FilterBar.tsx` — Combinable filters as chips, "Add filter" dropdown
- `packages/web/app/components/dashboard/SortableTable.tsx` — Table with sortable column headers, cursor-based pagination
- `packages/web/app/components/dashboard/PaginationControls.tsx` — Prev/Next pagination with page info

### New files — Data layer
- `packages/web/app/lib/dashboard.ts` — Supabase queries for all 3 dashboard levels (with filtering, sorting, pagination)
- `packages/web/app/actions/dashboard.ts` — Server actions wrapping dashboard lib

### New files — Level 1 (Agent Summary)
- `packages/web/app/orgs/[slug]/(dashboard)/dashboard/page.tsx` — Rewrite: server page for agent summary

### New files — Level 2 (Agent Sessions)
- `packages/web/app/orgs/[slug]/(dashboard)/dashboard/[agentSlug]/page.tsx` — Server page for sessions table
- `packages/web/app/components/dashboard/SessionsTable.tsx` — Client component for sessions

### New files — Level 3 (Session Debug)
- `packages/web/app/orgs/[slug]/(dashboard)/dashboard/[agentSlug]/sessions/[sessionId]/page.tsx` — Server page for debug view
- `packages/web/app/components/dashboard/DebugView.tsx` — Main debug layout (canvas + inspector)
- `packages/web/app/components/dashboard/DebugCanvas.tsx` — Read-only React Flow canvas with visited nodes
- `packages/web/app/components/dashboard/NodeInspector.tsx` — Side panel showing node execution details
- `packages/web/app/components/dashboard/ExecutionTimeline.tsx` — Stepper to switch between executions
- `packages/web/app/utils/debugGraphBuilder.ts` — Trims published graph to visited nodes + muted alternatives

### Modified files
- `packages/web/messages/en.json` — Add `dashboard` translation namespace

---

## Task 1: Install shadcn components + create shared UI

**Files:**
- Create: `packages/web/app/components/dashboard/SortableTable.tsx`
- Create: `packages/web/app/components/dashboard/PaginationControls.tsx`
- Create: `packages/web/app/components/dashboard/FilterBar.tsx`

- [ ] **Step 1: Install any missing shadcn components**

Check if the following are installed, install if not:
```bash
cd packages/web
npx shadcn@latest add table        # If not already installed
npx shadcn@latest add calendar      # For date range filter
npx shadcn@latest add popover       # Already installed, verify
```

- [ ] **Step 2: Create SortableTable component**

A generic table component with:
- Clickable column headers (single active sort, toggles asc/desc)
- Sortable columns show an arrow indicator (ChevronUp/ChevronDown)
- Accepts `columns: Column[]` and `rows: T[]` as props
- Generic over row type `T`
- Emits `onSort(columnKey, direction)` callback
- Renders PaginationControls at the bottom

```typescript
interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface SortableTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  sortKey: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  // Pagination
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}
```

- [ ] **Step 3: Create PaginationControls**

Simple Prev/Next buttons with "Page X of Y" text and a page size selector (50/100/200).

- [ ] **Step 4: Create FilterBar component**

A bar showing active filters as removable chips/badges. Has an "Add filter" button that opens a dropdown of available filter types. Each filter type opens its own input:
- **Date range**: Two date inputs (from/to)
- **Text search**: Text input (for tenant, user)
- **Multi-select**: Dropdown with checkboxes (for agent, version, channel, model)

Props:
```typescript
interface FilterDefinition {
  key: string;
  label: string;
  type: 'dateRange' | 'text' | 'multiSelect';
  options?: Array<{ value: string; label: string }>; // For multiSelect
}

interface ActiveFilter {
  key: string;
  value: unknown; // DateRange | string | string[]
}

interface FilterBarProps {
  filters: FilterDefinition[];
  activeFilters: ActiveFilter[];
  onFilterChange: (filters: ActiveFilter[]) => void;
}
```

- [ ] **Step 5: Run typecheck, commit**

```bash
git add packages/web/app/components/dashboard/ packages/web/components/ui/
git commit -m "feat: add SortableTable, PaginationControls, and FilterBar components"
```

---

## Task 2: Create dashboard data layer

**Files:**
- Create: `packages/web/app/lib/dashboard.ts`
- Create: `packages/web/app/actions/dashboard.ts`

- [ ] **Step 1: Create lib with level 1 query (agent summary)**

```typescript
export interface AgentSummaryRow {
  agent_id: string;
  agent_name: string;
  agent_slug: string;
  total_executions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  unique_tenants: number;
  unique_users: number;
  unique_sessions: number;
  last_execution_at: string | null;
}

export interface DashboardQueryParams {
  orgId: string;
  page: number;
  pageSize: number;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

export async function getAgentSummary(
  supabase: SupabaseClient,
  params: DashboardQueryParams
): Promise<{ rows: AgentSummaryRow[]; total: number; error: string | null }>
```

Query: SELECT from `agent_execution_summary` materialized view, JOIN with `agents` for name/slug. Apply filters, sorting, pagination. Return total count for pagination.

- [ ] **Step 2: Create level 2 query (sessions per agent)**

```typescript
export interface SessionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  session_id: string;
  channel: string;
  current_node_id: string;
  model: string;
  total_executions: number;
  total_tokens: number;
  total_cost: number;
  created_at: string;
  last_activity: string;
}

export async function getSessionsByAgent(
  supabase: SupabaseClient,
  params: DashboardQueryParams & { agentId: string }
): Promise<{ rows: SessionRow[]; total: number; error: string | null }>
```

Query: SELECT from `agent_sessions` JOIN with aggregated data from `agent_executions`. Apply filters, sorting, pagination.

- [ ] **Step 3: Create level 3 queries (session detail + node data)**

```typescript
export interface ExecutionSummary {
  id: string;
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  total_duration_ms: number;
  started_at: string;
  completed_at: string | null;
  status: string;
}

export interface NodeVisitData {
  node_id: string;
  step_order: number;
  messages_sent: unknown;
  response: unknown;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost: number;
  duration_ms: number;
  model: string;
}

export async function getSessionDetail(supabase, sessionId): Promise<SessionDetail>
export async function getExecutionsForSession(supabase, sessionId): Promise<ExecutionSummary[]>
export async function getNodeVisitsForExecution(supabase, executionId): Promise<NodeVisitData[]>
```

- [ ] **Step 4: Create server actions**

Wrapper actions for all lib functions, following the standard pattern (create client, call lib, log, return).

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/dashboard.ts packages/web/app/actions/dashboard.ts
git commit -m "feat: add dashboard data layer with filtering and pagination"
```

---

## Task 3: Add translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add dashboard namespace**

```json
{
  "dashboard": {
    "title": "Dashboard",
    "agentSummary": "Agent Summary",
    "agentSummaryDescription": "Overview of execution metrics per agent.",
    "sessions": "Sessions",
    "sessionsDescription": "All sessions for {agentName}.",
    "sessionDebug": "Session Debug",
    "columns": {
      "agentName": "Agent",
      "totalExecutions": "Executions",
      "totalTokens": "Tokens",
      "totalCost": "Cost",
      "uniqueTenants": "Tenants",
      "uniqueUsers": "Users",
      "uniqueSessions": "Sessions",
      "lastExecution": "Last Execution",
      "tenantId": "Tenant",
      "userId": "User",
      "sessionId": "Session",
      "channel": "Channel",
      "currentNode": "Current Node",
      "model": "Model",
      "created": "Created",
      "lastActivity": "Last Activity"
    },
    "filters": {
      "addFilter": "Add filter",
      "dateRange": "Date range",
      "tenant": "Tenant",
      "user": "User",
      "agent": "Agent",
      "version": "Version",
      "channel": "Channel",
      "model": "Model",
      "from": "From",
      "to": "To",
      "apply": "Apply",
      "clear": "Clear all"
    },
    "pagination": {
      "page": "Page {page} of {total}",
      "rowsPerPage": "Rows per page",
      "previous": "Previous",
      "next": "Next"
    },
    "debug": {
      "metadata": "Session Metadata",
      "executions": "Executions",
      "executionN": "Execution {n}",
      "nodeInspector": "Node Details",
      "messagesSent": "Messages Sent to LLM",
      "llmResponse": "LLM Response",
      "structuredOutput": "Structured Output",
      "tokenUsage": "Token Usage",
      "duration": "Duration",
      "notVisited": "Not visited — agent chose a different path",
      "noNodeSelected": "Click a node to inspect its execution details."
    },
    "empty": "No execution data yet. Agents will appear here after they receive API calls.",
    "noSessions": "No sessions found for this agent."
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add dashboard translations"
```

---

## Task 4: Build Level 1 — Agent Summary page

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Rewrite as server + client component pair**

Server page: fetch org, fetch agent summary data, pass to client component.

Client component (inline or separate file): renders FilterBar + SortableTable with the agent summary columns. Each agent name links to `/orgs/[slug]/dashboard/[agentSlug]`.

Columns: Agent name (link), Executions, Tokens, Cost (formatted as $X.XX), Tenants, Users, Sessions, Last Execution (relative time).

Filters: Date range, Version, Channel, Model.

Sorting: all columns sortable, default by last execution desc.

Pagination: 50 rows default.

- [ ] **Step 2: Handle state management for filtering/sorting/pagination**

Use URL search params for state persistence (`useSearchParams` + `useRouter`). When filters/sort/page change, update URL params and refetch via server action.

- [ ] **Step 3: Run typecheck, commit**

```bash
git add packages/web/app/orgs/[slug]/(dashboard)/dashboard/
git commit -m "feat: add dashboard level 1 — agent summary with filtering and sorting"
```

---

## Task 5: Build Level 2 — Agent Sessions page

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/dashboard/[agentSlug]/page.tsx`
- Create: `packages/web/app/components/dashboard/SessionsTable.tsx`

- [ ] **Step 1: Create the page**

Server page: fetch org, resolve agent by slug, fetch sessions data. Breadcrumb: `Dashboard > Agent Name`.

- [ ] **Step 2: Create SessionsTable client component**

Same pattern as level 1 but with session-specific columns. Each session links to `/orgs/[slug]/dashboard/[agentSlug]/sessions/[sessionId]`.

Columns: Tenant, User, Session ID, Channel, Current Node, Executions, Tokens, Cost, Model, Created, Last Activity.

Filters: Date range, Tenant (text), User (text), Channel, Model, Version.

- [ ] **Step 3: Run typecheck, commit**

```bash
git add packages/web/app/orgs/[slug]/(dashboard)/dashboard/[agentSlug]/
git add packages/web/app/components/dashboard/SessionsTable.tsx
git commit -m "feat: add dashboard level 2 — agent sessions with filtering"
```

---

## Task 6: Create debug graph builder utility

**Files:**
- Create: `packages/web/app/utils/debugGraphBuilder.ts`

- [ ] **Step 1: Implement graph trimming logic**

This utility takes the full published graph and a list of visited nodes, and produces a trimmed graph for the debug canvas:

```typescript
import type { SchemaNode, SchemaEdge } from '@/app/schemas/graph.schema';

interface DebugGraphResult {
  nodes: SchemaNode[];   // visited nodes (normal) + first unchosen branch nodes (muted)
  edges: SchemaEdge[];   // edges between kept nodes
}

export function buildDebugGraph(
  fullNodes: SchemaNode[],
  fullEdges: SchemaEdge[],
  visitedNodeIds: string[]
): DebugGraphResult
```

Algorithm:
1. Mark all visited nodes as "kept" (normal styling)
2. For each visited node, find its outgoing edges
3. For edges that go to non-visited nodes (unchosen branches): keep the target node but mark it as `muted: true`
4. Only keep the **first** node of each unchosen branch (not the full branch)
5. Keep all edges between kept nodes; mute edges to muted nodes
6. Remove everything else

- [ ] **Step 2: Run typecheck, commit**

```bash
git add packages/web/app/utils/debugGraphBuilder.ts
git commit -m "feat: add debug graph builder utility for trimming visited paths"
```

---

## Task 7: Build Level 3 — Session Debug view

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/dashboard/[agentSlug]/sessions/[sessionId]/page.tsx`
- Create: `packages/web/app/components/dashboard/DebugView.tsx`
- Create: `packages/web/app/components/dashboard/DebugCanvas.tsx`
- Create: `packages/web/app/components/dashboard/NodeInspector.tsx`
- Create: `packages/web/app/components/dashboard/ExecutionTimeline.tsx`

- [ ] **Step 1: Create server page**

Fetch: session detail, list of executions, published graph snapshot for the agent+version. Breadcrumb: `Dashboard > Agent Name > Session ID`.

- [ ] **Step 2: Create ExecutionTimeline**

A horizontal stepper showing execution 1, 2, 3... Clicking an execution loads its node visits and updates the canvas. Shows execution timestamp and status.

- [ ] **Step 3: Create DebugCanvas**

Read-only React Flow canvas. Key differences from the main canvas:
- `nodesDraggable={false}`, `nodesConnectable={false}`, `elementsSelectable={true}`
- No `onNodesChange`, `onEdgesChange`, `onConnect`
- `onNodeClick` selects a node and opens the inspector
- Uses `buildDebugGraph()` to trim the graph
- Uses `schemaNodeToRFNode()` with `muted: true` for unchosen nodes
- Uses `layoutGraph()` for automatic positioning
- Same `nodeTypes` and `edgeTypes` as main canvas

- [ ] **Step 4: Create NodeInspector**

Side panel (right side) that shows details when a node is clicked:

For visited nodes:
- Node name, kind
- Full messages sent to LLM (collapsible JSON viewer with syntax highlighting — use `<pre>` with monospace and overflow-auto)
- LLM response (text + tool calls)
- Structured output if any
- Token usage table (input/output/cached) + cost
- Duration
- Model used

For muted nodes:
- Node name, kind
- "Not visited — agent chose a different path" message

- [ ] **Step 5: Create DebugView (main layout)**

Combines: top bar (session metadata + execution timeline), left panel (DebugCanvas), right panel (NodeInspector).

Layout: flex with the canvas taking 2/3 width and inspector taking 1/3. Inspector can be collapsed.

Top bar shows: agent name, version, tenant, user, session ID, channel, total executions, total tokens, total cost.

- [ ] **Step 6: Run typecheck and full check**

Run: `npm run check`
Fix any issues (max-lines, formatting, etc.)

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/orgs/[slug]/(dashboard)/dashboard/[agentSlug]/sessions/
git add packages/web/app/components/dashboard/
git commit -m "feat: add dashboard level 3 — session debug view with canvas and node inspector"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run `npm run check`**

Expected: format, lint, typecheck pass.

- [ ] **Step 2: Verify translations**

Check all `t('dashboard.xxx')` calls have corresponding keys.

- [ ] **Step 3: Start dev server and verify all 3 levels**

Run: `npm run dev -w packages/web`

Level 1: `/orgs/closer/dashboard` — shows agent summary table (empty initially, that's fine)
Level 2: Click an agent → `/orgs/closer/dashboard/test-recipe` — shows sessions table
Level 3: Click a session → debug view with canvas

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: address verification issues for dashboard UI"
```
