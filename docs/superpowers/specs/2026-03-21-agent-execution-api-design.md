# Agent Execution API — Design Spec

## Overview

Enable external consumers to execute published agents via a REST API. The system provides:
- API key management for authentication
- A backend endpoint that orchestrates data gathering, invokes a stateless Supabase Edge Function, and persists all execution data
- A three-level analytics dashboard for debugging and monitoring agent executions
- Encrypted storage for all secrets

## Architecture

```
External Caller
  → POST /api/agents/:agentSlug/:version (Express backend, port 4000)
    → Auth (validate execution API key)
    → Fetch data (graph, session, messages, env vars, OpenRouter key)
    → Save incoming message
    → Build payload
    → Call Supabase Edge Function (always SSE)
      → Edge function executes agent (stateless, uses @daviddh/llm-graph-runner)
      → Streams events back
    → Persist results (messages, node visits, tokens, costs, etc.)
    → Respond to caller (SSE if stream:true, JSON if stream:false)
```

The Edge Function is purely stateless: it receives everything it needs and returns everything it produces. All DB reads and writes happen in the Express backend.

## Sub-Projects (Build Order)

1. Security migration (encrypt existing secrets tables)
2. Database schema (new tables for execution keys, sessions, executions, node visits, messages)
3. API Keys UI (CRUD page)
4. Express endpoint (auth + orchestration pipeline)
5. Supabase Edge Function (stateless executor)
6. Dashboard UI (three-level analytics)

---

## 1. Security Migration

Since there is no production data, we drop and recreate affected tables with encryption from the start.

### 1.1 `org_api_keys` — Symmetric Encryption

Stores OpenRouter keys that must be decryptable (sent to LLM providers).

Uses `pgsodium` extension with `crypto_aead_det_encrypt` / `crypto_aead_det_decrypt` and a server-managed key.

```sql
-- New schema (replaces current)
CREATE TABLE org_api_keys (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  encrypted_value bytea NOT NULL,       -- pgsodium encrypted
  key_preview    text NOT NULL,         -- '••••••••' || last 4 chars
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_api_keys_org_id ON org_api_keys(org_id);
```

Helper functions (SECURITY DEFINER):
- `encrypt_api_key(plaintext text) RETURNS bytea` — encrypts with server key
- `decrypt_api_key(encrypted bytea) RETURNS text` — decrypts with server key

### 1.2 `org_env_variables` — Symmetric Encryption

Same approach. The `value` column becomes `encrypted_value bytea`.

```sql
CREATE TABLE org_env_variables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  encrypted_value bytea NOT NULL,       -- pgsodium encrypted
  is_secret   boolean NOT NULL DEFAULT false,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE TRIGGER org_env_variables_updated_at
  BEFORE UPDATE ON org_env_variables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 1.3 `mcp_oauth_connections` — Symmetric Encryption

OAuth tokens (`access_token`, `refresh_token`) are secrets that must be encrypted at rest. Same pgsodium approach as above.

```sql
CREATE TABLE mcp_oauth_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_item_id uuid NOT NULL REFERENCES mcp_library(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  encrypted_access_token  bytea NOT NULL,   -- pgsodium encrypted
  encrypted_refresh_token bytea,            -- pgsodium encrypted, nullable
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(library_item_id, org_id)
);
```

---

## 2. Database Schema

### 2.1 `agent_execution_keys`

Bearer tokens for authenticating external callers. One-way hashed (SHA-256) — the full key is shown only once at creation time.

```sql
CREATE TABLE agent_execution_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  key_hash    text NOT NULL UNIQUE,     -- SHA-256 hash for O(1) lookup
  key_prefix  text NOT NULL,            -- first 12 chars for display (e.g., "clr_a8Kx...")
  expires_at  timestamptz,              -- optional expiration (NULL = never expires)
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- Auth lookup on every request
CREATE INDEX idx_execution_keys_org ON agent_execution_keys(org_id);
```

Auth check must also verify `expires_at IS NULL OR expires_at > now()`.

### 2.2 `agent_execution_key_agents` (join table)

Scopes a key to specific agents.

```sql
CREATE TABLE agent_execution_key_agents (
  key_id    uuid NOT NULL REFERENCES agent_execution_keys(id) ON DELETE CASCADE,
  agent_id  uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  PRIMARY KEY (key_id, agent_id)
);

