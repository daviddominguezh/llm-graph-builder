# Plan 3: Express Endpoint + Supabase Edge Function

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `POST /api/agents/:agentSlug/:version` Express endpoint that authenticates via execution API keys, gathers all required data, invokes a stateless Supabase Edge Function to execute the agent, and persists all execution results for the dashboard.

**Architecture:** The Express backend receives the request, validates the execution API key (SHA-256 hash lookup), fetches all required data (graph snapshot, session state, message history, env vars, OpenRouter key), transforms the incoming message to the internal format, saves it pre-execution, calls the Supabase Edge Function with a complete payload, processes the streaming results, persists everything post-execution, and responds to the caller (SSE or JSON). The Edge Function is fully stateless — it uses `@daviddh/llm-graph-runner` to execute the agent and streams events back.

**Tech Stack:** Express 5.x, Supabase JS SDK, `@daviddh/llm-graph-runner`, Deno (Edge Function), crypto (SHA-256), zod (validation)

**Spec:** `docs/superpowers/specs/2026-03-21-agent-execution-api-design.md` (Sections 4 and 5)

**Depends on:** Plan 1 (DB schema), Plan 2 (execution keys)

---

## File Structure

### New files (backend)
- `packages/backend/src/routes/execute/executeAuth.ts` — Execution API key auth (hash, lookup, validate agent access)
- `packages/backend/src/routes/execute/executeHandler.ts` — Main orchestrator (fetch data, call edge function, persist results)
- `packages/backend/src/routes/execute/executeRoute.ts` — Route definition + request validation
- `packages/backend/src/routes/execute/executeTypes.ts` — Request/response types
- `packages/backend/src/routes/execute/executePersistence.ts` — DB persistence (pre/post execution)
- `packages/backend/src/routes/execute/edgeFunctionClient.ts` — Call edge function + parse SSE stream
- `packages/backend/src/db/queries/executionQueries.ts` — Session, execution, message DB queries

### New files (edge function)
- `supabase/functions/execute-agent/index.ts` — Edge function entry point

### Modified files
- `packages/backend/src/server.ts` — Register new route
- `packages/backend/src/types.ts` — Add execution event types

---

## Task 1: Create execution DB queries

**Files:**
- Create: `packages/backend/src/db/queries/executionQueries.ts`

- [ ] **Step 1: Create types and session queries**

Functions needed:
- `getOrCreateSession(supabase, { agentId, version, tenantId, userId, sessionId, channel, model })` — SELECT with FOR UPDATE NOWAIT on the unique composite, or INSERT if not found. Returns `{ session, isNew, error }`.
- `getSessionMessages(supabase, sessionId)` — SELECT from `agent_execution_messages` ordered by `created_at ASC`. Returns internal `Message[]` format.
- `updateSessionAfterExecution(supabase, sessionId, { currentNodeId, structuredOutputs })` — UPDATE session row.

- [ ] **Step 2: Create execution lifecycle queries**

- `createExecution(supabase, { sessionId, orgId, agentId, version, tenantId, externalUserId, channel, executionKeyId, model })` — INSERT into `agent_executions` with status='running'. Returns execution id.
- `completeExecution(supabase, executionId, { totalInputTokens, totalOutputTokens, totalCachedTokens, totalCost, totalDurationMs })` — UPDATE status='completed', set totals and completed_at.
- `failExecution(supabase, executionId, errorMessage)` — UPDATE status='failed', set error and completed_at.

- [ ] **Step 3: Create message and node persistence queries**

- `saveMessage(supabase, { sessionId, executionId, role, content, toolCalls, toolCallId, nodeId })` — INSERT into `agent_execution_messages`.
- `saveNodeVisit(supabase, { executionId, nodeId, stepOrder, messagesSent, response, inputTokens, outputTokens, cachedTokens, cost, durationMs, model })` — INSERT into `agent_execution_nodes`.
- `refreshExecutionSummary(supabase)` — REFRESH MATERIALIZED VIEW CONCURRENTLY (with throttling check).

