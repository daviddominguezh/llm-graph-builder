# MCP Provider

This module exposes MCP servers as Providers in the OpenFlow tool registry.
The abstraction is **runtime-agnostic**; connection mechanics are **per-runtime**.

## Architecture

### Shared (this package — `packages/api/src/providers/mcp/`)

- `types.ts` — `McpClient` and `McpConnector` interfaces.
- `buildMcpProvider.ts` — Provider factory. Calls `ctx.mcpConnector.connect(server)`,
  then adapts AI-SDK Tools to OpenFlowTools.
- `adapters.ts` — `aiSdkToolToOpenFlowTool`, `filterToolsByNames`,
  `describeAllAiSdkTools`. Used by both runtimes.
- `MockMcpConnector.ts` — Test fixture. Used by api tests AND by
  backend/edge tests when stubbing MCP.
- `conformance.ts` — `testConnectorConformance(name, factory, fixtures)`.
  Runs the full McpConnector contract test suite against any implementation.
  Not auto-discovered by jest (intentional file name).

### Per-runtime

- **Backend (Node/Express)** — `packages/backend/src/mcp/connector.ts`
  exports `createBackendMcpConnector()`. Uses `connectMcpClient` from
  `client.ts` (existing). Supports stdio + sse + http.
- **Edge function (Deno)** — `supabase/functions/execute-agent/index.ts`
  has its own inline `McpConnector` adapter. Supports sse + http only
  (Deno can't spawn stdio processes).

Both implementations MUST pass `testConnectorConformance` in their own
test file. Drift is caught by CI.

## Why split this way?

We considered relocating ALL MCP code into `packages/api` so a single
implementation served both runtimes. The cost was several days of
risky work moving production code, plus a Deno compatibility audit.
The benefit was a single source of truth for the connect logic — but
the runtimes are genuinely different (Deno can't do stdio; OAuth flow
helpers use Node APIs), so 100% sharing was never possible anyway.

The B+ approach moves ~110 lines of shared abstraction into api, leaves
~35 lines of connect logic in each runtime, and uses a typed contract
+ conformance suite to prevent drift. ~1.5 days of work vs ~5 days
for full relocation.

See `docs/superpowers/specs/2026-04-26-executor-refactor-design.md` for
the full design rationale.