-- Reverse lookup: which keys have access to this agent
CREATE INDEX idx_exec_key_agents_agent ON agent_execution_key_agents(agent_id, key_id);
```

### 2.3 `agent_sessions`

Tracks session state. Composite key: `agent_id + version + tenant_id + user_id + session_id + channel`.

```sql
CREATE TABLE agent_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  tenant_id       text NOT NULL,
  user_id         text NOT NULL,            -- external user, not our auth user
  session_id      text NOT NULL,
  channel         text NOT NULL DEFAULT 'web' CHECK (channel IN ('whatsapp', 'web')),
  current_node_id text NOT NULL DEFAULT 'INITIAL_STEP',
  model           text NOT NULL,
  structured_outputs jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (agent_id, version, tenant_id, user_id, session_id, channel)
);

CREATE TRIGGER agent_sessions_updated_at
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Dashboard level 1: sessions per agent in an org
CREATE INDEX idx_sessions_org_agent ON agent_sessions(org_id, agent_id);
-- Dashboard filter by tenant
CREATE INDEX idx_sessions_org_agent_tenant ON agent_sessions(org_id, agent_id, tenant_id);
-- Dashboard sort by date
CREATE INDEX idx_sessions_org_agent_date ON agent_sessions(org_id, agent_id, created_at DESC);
-- Filter by version
CREATE INDEX idx_sessions_agent_version ON agent_sessions(agent_id, version);
```

### 2.4 `agent_executions`

One row per API call. Heavily denormalized for dashboard query performance.

```sql
CREATE TABLE agent_executions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id          uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version           integer NOT NULL,
  tenant_id         text NOT NULL,
  external_user_id  text NOT NULL,
  channel           text NOT NULL DEFAULT 'web' CHECK (channel IN ('whatsapp', 'web')),
  execution_key_id  uuid REFERENCES agent_execution_keys(id) ON DELETE SET NULL,
  model             text NOT NULL,
  total_input_tokens  integer NOT NULL DEFAULT 0,
  total_output_tokens integer NOT NULL DEFAULT 0,
  total_cached_tokens integer NOT NULL DEFAULT 0,
  total_cost        numeric(12,6) NOT NULL DEFAULT 0,
  total_duration_ms integer NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error             text
);

-- Dashboard level 1 aggregation
CREATE INDEX idx_executions_org_agent_date ON agent_executions(org_id, agent_id, started_at DESC);
-- Filter by version
CREATE INDEX idx_executions_org_agent_version ON agent_executions(org_id, agent_id, version, started_at DESC);
-- Filter by tenant
CREATE INDEX idx_executions_org_agent_tenant ON agent_executions(org_id, agent_id, tenant_id, started_at DESC);
-- Filter by model
CREATE INDEX idx_executions_org_agent_model ON agent_executions(org_id, agent_id, model, started_at DESC);
-- All executions for a session
CREATE INDEX idx_executions_session ON agent_executions(session_id, started_at DESC);
-- Active executions (partial index)
CREATE INDEX idx_executions_running ON agent_executions(status) WHERE status = 'running';
-- Global date range queries
CREATE INDEX idx_executions_org_date ON agent_executions(org_id, started_at DESC);
-- Filter by channel
CREATE INDEX idx_executions_org_agent_channel ON agent_executions(org_id, agent_id, channel);
```

### 2.5 `agent_execution_nodes`

Per-node visit data. Stores the full messages array sent to the LLM (potentially large JSONB).

```sql
CREATE TABLE agent_execution_nodes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  uuid NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  node_id       text NOT NULL,
  step_order    integer NOT NULL,
  messages_sent jsonb NOT NULL,           -- full messages array sent to LLM
  response      jsonb NOT NULL,           -- full LLM response including tool calls
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer NOT NULL DEFAULT 0,
  cost          numeric(12,6) NOT NULL DEFAULT 0,
  duration_ms   integer NOT NULL DEFAULT 0,
  model         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Ordered node visits for an execution (primary access pattern)