- [ ] **Step 4: Create helper to fetch graph + OpenRouter key + env vars**

- `getPublishedGraph(supabase, agentId, version)` — SELECT `graph_data` from `agent_versions`. Returns `RuntimeGraph | null`.
- `getAgentBySlugAndOrg(supabase, slug, orgId)` — SELECT agent by slug, verify org_id matches. Returns `{ agentId, productionApiKeyId } | null`.
- `getDecryptedApiKey(supabase, keyId)` — Call RPC `get_api_key_value`. Returns decrypted string.
- `getOrgEnvVariables(supabase, orgId)` — SELECT all env vars, decrypt values via RPC. Returns `Record<string, string>`.

- [ ] **Step 5: Run typecheck, commit**

Run: `npm run typecheck -w packages/backend`

```bash
git add packages/backend/src/db/queries/executionQueries.ts
git commit -m "feat: add execution DB query functions"
```

---

## Task 2: Create execution API key auth

**Files:**
- Create: `packages/backend/src/routes/execute/executeAuth.ts`

- [ ] **Step 1: Implement key validation**

```typescript
import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export interface ExecutionAuthLocals {
  orgId: string;
  keyId: string;
  agentId: string;
}
```

Create middleware `requireExecutionAuth(req, res, next)`:
1. Extract Bearer token from Authorization header → 401 if missing
2. Hash the token with SHA-256
3. Query `agent_execution_keys` WHERE `key_hash = hash` → 401 if not found
4. Check `expires_at IS NULL OR expires_at > now()` → 401 if expired
5. Extract `agentSlug` and `version` from `req.params`
6. Query agent by slug, verify `org_id` matches key's org → 404 if not found
7. Query `agent_execution_key_agents` for `(key_id, agent_id)` → 403 if not found
8. Validate version exists in `agent_versions` → 404 if not found
9. Set `res.locals = { orgId, keyId, agentId, version }` (typed as `ExecutionAuthLocals`)
10. Update `last_used_at` async (non-blocking)
11. Call `next()`

**Important:** This middleware uses a **service role Supabase client** (not JWT-scoped) because execution API keys are not Supabase auth tokens. Create the service role client using `SUPABASE_SERVICE_ROLE_KEY` env var.

- [ ] **Step 2: Run typecheck, commit**

```bash
git add packages/backend/src/routes/execute/
git commit -m "feat: add execution API key auth middleware"
```

---

## Task 3: Create request types and validation

**Files:**
- Create: `packages/backend/src/routes/execute/executeTypes.ts`

- [ ] **Step 1: Define request body schema with zod**

```typescript
import { z } from 'zod';

const TextMessageSchema = z.object({ text: z.string().min(1) });
const MediaMessageSchema = z.object({ media: z.string(), text: z.string().optional() });
const IncomingMessageSchema = z.union([TextMessageSchema, MediaMessageSchema]);

export const AgentExecutionInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  message: IncomingMessageSchema,
  model: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  channel: z.enum(['whatsapp', 'web']).optional().default('web'),
  stream: z.boolean().optional().default(false),
});

export type AgentExecutionInput = z.infer<typeof AgentExecutionInputSchema>;
```

- [ ] **Step 2: Define execution event types**

Types for SSE events between edge function and Express, and between Express and caller:

```typescript
// Internal events (edge function → Express, for persistence)
export interface NodeProcessedInternalEvent {
  type: 'nodeProcessed';
  nodeId: string;
  stepOrder: number;
  messagesSent: unknown[]; // full messages array sent to LLM
  response: unknown;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  durationMs: number;
  model: string;
}

export interface NewMessageInternalEvent {
  type: 'newMessage';
  role: 'assistant' | 'tool' | 'system';
  content: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  nodeId: string;
}

// Public events (Express → caller, if stream: true)
export interface TextEvent { type: 'text'; chunk: string; }
export interface ToolCallEvent { type: 'toolCall'; name: string; args: unknown; result: unknown; }
export interface NodeVisitedEvent { type: 'nodeVisited'; nodeId: string; nodeName?: string; }
export interface TokenUsageEvent { type: 'tokenUsage'; inputTokens: number; outputTokens: number; cost: number; }
export interface StructuredOutputEvent { type: 'structuredOutput'; nodeId: string; data: unknown; }
export interface CompleteEvent { type: 'complete'; /* full summary */ }
export interface ErrorEvent { type: 'error'; message: string; }

export type ExecutionEvent =
  | NodeProcessedInternalEvent | NewMessageInternalEvent
  | TextEvent | ToolCallEvent | NodeVisitedEvent
  | TokenUsageEvent | StructuredOutputEvent | CompleteEvent | ErrorEvent;
```

