# Sub-project 0 — Agent MCP runtime fix (bug)

**Date:** 2026-06-20
**Status:** Design — pending user review
**Parent:** `2026-06-20-tenant-scoped-mcp-OVERVIEW.md`
**Blocking for:** all per-tenant MCP work (Sub-projects 1–4)

## Problem

Agents (`appType==='agent'`) never execute MCP tools at runtime. A user can add MCP servers to an agent in the editor, select MCP tools, and publish — the servers are even snapshotted into the version — but production `/execute` runs the agent with **zero** MCP providers. The builder *preview* (`/simulate-agent`) wires MCP from the live editor graph, so it appears to work, hiding the bug.

## Root cause (verified, spike 2026-06-20)

On the live `/execute` path:

1. `executeFetcher.ts:176` — `const graph = appType === 'agent' ? EMPTY_GRAPH : ensureGraphData(graphData);`. `EMPTY_GRAPH` (lines 108-114) has no `mcpServers`.
2. `fetchAgentConfig` (`executeFetcher.ts:249-273`) reads `agent_versions.graph_data`, but its local `AgentGraphData` type (lines 234-238) doesn't declare `mcpServers`, so they're never surfaced.
3. Consequently `executeCore.ts:104` → `mcpServers = fetched.graph.mcpServers ?? []` → `[]`; `resolveOAuthBundle`→`resolveMcpBundles` gets `[]`; the edge payload's `graph` is `EMPTY_GRAPH`; the edge `buildRegistry` (`toolBuilder.ts:445`, `orgMcpServers: payload.graph.mcpServers ?? []`) registers no MCP providers.
4. The only code that *would* load agent MCP servers — `routeAgentExecution`/`createAgentMcpSession` (`executeAgentPath.ts`) — has **zero callers** (dead code; an abandoned in-process path superseded by the edge function).

`publish_agent_version_tx` (`20260618000000_publish_snapshot_with_locks.sql:249-257`) **does** snapshot `mcpServers` into `graph_data`, but omits `libraryItemId` and `variableValues` (which the workflow `publish_version_tx` includes). So the data exists at rest, incompletely, and is never read.

**Not a second gap:** the tool-selection path already supports MCP — `SelectedTool.providerType` includes `'mcp'` (`edge.schema.ts:9-11`), `useAgentRegistry` handles `type:'mcp'`, and both publish RPCs snapshot `selected_tools`. MCP providers only yield callable tools when referenced by a `selected_tools` entry, and that referencing works today.

## Fix

### 1. Surface snapshot `mcpServers` into the agent runtime graph
- Add `mcpServers?: McpServerConfig[]` to the `AgentGraphData` interface (`executeFetcher.ts:234`) and read it in `fetchAgentConfig`.
- In the `appType==='agent'` branch (`executeFetcher.ts:176`, or where `fetchAllCoreData` assembles `fetched.graph`), build the runtime graph as `EMPTY_GRAPH` **plus** `mcpServers` from the snapshot, instead of bare `EMPTY_GRAPH`.
- Nothing downstream changes: the existing `resolveMcpTransportVariables` and `resolveOAuthForExecution` transforms already key off `graph.mcpServers` (they currently early-return on `undefined`), `executeCore.ts:104` picks it up, `buildCoreExecuteParams` puts the populated graph in the edge payload, and the edge `buildRegistry` registers the providers. **No edge-function change.**

### 2. Widen `publish_agent_version_tx` mcpServers snapshot
- New migration: `CREATE OR REPLACE` `publish_agent_version_tx` so its `mcpServers` `jsonb_build_object` includes `libraryItemId` and `variableValues`, matching `publish_version_tx` (`...:126-136`). The resolution transforms need `variableValues` to substitute `{{placeholders}}` and `libraryItemId` for OAuth/library handling.
- Function-definition change only; no data backfill. **Existing published versions** have incomplete MCP snapshots → they resolve placeholders to empty until **republished**. Acceptable: MCP-on-agents never worked, so no regression; document that agents using MCP must republish to pick up the fix.

### 3. `selected_tools` — verified sufficient, no change
Confirmed the model/registry/snapshot already carry `mcp` refs. Include a regression test asserting an agent with a selected `mcp` tool produces a callable tool at runtime.

## Data flow after the fix

`publish_agent_version_tx` (widened) → `agent_versions.graph_data.mcpServers` (full fields) → `fetchAgentConfig` surfaces them → agent branch sets `fetched.graph.mcpServers` → `resolveMcpTransportVariables` (substitutes agent-wide `variableValues`, as the workflow path does today) + `resolveOAuthForExecution` → edge payload `graph.mcpServers` → `buildRegistry` registers providers → `selected_tools` `mcp` refs make them callable.

## Scope boundary

- This sub-project uses the **existing agent-wide `variableValues`** resolution (same as the workflow path today). **Per-tenant config is out of scope** — that's Sub-project 4. After this fix, agent MCP behaves exactly like workflow MCP: one config for all tenants.
- **tenantID contract:** the spike found `tenantId` is a validated `tenants.id` on `/execute` (incl. web widget + child agents) via `enforceTenantScope`, but optional/unvalidated on the `/simulate-agent` preview. tenantId is **not used** for MCP resolution in this sub-project (resolution is agent-wide), so no hardening is required here. The preview-path hardening is deferred to **Sub-project 4**, where per-tenant snapshot lookups key on `tenants.id`. (Noted so it isn't lost.)

## Error handling / edge cases

- Snapshot `mcpServers` absent/empty (older agents): behaves as today (`?? []`), no tools — unchanged.
- Existing version with incomplete snapshot (no `variableValues`): placeholders resolve empty; surfaced as a normal MCP connection failure, not a crash. Republish fixes it.
- Behavioral change: agents that already have MCP servers + selected MCP tools will now actually invoke them. This is the intended correction; call it out in the PR/release notes.
- MCP server disabled (`enabled:false`): existing filters apply unchanged.

## Testing

- **Unit:** `fetchAgentConfig` returns `mcpServers` from `graph_data`; the agent branch populates `fetched.graph.mcpServers`; `mcpServers=[]`/absent → no tools (no regression).
- **Integration:** a published agent with an MCP server + a selected `mcp` tool produces a callable tool through `buildRegistry` (assert provider registered + tool present); transport `{{placeholder}}` resolves from snapshot `variableValues`.
- **Migration:** `publish_agent_version_tx` now emits `libraryItemId`/`variableValues` in the `mcpServers` array; round-trip publish→fetch→resolve works.
- **Regression:** workflow app-type MCP path unchanged; built-in/calendar-OAuth/VFS agent tools unaffected.

## Out of scope

- Per-tenant MCP configuration, the matrix UI, default tenant, discovery status/gate (Sub-projects 1–4).
- Reviving `executeAgentPath.ts` (dead in-process path) — the fix follows the live edge-function path; removing the dead code is optional cleanup, not required.
- Agent VFS-tools wiring (edge `index.ts:368-372` bootstraps VFS only for `!isAgent`) — a separate latent gap, not in scope.
