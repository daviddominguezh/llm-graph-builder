# MCP Pre-Connection Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate all MCP server connections before agent execution begins; abort with a clear, persisted error if any fail.

**Architecture:** The edge function's `createMcpTools()` is replaced with `validateAndConnectMcpServers()` that uses `Promise.allSettled()` to attempt all connections in parallel, collects failures, and emits an error SSE event if any fail. The frontend adds an `error` field to `ExecutionSummaryRow` and renders a destructive `Alert` banner in the debug view for failed executions.

**Tech Stack:** Deno (edge function), TypeScript, Next.js, shadcn/ui `Alert`, next-intl

**Spec:** `docs/superpowers/specs/2026-03-24-mcp-pre-connection-validation-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `supabase/functions/execute-agent/index.ts` | Replace `createMcpTools()` with `validateAndConnectMcpServers()` |
| Modify | `packages/web/app/lib/dashboard-queries.ts` | Add `error` field to `ExecutionSummaryRow` |
| Modify | `packages/web/app/components/dashboard/DebugView.tsx` | Add `ExecutionErrorBanner` for failed executions |
| Modify | `packages/web/messages/en.json` | Add `executionError` translation key |

---

### Task 1: Edge Function — Replace `createMcpTools` with `validateAndConnectMcpServers`

**Files:**
- Modify: `supabase/functions/execute-agent/index.ts:39-67`

**Context:** The current `createMcpTools()` (lines 53-67) connects servers sequentially in a `for` loop. If any server fails, the error propagates to the outer `catch` and surfaces as a generic error mid-stream. We need to:
1. Connect all servers in parallel via `Promise.allSettled()`
2. Collect all failures (server name + error message)
3. If any fail: clean up successful clients, emit a descriptive error, abort before `executeWithCallbacks()`
4. If all succeed: return tools + clients as before

The existing `connectMcpServer()` function (lines 43-51) stays unchanged — it handles individual transport connections.

- [ ] **Step 1: Replace `createMcpTools` with `validateAndConnectMcpServers`**

Replace the `createMcpTools` function (lines 53-67) with this new function. Keep `connectMcpServer` (lines 43-51) and `closeMcpClients` (lines 69-71) unchanged.

```typescript
interface McpConnectionResult {
  tools: Record<string, Tool>;
  clients: McpClient[];
}

interface McpConnectionFailure {
  server: string;
  error: string;
}

interface McpValidationResult {
  success: McpConnectionResult | null;
  failures: McpConnectionFailure[];
}

async function attemptMcpConnection(
  server: McpServerConfig
): Promise<{ client: McpClient; tools: Record<string, Tool> }> {
  const client = await connectMcpServer(server.transport);
  const tools = await client.tools();
  return { client, tools };
}

function buildMcpErrorMessage(failures: McpConnectionFailure[]): string {
  const details = failures.map((f) => `${f.server} (${f.error})`).join(', ');
  return `Failed to connect to MCP servers: ${details}`;
}

async function validateAndConnectMcpServers(
  servers: McpServerConfig[]
): Promise<McpValidationResult> {
  const enabled = servers.filter((s) => s.enabled);
  if (enabled.length === 0) return { success: { tools: {}, clients: [] }, failures: [] };

  const results = await Promise.allSettled(
    enabled.map((server) => attemptMcpConnection(server))
  );

  const clients: McpClient[] = [];
  const allTools: Record<string, Tool> = {};
  const failures: McpConnectionFailure[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const server = enabled[i]!;
    if (result.status === 'fulfilled') {
      clients.push(result.value.client);
      Object.assign(allTools, result.value.tools);
    } else {
      const errMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      failures.push({ server: server.name, error: errMsg });
    }
  }

  if (failures.length > 0) {
    await closeMcpClients(clients);
    return { success: null, failures };
  }

  return { success: { tools: allTools, clients }, failures: [] };
}
```

- [ ] **Step 2: Update the main handler to use `validateAndConnectMcpServers`**

In the `Deno.serve` handler (lines 133-218), replace the `try` block inside the `ReadableStream.start()` callback. The current code at lines 153-155 is:

```typescript
const mcp = await createMcpTools(mcpServers);
clients = mcp.clients;
```

Replace the entire `try` block (lines 153-206) with:

```typescript
        const validation = await validateAndConnectMcpServers(mcpServers);

        if (validation.success === null) {
          write({ type: 'error', message: buildMcpErrorMessage(validation.failures) });
          return;
        }

        clients = validation.success.clients;

        const context = buildContext(payload);
        const result = await executeWithCallbacks({
          context,
          messages: payload.messages,
          currentNode: payload.currentNodeId,
          toolsOverride: validation.success.tools,
          structuredOutputs: payload.structuredOutputs,
          onNodeVisited: (nodeId: string) => {
            write({ type: 'node_visited', nodeId });
          },
          onNodeProcessed: (event: NodeProcessedEvent) => {
            write({
              type: 'node_processed',
              nodeId: event.nodeId,
              text: event.text ?? '',
              output: event.output,
              toolCalls: event.toolCalls.map((tc) => ({
                toolName: tc.toolName,
                input: tc.input,
                output: tc.output,
              })),
              reasoning: event.reasoning,
              error: event.error,
              tokens: event.tokens,
              durationMs: event.durationMs,
              structuredOutput: event.structuredOutput,
            });
          },
        });

        if (result !== null) {
          const tokens = sumTokens(result);
          write({
            type: 'agent_response',
            text: result.text ?? '',
            visitedNodes: result.visitedNodes,
            toolCalls: result.toolCalls.map((tc) => ({
              toolName: tc.toolName,
              input: tc.input,
              output: undefined,
            })),
            nodeTokens: result.tokensLogs.map((l) => ({ node: l.action, tokens: l.tokens })),
            tokenUsage: tokens,
            debugMessages: result.debugMessages,
            structuredOutputs: result.structuredOutputs,
            parsedResults: result.parsedResults,
          });
        }

        write({ type: 'execution_complete' });