CREATE INDEX idx_exec_nodes_execution ON agent_execution_nodes(execution_id, step_order);
```

### 2.6 `agent_execution_messages`

Conversation history for a session. Rebuilt on every request.

```sql
CREATE TABLE agent_execution_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  execution_id  uuid NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content       jsonb NOT NULL,
  tool_calls    jsonb,
  tool_call_id  text,
  node_id       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Rebuild conversation history (hit on every request)
CREATE INDEX idx_exec_messages_session ON agent_execution_messages(session_id, created_at ASC);
-- Messages for a specific execution
CREATE INDEX idx_exec_messages_execution ON agent_execution_messages(execution_id);
```

### 2.7 Materialized View — Agent Execution Summary

For dashboard level 1 fast reads.

```sql
CREATE MATERIALIZED VIEW agent_execution_summary AS
SELECT
  e.org_id,
  e.agent_id,
  e.version,
  COUNT(*)                                    AS total_executions,
  SUM(e.total_input_tokens)                   AS total_input_tokens,
  SUM(e.total_output_tokens)                  AS total_output_tokens,
  SUM(e.total_cost)                           AS total_cost,
  COUNT(DISTINCT e.tenant_id)                 AS unique_tenants,
  COUNT(DISTINCT e.external_user_id)          AS unique_users,
  COUNT(DISTINCT e.session_id)                AS unique_sessions,
  MAX(e.started_at)                           AS last_execution_at
FROM agent_executions e
WHERE e.status = 'completed'
GROUP BY e.org_id, e.agent_id, e.version;

CREATE UNIQUE INDEX idx_exec_summary_pk ON agent_execution_summary(org_id, agent_id, version);
```

**Refresh strategy:** Throttled — refresh at most once every 30 seconds, triggered by execution completion. Use a simple `last_refreshed_at` check in the Express backend before calling `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Under high throughput, stale data up to 30s is acceptable for dashboard aggregates.

### 2.8 Concurrency Control

Concurrent requests to the same session must be serialized. Use `SELECT ... FOR UPDATE NOWAIT` on the `agent_sessions` row during Step 2 (Fetch data). This acquires a row-level lock that prevents other requests for the same session from proceeding until the current execution completes and the session row is updated. If the lock is already held by another request, `NOWAIT` fails immediately and the backend returns 429 Too Many Requests.

```sql
-- In the transaction that fetches session state:
SELECT * FROM agent_sessions
WHERE agent_id = $1 AND version = $2 AND tenant_id = $3
  AND user_id = $4 AND session_id = $5 AND channel = $6
FOR UPDATE NOWAIT;
-- If NOWAIT fails (lock held), catch the error and return 429
```

### 2.9 RLS

All new tables use RLS scoped to org membership (same pattern as existing tables). The Express backend uses the service role key for execution-path queries (bypasses RLS). The Next.js frontend uses the authenticated key with RLS for dashboard queries.

---

## 3. API Keys Management UI

### 3.1 Key Generation

1. User clicks "Create Key" → modal with name input + agent multi-select (published agents only)
2. Backend generates: `clr_` prefix + 48 random bytes base62-encoded (~68 chars total)
3. Backend stores SHA-256 hash (`key_hash`) + first 12 chars (`key_prefix`)
4. Returns full key once → frontend shows "copy to clipboard" dialog with warning: "This key won't be shown again"

### 3.2 Key Lifecycle

- **List**: Table with columns: Name, Key (prefix), Agents (count + expandable), Created, Last Used, Actions
- **Edit**: Rename or change agent assignments (never see full key again)
- **Delete**: Confirmation dialog → hard delete (cascades to join table)
- **No regeneration**: Delete and create new if compromised
- **Empty state**: Illustration + "Create your first API key to start using your agents via API"

### 3.3 UI Quality

Use impeccable skills (`frontend-design`, `critique`, `polish`) during implementation for production-grade UI.

---

## 4. Express Backend Endpoint

### 4.1 Route