- [ ] **Step 3: Define JSON response type (for non-streaming)**

```typescript
export interface AgentExecutionResponse {
  text: string;
  currentNodeId: string;
  visitedNodes: string[];
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>;
  structuredOutputs: Record<string, unknown[]>;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalCost: number;
  };
  durationMs: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/execute/executeTypes.ts
git commit -m "feat: add execution request/response types and validation"
```

---

## Task 4: Create edge function client

**Files:**
- Create: `packages/backend/src/routes/execute/edgeFunctionClient.ts`

- [ ] **Step 1: Implement SSE stream parser**

Create a function that POSTs the payload to the edge function URL and returns an async iterable of parsed events:

```typescript
export async function* callEdgeFunction(
  payload: Record<string, unknown>
): AsyncGenerator<ExecutionEvent> {
  const url = getRequiredEnv('SUPABASE_EDGE_FUNCTION_URL'); // e.g. https://xxx.supabase.co/functions/v1/execute-agent
  const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function error (${response.status}): ${text}`);
  }

  // Parse SSE stream from response.body
  // Each line: "data: {json}\n\n"
  // Yield parsed ExecutionEvent objects
}
```

Use `response.body` as a ReadableStream, parse SSE format line by line, JSON.parse each `data:` line into an `ExecutionEvent`.

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/routes/execute/edgeFunctionClient.ts
git commit -m "feat: add edge function SSE client"
```

---

## Task 5: Create persistence layer

**Files:**
- Create: `packages/backend/src/routes/execute/executePersistence.ts`

- [ ] **Step 1: Implement pre-execution persistence**

```typescript
export async function persistPreExecution(
  supabase: SupabaseClient,
  params: { session, input, executionKeyId, model, channel }
): Promise<{ executionId: string }> {
  // 1. Create execution row (status: 'running')
  // 2. Save incoming user message to agent_execution_messages
  // Return executionId
}
```

- [ ] **Step 2: Implement post-execution persistence**

```typescript
export async function persistPostExecution(
  supabase: SupabaseClient,
  params: {
    executionId: string;
    sessionId: string;
    nodeVisits: NodeProcessedInternalEvent[];
    newMessages: NewMessageInternalEvent[];
    currentNodeId: string;
    structuredOutputs: Record<string, unknown[]>;
    totals: { inputTokens, outputTokens, cachedTokens, cost, durationMs };
  }
): Promise<void> {
  // 1. Save all new messages to agent_execution_messages
  // 2. Save all node visits to agent_execution_nodes
  // 3. Complete execution (status: 'completed', fill totals)
  // 4. Update session (current_node_id, structured_outputs)
  // 5. Refresh materialized view (async, throttled)
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/execute/executePersistence.ts
git commit -m "feat: add execution persistence layer"
```

---

## Task 6: Create the main handler

**Files:**
- Create: `packages/backend/src/routes/execute/executeHandler.ts`

- [ ] **Step 1: Implement the orchestrator**

This is the core of the endpoint. The handler:

1. Parses and validates the request body with `AgentExecutionInputSchema`
2. Creates a service-role Supabase client
3. Fetches all data in parallel:
   - Graph snapshot (published version)
   - OpenRouter key (decrypt from `org_api_keys`)
   - Org env variables (for MCP transport resolution)
   - Session state (getOrCreateSession with FOR UPDATE NOWAIT → 429 if locked)
   - Message history
