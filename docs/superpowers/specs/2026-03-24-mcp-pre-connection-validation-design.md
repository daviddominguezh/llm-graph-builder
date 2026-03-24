# MCP Pre-Connection Validation

## Goal

Validate all MCP server connections before starting agent execution. If any MCP server fails to connect, abort the execution with a clear error visible in the debug view — preventing agents from getting stuck on nodes that require unavailable tools.

## Architecture

The edge function adds an upfront MCP connection phase before calling `executeWithCallbacks()`. All enabled MCP servers are connected in parallel via `Promise.allSettled()`. If any fail, the execution is aborted with a structured error listing every failed server. The error flows through the existing backend error pipeline (`failExecution`) and is displayed as a banner in the frontend debug view.

## Scope

| Layer | File | Change |
|-------|------|--------|
| Edge function | `supabase/functions/execute-agent/index.ts` | Replace `createMcpTools()` with `validateAndConnectMcpServers()` |
| Frontend type | `packages/web/app/lib/dashboard-queries.ts` | Add `error: string \| null` to `ExecutionSummaryRow` |
| Frontend UI | `packages/web/app/components/dashboard/DebugView.tsx` | Add error banner for failed executions |
| Translations | `packages/web/messages/en.json` | Add `mcpConnectionError` key |
| Backend | No changes | Existing error pipeline handles it |

## Design

### 1. Edge Function — MCP Pre-Connection Phase

**Current behavior:** `createMcpTools()` connects to MCP servers sequentially in a `for` loop. If any server fails, the error is caught by the outer `try/catch` and surfaces as a generic execution error mid-stream.

**New behavior:** Replace `createMcpTools()` with `validateAndConnectMcpServers()`:

1. Filter enabled servers.
2. Attempt all connections in parallel using `Promise.allSettled()`.
3. Partition results into successes (client + tools) and failures (server name + error message).
4. If any failures:
   - Clean up successfully connected clients.
   - Emit structured SSE event: `{ type: "mcp_connection_error", failures: [{ server, error }] }`.
   - Emit generic error event: `{ type: "error", message: "Failed to connect to MCP servers: Linear (connection refused), Slack (timeout)" }`.
   - Close the stream — do NOT call `executeWithCallbacks()`.
5. If all succeed: merge tools, return clients and tools. Proceed with execution as today.

**Key detail:** `Promise.allSettled()` ensures all servers are attempted, giving the user a complete picture of failures in one shot.

### 2. Backend — No Changes

The existing error pipeline already handles this correctly:

1. Edge function sends `{ type: "error", message }` SSE event.
2. `edgeFunctionClient.ts` parses it and throws an error.
3. `handleExecutionError()` catches it and calls `failExecution(supabase, executionId, message)`.
4. `failExecution()` sets `status: 'failed'` and stores the error text in the `error` column of `agent_executions`.
5. Error is forwarded to the caller via SSE or JSON.

### 3. Frontend — Error Display in Debug View

**Type change:** Add `error: string | null` to `ExecutionSummaryRow` in `dashboard-queries.ts`.

**Debug view banner:** When the selected execution has `status === 'failed'` and a non-empty `error` string (with zero node visits), render a destructive `Alert` banner between the `SessionMetadataBar` and the canvas/inspector area.

The banner displays the error message, e.g.:
> "Failed to connect to MCP servers: Linear (connection refused), Slack (timeout)"

When no nodes were visited, the canvas shows the full graph in its muted/unvisited state and the inspector shows an empty state. The error banner is the only new element.

**Component:** Uses shadcn `Alert` with `variant="destructive"`.

### 4. Error Message Format

**Structured SSE event** (for programmatic consumers):
```json
{
  "type": "mcp_connection_error",
  "failures": [
    { "server": "Linear", "error": "Connection refused" },
    { "server": "Slack", "error": "Request timeout" }
  ]
}
```

**Flattened string** (stored in `agent_executions.error`):
```
Failed to connect to MCP servers: Linear (Connection refused), Slack (Request timeout)
```

Each failure includes the server `name` from `McpServerConfig` and the error message from the caught exception.

## Non-Goals

- Chat/copilot-level error display (execution is triggered externally via API).
- Retry logic for failed MCP connections.
- Health-check endpoint for MCP servers.
- Pre-flight validation endpoint (separate from execution).