```
POST /api/agents/:agentSlug/:version
Authorization: Bearer <execution_api_key>
```

### 4.2 Request Body

The external-facing types use `IncomingMessage` to avoid confusion with the API package's internal `Message` type.

```typescript
// External-facing types (what the caller sends)
interface TextMessage {
  text: string;
}

interface MediaMessage {
  media: string;  // future: will process media; for now, interface only
  text?: string;
}

type IncomingMessage = TextMessage | MediaMessage;

interface AgentExecutionInput {
  tenantId: string;
  userId: string;
  sessionId: string;
  message: IncomingMessage;
  model?: string;                       // defaults to "x-ai/grok-4.1-fast"
  context?: Record<string, unknown>;    // context preconditions data
  channel?: 'whatsapp' | 'web';        // defaults to "web"
  stream?: boolean;                     // defaults to false
}
```

**Type mapping note:** The Express backend transforms `IncomingMessage` into the API package's internal `Message` type (which includes `provider`, `id`, `timestamp`, `originalId`, `type`, `message: ModelMessage`, etc.) before building the edge function payload. The `model` field from the request is mapped to `modelId` in the `Context` object (matching the API package's interface).

### 4.3 Request Pipeline

**Step 1 — Auth:**
1. Extract Bearer token from Authorization header
2. SHA-256 hash the token
3. Lookup `agent_execution_keys` WHERE `key_hash = <hash>` → get `org_id`, `key_id`
4. Not found → 401
5. Check `expires_at IS NULL OR expires_at > now()` → 401 if expired
6. Resolve agent by slug + org_id → get `agent_id` (slug is globally unique; org_id check is a security verification)
7. Check `agent_execution_key_agents` for `(key_id, agent_id)` → 403 if not found
8. Validate version exists in `agent_versions` → 404 if not found
9. Update `last_used_at` async

**Step 2 — Fetch data (parallelized):**
- Graph snapshot: `agent_versions.graph_data` WHERE `agent_id + version`
- OpenRouter key: `agents.production_api_key_id` → `org_api_keys.encrypted_value` → decrypt → error 422 if missing
- Env variables: `org_env_variables` WHERE `org_id`
- OAuth tokens: `mcp_oauth_connections` WHERE `org_id`
- Session: `agent_sessions` WHERE unique composite → get `current_node_id`, `structured_outputs` (or create new session)
- Message history: `agent_execution_messages` WHERE `session_id` ORDER BY `created_at ASC`

**Step 3 — Pre-execution persistence:**
- Create `agent_executions` row with `status: 'running'`
- Save incoming user message to `agent_execution_messages`

**Step 4 — Resolve env variables:**
- Replace `{{VARIABLE}}` placeholders in MCP transport configs with values from `org_env_variables` and OAuth tokens (same logic as simulation)

**Step 4.5 — Transform incoming message:**
- Convert `IncomingMessage` (external) → API package's internal `Message` type
- Set `provider` based on `channel` ('web' → `WEB`, 'whatsapp' → `WHATSAPP`)
- Generate `id`, `originalId`, set `timestamp`, `type: 'text'`
- Append the transformed message to the existing message history array

**Step 5 — Build edge function payload:**

The payload uses the API package's internal types (not the external-facing ones). The incoming message has already been appended to `messages`.

```typescript
{
  graph: RuntimeGraph,                // resolved transport configs
  apiKey: string,                     // decrypted OpenRouter key
  modelId: string,                    // mapped from request's "model", default "x-ai/grok-4.1-fast"
  currentNodeId: string,              // from session or graph.startNode
  messages: Message[],                // full history INCLUDING the new incoming message (API package's Message type)
  structuredOutputs: Record<string, unknown[]>,
  data: Record<string, unknown>,      // context preconditions (from request's "context" field)
  quickReplies: Record<string, string>, // empty object for API execution (not exposed to external callers)
  sessionID: string,
  tenantID: string,
  userID: string,
  isFirstMessage: boolean
}
```