4. Transforms incoming message to internal `Message` format
5. Resolves MCP transport variables (same logic as simulate route)
6. Persists pre-execution data
7. Builds edge function payload
8. Calls edge function, collecting events
9. If `stream: true`: forward public events as SSE to caller while collecting internal events
10. If `stream: false`: collect all events, build JSON response at the end
11. Persists post-execution data
12. On error: mark execution as failed

Follow the SSE pattern from `simulateHandler.ts`: `setSseHeaders(res)`, `writeSSE(res, event)`, `res.end()`.

Key function signature:
```typescript
export async function handleExecute(
  req: Request<{ agentSlug: string; version: string }>,
  res: Response
): Promise<void>
```

- [ ] **Step 2: Run typecheck, commit**

```bash
git add packages/backend/src/routes/execute/executeHandler.ts
git commit -m "feat: add agent execution handler"
```

---

## Task 7: Register the route

**Files:**
- Create: `packages/backend/src/routes/execute/executeRoute.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Create route file**

```typescript
import { Router } from 'express';
import { requireExecutionAuth } from './executeAuth.js';
import { handleExecute } from './executeHandler.js';

export const executeRouter = Router();

// POST /api/agents/:agentSlug/:version
executeRouter.post('/:agentSlug/:version', requireExecutionAuth, handleExecute);
```

- [ ] **Step 2: Register in server.ts**

In `packages/backend/src/server.ts`, add the execute route as a **public route** (it uses its own auth, not JWT):

```typescript
import { executeRouter } from './routes/execute/executeRoute.js';
// ...
app.use('/api/agents', executeRouter);
```

Make sure this doesn't conflict with existing `/agents` routes (the existing ones use `/agents/:agentId/graph` etc., the new one uses `/api/agents/:agentSlug/:version`).

- [ ] **Step 3: Run typecheck, commit**

```bash
git add packages/backend/src/routes/execute/ packages/backend/src/server.ts
git commit -m "feat: register agent execution route"
```

---

## Task 8: Create Supabase Edge Function

**Files:**
- Create: `supabase/functions/execute-agent/index.ts`

- [ ] **Step 1: Create the edge function**

The edge function:
1. Reads the JSON body (the complete payload from Express)
2. Builds the `Context` object: maps `apiKey`, `modelId`, `data`, `quickReplies`, `sessionID`, `tenantID`, `userID`, `isFirstMessage`, `graph`
3. Creates MCP clients for `graph.mcpServers` entries → builds `toolsOverride`
4. Calls `executeWithCallbacks()` with context, messages, currentNodeId, toolsOverride, structuredOutputs
5. Uses callbacks to write SSE events: `onNodeVisited` → `nodeVisited` event, `onNodeProcessed` → `nodeProcessed` + `text` + `toolCall` + `tokenUsage` events
6. On completion: writes `complete` event with totals
7. On error: writes `error` event

SSE format: `data: ${JSON.stringify(event)}\n\n`

Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`

```typescript
Deno.serve(async (req) => {
  const payload = await req.json();
  // ... build context, create MCP session, execute
  // Return streaming Response with ReadableStream
});
```

**Note:** Import `@daviddh/llm-graph-runner` — ensure it's available in Deno. The user confirmed compatibility.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/execute-agent/
git commit -m "feat: add stateless agent execution edge function"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS across all packages

- [ ] **Step 2: Run format and lint**

Run: `npm run check`
Expected: PASS (fix any issues)

- [ ] **Step 3: Test the endpoint manually**

Start the backend: `npm run dev -w packages/backend`

Test with curl (will fail auth since we need a real execution key, but verify the route responds):
```bash
curl -X POST http://localhost:4000/api/agents/test-recipe/1 \
  -H "Authorization: Bearer fake-key" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"test","userId":"user1","sessionId":"s1","message":{"text":"Hello"}}'
```

Expected: 401 Unauthorized (auth validation works)

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix: address verification issues for execution endpoint"
```