```

Note: The `catch` and `finally` blocks (lines 207-213) stay unchanged.

- [ ] **Step 3: Deploy and verify**

Run: `npx supabase functions serve execute-agent --no-verify-jwt`

Verify: The edge function starts without errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/execute-agent/index.ts
git commit -m "feat: validate all MCP connections before execution, abort on failure"
```

---

### Task 2: Frontend — Add `error` field to `ExecutionSummaryRow`

**Files:**
- Modify: `packages/web/app/lib/dashboard-queries.ts:39-50`

**Context:** `ExecutionSummaryRow` is the TypeScript type for execution records fetched from the database. The `agent_executions` table already has an `error` column (written by `failExecution()` in the backend), but the frontend type doesn't include it. We need to add it so the debug view can access error messages.

- [ ] **Step 1: Add `error` field to `ExecutionSummaryRow`**

In `packages/web/app/lib/dashboard-queries.ts`, add `error: string | null;` to the `ExecutionSummaryRow` interface. Current interface (lines 39-50):

```typescript
export interface ExecutionSummaryRow {
  id: string;
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  total_cost: number;
  total_duration_ms: number;
  started_at: string;
  completed_at: string | null;
  status: string;
}
```

Add `error: string | null;` after the `status` field:

```typescript
export interface ExecutionSummaryRow {
  id: string;
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  total_cost: number;
  total_duration_ms: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  error: string | null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS (no existing code accesses `error` yet, so adding it is additive-only)

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/lib/dashboard-queries.ts
git commit -m "feat: add error field to ExecutionSummaryRow type"
```

---

### Task 3: Frontend — Add execution error banner to DebugView

**Files:**
- Modify: `packages/web/app/components/dashboard/DebugView.tsx:82-141`
- Modify: `packages/web/messages/en.json` (add translation key)

**Context:** The `DebugView` component renders the debug canvas and node inspector for a session's executions. When an execution failed at the MCP pre-connection stage, it has `status === 'failed'`, a non-empty `error` string, and zero node visits. We need to show a destructive `Alert` banner in this case.

The `useExecutionState` hook (lines 48-80) tracks `selectedExecutionId` as a string. To access the execution's `status` and `error`, look up the selected execution from the `executions` prop array by ID.

The `Alert`, `AlertTitle`, and `AlertDescription` components are already installed at `components/ui/alert.tsx`. The `AlertCircle` icon from `lucide-react` can be used for the alert icon.

- [ ] **Step 1: Add translation key**

In `packages/web/messages/en.json`, inside the `"debug"` object (under `"dashboard"`), add:

```json
"executionError": "Execution Error"
```

Add it after the existing `"encryptedByProvider"` key (or at the end of the `"debug"` block).

- [ ] **Step 2: Add `ExecutionErrorBanner` and wire it into `DebugView`**

In `packages/web/app/components/dashboard/DebugView.tsx`:

1. Add imports for `Alert`, `AlertTitle`, `AlertDescription` from `@/components/ui/alert` and `AlertCircle` from `lucide-react`.

2. Add a helper function to find the selected execution:

```typescript
function findExecution(
  executions: ExecutionSummaryRow[],
  selectedId: string
): ExecutionSummaryRow | undefined {
  return executions.find((e) => e.id === selectedId);
}
```

3. Add the `ExecutionErrorBanner` component:

```typescript
function ExecutionErrorBanner({
  execution,
  label,
}: {
  execution: ExecutionSummaryRow;
  label: string;
}) {
  if (execution.status !== 'failed' || execution.error === null || execution.error === '') {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>{execution.error}</AlertDescription>
    </Alert>
  );
}
```

4. In the `DebugView` component body (after `const state = ...`), derive the selected execution:

```typescript
const selectedExecution = useMemo(
  () => findExecution(executions, state.selectedExecutionId),
  [executions, state.selectedExecutionId]
);
```

5. In the JSX, add the banner between `<SessionMetadataBar />` and the flex container with canvas + inspector. After line 116 (`<SessionMetadataBar ... />`), add:

```tsx
{selectedExecution !== undefined && (
  <ExecutionErrorBanner execution={selectedExecution} label={t('debug.executionError')} />
)}
```

- [ ] **Step 3: Run checks**

Run: `npm run check`
Expected: PASS (format, lint, typecheck all green)

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/dashboard/DebugView.tsx packages/web/messages/en.json
git commit -m "feat: show error banner in debug view for failed executions"
```