**Step 6 — Call Supabase Edge Function:**
- POST to `https://<project>.supabase.co/functions/v1/execute-agent`
- Always streams SSE from edge function to Express (regardless of caller's `stream` preference)

**Step 7 — Process results:**
- Collect node visit data (messages sent, response, tokens, cost, duration per node)
- Collect new messages (assistant responses, tool calls, tool results)
- Track visited nodes and final `currentNodeId`

**Step 8 — Post-execution persistence:**
- Save all new messages to `agent_execution_messages`
- Save all node visits to `agent_execution_nodes`
- Update `agent_executions`: status → completed, fill totals, set `completed_at`
- Update `agent_sessions.current_node_id` and `structured_outputs`
- If failed: status → failed, store error
- Refresh materialized view (async, non-blocking)

**Step 9 — Response to caller:**

If `stream: false` (default):
```json
{
  "text": "Here's a pasta recipe...",
  "currentNodeId": "node_3",
  "visitedNodes": ["node_1", "node_2", "node_3"],
  "toolCalls": [{"name": "search", "args": {}, "result": {}}],
  "structuredOutputs": {"node_3": [{"name": "Pasta"}]},
  "tokenUsage": {
    "inputTokens": 300,
    "outputTokens": 120,
    "cachedTokens": 10,
    "totalCost": 0.005
  },
  "durationMs": 3400
}
```

If `stream: true`: Forward public SSE events (text, toolCall, nodeVisited, tokenUsage, structuredOutput, complete, error). Internal events (nodeProcessed, newMessage) are NOT forwarded.

### 4.4 Error Responses

| Status | Condition |
|--------|-----------|
| 400 | Invalid body (missing required fields) |
| 401 | Missing or invalid Bearer token, or key expired |
| 403 | Key doesn't have access to this agent |
| 404 | Agent slug not found, or version not published |
| 422 | No production OpenRouter key configured |
| 429 | Concurrent request to the same session (lock held) |
| 500 | Edge function error or internal failure |

### 4.5 SSE Event Format (stream: true)

```
event: text
data: {"chunk": "Hello! I'd be happy to..."}

event: toolCall
data: {"name": "search_recipes", "args": {...}, "result": {...}}

event: nodeVisited
data: {"nodeId": "node_2", "nodeName": "Recipe Finder"}

event: tokenUsage
data: {"inputTokens": 150, "outputTokens": 42, "cost": 0.0023}

event: structuredOutput
data: {"nodeId": "node_3", "data": {"name": "Pasta", "ingredients": [...]}}

event: complete
data: {
  "currentNodeId": "node_3",
  "visitedNodes": ["node_1", "node_2", "node_3"],
  "totalInputTokens": 300,
  "totalOutputTokens": 120,
  "totalCachedTokens": 10,
  "totalCost": 0.005,
  "totalDurationMs": 3400,
  "structuredOutputs": {"node_3": [{"name": "Pasta"}]},
  "text": "Here's a pasta recipe..."
}

event: error
data: {"message": "..."}
```

---

## 5. Supabase Edge Function

### 5.1 Purpose

Stateless serverless function. Receives everything, executes the agent, streams results back. No DB access, no secrets resolution.

### 5.2 Location

`supabase/functions/execute-agent/`

### 5.3 Input

Complete payload built by Express (Section 4.3, Step 5). All types are from the API package's internal types:
- `graph` — `RuntimeGraph` with fully resolved MCP transport configs (no `{{VARIABLE}}` placeholders)
- `apiKey` — decrypted OpenRouter key value
- `modelId` — LLM model ID (e.g., `"x-ai/grok-4.1-fast"`)
- `currentNodeId` — current position or `graph.startNode`
- `messages` — `Message[]` full message history INCLUDING the new incoming message (already appended by Express)
- `structuredOutputs` — `Record<string, unknown[]>` accumulated from previous executions in this session
- `data` — `Record<string, unknown>` context preconditions (from caller's `context` field)
- `quickReplies` — `Record<string, string>` empty object for API execution
- `sessionID`, `tenantID`, `userID`
- `isFirstMessage` — `boolean` true if no prior messages in session

### 5.4 Execution

1. Build `Context` object from payload fields:
   - Map `apiKey` → `context.apiKey`, `modelId` → `context.modelId`
   - Map `data` → `context.data`, `quickReplies` → `context.quickReplies`
   - Set `context.sessionID`, `context.tenantID`, `context.userID`
   - Set `context.isFirstMessage` from payload
   - Set `context.graph` from payload `graph`
2. Create MCP clients for each `graph.mcpServers` entry (transport configs are fully resolved)
3. Extract tools from MCP connections → build `toolsOverride`
4. Call `executeWithCallbacks()` with:
   - `context` (built above)
   - `messages` (from payload, already includes incoming message)
   - `currentNode` (from payload `currentNodeId`)
   - `toolsOverride` (from MCP clients)
   - `structuredOutputs` (from payload)
   - `onNodeVisited` and `onNodeProcessed` callbacks for SSE emission
5. Stream events via SSE as callbacks fire

**Note:** `channel` is NOT passed to the edge function — it is metadata for persistence only, handled entirely by Express. The `Context` interface does not have a `channel` field.

### 5.5 Output (always SSE)

Public events (forwarded to caller if streaming):
- `text` — LLM response chunk
- `toolCall` — tool invocation and result
- `nodeVisited` — node transition
- `tokenUsage` — per-node token metrics
- `structuredOutput` — generated structured data
- `complete` — final summary with totals
- `error` — execution failure

Internal events (used by Express for persistence, not forwarded):
- `nodeProcessed` — full messages array sent to LLM, response, tokens, cost, duration, model per node
- `newMessage` — each new message (assistant, tool) with role, content, tool calls, node ID

### 5.6 Required API Package Changes

The following changes to `@daviddh/llm-graph-runner` are needed for this feature:

1. **Extend `NodeProcessedEvent`** with a `messagesSent: ModelMessage[][]` field — the full messages array sent to the LLM at this node. Currently `NodeProcessedEvent` only has `nodeId`, `text`, `output`, `toolCalls`, `reasoning`, `error`, `tokens`, `durationMs`, `structuredOutput`. The `messagesSent` field is required to persist the debug data in `agent_execution_nodes.messages_sent`. Alternative: use `CallAgentOutput.debugMessages` (which is `Record<string, ModelMessage[][]>`) at execution completion to extract per-node messages.

2. **Structured outputs accumulation format:** The `agent_sessions.structured_outputs` column stores `Record<string, unknown[]>` (keyed by nodeId, each value is an array of outputs from that node across executions). This matches the format accepted by `ExecuteWithCallbacksOptions.structuredOutputs`. The `CallAgentOutput.structuredOutputs` returns `Array<{ nodeId: string; data: unknown }>` — the Express backend must merge these into the accumulated format before persisting.

### 5.7 Dependencies

- `@daviddh/llm-graph-runner` (the API package)
- Deno runtime (assume compatibility)

---

## 6. Dashboard UI

### 6.1 Routes

- Level 1: `/orgs/[slug]/dashboard` — Agent summary
- Level 2: `/orgs/[slug]/dashboard/[agentSlug]` — Sessions for one agent
- Level 3: `/orgs/[slug]/dashboard/[agentSlug]/sessions/[sessionId]` — Session debug view

### 6.2 Level 1 — Agent Summary Table

Each row is one agent. Data source: `agent_execution_summary` materialized view.

| Column | Sortable |
|--------|----------|
| Agent name | yes (links to level 2) |
| Total executions | yes |
| Total tokens | yes |
| Total cost | yes |
| Unique tenants | yes |
| Unique users | yes |
| Unique sessions | yes |
| Last execution | yes |

Filters (combinable, AND logic):
- Date range (from/to)
- Agent (multi-select)
- Version
- Channel (whatsapp/web)
- Model

Pagination: Cursor-based, default 50 rows.

### 6.3 Level 2 — Agent Sessions Table

Each row is a unique session. Breadcrumb: `Dashboard > Agent Name`.

| Column | Sortable |
|--------|----------|
| Tenant ID | yes |
| User ID | yes |
| Session ID | yes |
| Channel | yes |
| Current node | no |
| Total executions | yes |
| Total tokens | yes |
| Total cost | yes |
| Model | yes |
| Created | yes |
| Last activity | yes |

Filters (combinable):
- Date range
- Tenant (text search / multi-select)
- User (text search / multi-select)
- Channel
- Model
- Version
- Status (active/idle)

Pagination: Cursor-based, default 50 rows.

### 6.4 Level 3 — Session Debug View

Breadcrumb: `Dashboard > Agent Name > Session ID`.

**Top bar:** Session metadata — agent name, version, tenant, user, session ID, channel, total executions, total tokens, total cost, total duration. Execution timeline/stepper to switch between executions.

**Left panel — Read-only canvas:**
- Base: published graph for the agent at this version
- Trim logic:
  - Keep all visited nodes (highlighted, colored by kind)
  - At decision points where a branch was NOT taken: keep the first node of the unchosen branch, rendered muted/gray with reduced opacity
  - Remove everything else
  - Edges between visited nodes are normal; edges to muted nodes are muted
- Read-only: no editing, no dragging, no panels, no toolbars
- Uses original Dagre layout positions from published graph

**Right panel — Node inspection (on click):**

For visited nodes:
- Node name and kind
- Full messages array sent to LLM (collapsible, syntax-highlighted JSON)
- LLM response (text + tool calls)
- Structured output (if any)
- Token usage (input/output/cached) and cost
- Duration
- Model used

For muted/unchosen nodes:
- Node name and kind
- Label: "Not visited — agent chose a different path"

### 6.5 Shared Components

- **FilterBar** — active filters as chips/tags, "Add filter" dropdown, each filter type has its own input (date picker, multi-select, text search). Combinable with AND logic.
- **SortableTable** — clickable column headers (single sort, toggles asc/desc), pagination controls at bottom.
- Both generic, reused at levels 1 and 2.

### 6.6 Data Fetching

All queries via Next.js server actions → Supabase with RLS. Node inspection data (`agent_execution_nodes`) fetched on click, not eagerly.

### 6.7 UI Quality

Use impeccable skills during implementation: `frontend-design` for initial build, `critique` for evaluation, `polish` for final pass.

---

## Non-Functional Requirements

- **Security**: All secrets encrypted at rest (pgsodium for reversible, SHA-256 for one-way). Execution API keys shown only once. RLS on all tables. OAuth tokens encrypted.
- **Performance**: Denormalized execution data for dashboard queries. Composite indexes on all filter/sort columns. Materialized view for level 1 aggregates (throttled refresh, max once per 30s). Cursor-based pagination (default 50 rows).
- **Streaming**: Edge function always streams to Express. Express streams to caller only if `stream: true`. Default is `stream: false` (single JSON response).
- **Reliability**: Incoming user message saved before execution. Execution row created with `status: running` before calling edge function. Failed executions recorded with error details.
- **Concurrency**: Same-session requests serialized via `SELECT ... FOR UPDATE` on `agent_sessions`. Returns 429 if lock cannot be acquired.
- **Timeouts**: Supabase Edge Functions have a timeout limit (60s default, 150s on paid plans). If the SSE stream closes without a `complete` event, Express marks the execution as `failed` with error "Edge function timeout". Long-running agent executions (many nodes, slow tools) must be considered when configuring the Supabase plan.
- **Rate limiting**: Deferred to a future sub-project. When implemented, should support per-key and per-org limits. For now, the execution key + agent scoping provides basic access control.

## Notes

- **Agent slug uniqueness**: `agents.slug` is currently globally unique (not scoped to org). The auth step resolves by slug first, then verifies the agent's `org_id` matches the key's `org_id` as a security check.
- **`currentNodeId` default**: Uses the graph's `startNode` field (from the published `RuntimeGraph`) rather than a hardcoded string. The `agent_sessions.current_node_id` column defaults to `'INITIAL_STEP'` which must match whatever `startNode` resolves to in the API package.
- **Instagram channel**: The API package's `MESSAGES_PROVIDER` includes `INSTAGRAM`. The `channel` CHECK constraint currently only allows `'whatsapp' | 'web'`. Instagram can be added to the CHECK constraint when needed.
