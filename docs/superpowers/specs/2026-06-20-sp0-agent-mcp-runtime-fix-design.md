# Sub-project 0 — Agent runtime drops published data (MCP + skills)

**Date:** 2026-06-20
**Status:** Design (rev 2 — adds skills; dev-only, rollout-safety removed) — pending user review
**Parent:** `2026-06-20-tenant-scoped-mcp-OVERVIEW.md`
**Blocking for:** all per-tenant MCP work (Sub-projects 1–4)

## Problem

Agent-type apps (`appType==='agent'`) silently discard two kinds of published data at runtime: **MCP servers** and **skills**. A user can add MCP servers and skills to an agent, select MCP tools, and publish — the data is snapshotted into the version — but production `/execute` runs the agent with **zero** MCP tools and **zero** skills. Both work in the builder *preview* (`/simulate-agent`), which wires them from the live editor graph, masking the bug.

This is **dev-only** today — there are no live agents — so there is no rollout/blast-radius concern; we just fix it.

## Root cause (verified, spike + 3 SP0 reviews, 2026-06-20)

Both are the same bug class: `publish_*_tx` snapshots the data into `agent_versions.graph_data`, but the runtime reader never surfaces it.

**MCP:**
- `executeFetcher.ts:176` — `const graph = appType === 'agent' ? EMPTY_GRAPH : ensureGraphData(graphData)`. `EMPTY_GRAPH` has no `mcpServers`.
- `fetchAgentConfig` (`executeFetcher.ts:249-273`) reads `graph_data` but its `AgentGraphData` type omits `mcpServers`.
- Result: `executeCore.ts:104` → `mcpServers = fetched.graph.mcpServers ?? []` → `[]`; the edge `buildRegistry` (`toolBuilder.ts:445`, `payload.graph.mcpServers ?? []`) registers nothing.
- `routeAgentExecution`/`createAgentMcpSession` (`executeAgentPath.ts`) — the only code that reads agent `graph.mcpServers` — has **zero external callers** (dead code).

**Skills:**
- `fetchAgentConfig` returns only `{ systemPrompt, context, maxSteps }`; `AgentConfig` (`executeFetcher.ts:40-44`) and `AgentGraphData` have no `skills`.
- So `skills` never enters the edge payload (the edge function has **zero** `skills` references) and `AgentLoopConfig.skills` is `undefined`.
- The runtime skill mechanism is **already built and wired** in `packages/api`: `agentLoop.ts:199-201` adds the `get_skill_content` tool via `buildSkillTool(config.skills)`, and `agentLoopHelpers.ts:34` appends a "## Available Skills" prompt section via `buildSkillsPromptSuffix(config.skills)`. Both gate on `config.skills` being non-empty, so they no-op for agents today. `SkillDefinition = { name, description, content }` (`agentLoopTypes.ts:10`), exported from `@daviddh/llm-graph-runner`.

**Snapshots already carry the data:** `publish_agent_version_tx` stores `mcpServers` (without `libraryItemId`/`variableValues`) and `skills` (as `{ name, description, content, repoUrl, sortOrder }`).

## Fix

### A. MCP — surface snapshot `mcpServers` into the agent runtime graph
- Add `mcpServers?: McpServerConfig[]` to `AgentGraphData` and read it in the agent branch. Introduce a pure helper `buildAgentRuntimeGraph(graphData)` returning `EMPTY_GRAPH` extended with the validated `mcpServers`; use it in `fetchGraphAndKeys` (`executeFetcher.ts:176`) instead of bare `EMPTY_GRAPH`.
- `EMPTY_GRAPH` is `Object.freeze`d and lives in the new helper module (returned by shared reference, so freezing prevents downstream mutation of the shared constant).
- Nothing downstream changes (verified end-to-end): `resolveMcpTransportVariables`/`resolveOAuthForExecution` already key off `graph.mcpServers` (both early-return on `undefined`, both opt-in on `libraryItemId`); `buildCoreExecuteParams` puts the graph in the edge payload; the edge `buildRegistry` registers providers; `selected_tools` `mcp` refs make them callable. **No edge-function change for MCP.**

### B. MCP — widen `publish_agent_version_tx` snapshot
- New migration `CREATE OR REPLACE`s `publish_agent_version_tx`, adding `'libraryItemId', m.library_item_id` and `'variableValues', m.variable_values` to its `mcpServers` `jsonb_build_object` (parity with `publish_version_tx`), since the resolver needs `variableValues` to substitute `{{placeholder}}` and `libraryItemId` for library/OAuth MCPs. Add a cross-reference comment in both RPCs noting the `mcpServers` block is duplicated (SP4 will edit both again).

### C. Skills — populate `config.skills` (progressive disclosure, reuse existing mechanism)
Skills travel via `agentConfig`, not the graph, so the wiring differs from MCP:
1. **Backend:** add `skills: SkillDefinition[]` to `AgentConfig` (`executeFetcher.ts:40`) and `skills?: ...` to `AgentGraphData`; `fetchAgentConfig` reads `graph_data.skills` into `SkillDefinition[]` (extra snapshot fields `repoUrl`/`sortOrder` ignored). Add `skills?: SkillDefinition[]` to `ExecuteAgentParams` (`edgeFunctionClient.ts:34`). The existing spread `{ ...base, ...fetched.agentConfig }` (`executeCoreHelpers.ts:107`) then carries skills into the payload automatically.
2. **Edge:** add `skills?: SkillDefinition[]` to `ExecutePayload` (`toolBuilder.ts:61`, import `SkillDefinition` from `@daviddh/llm-graph-runner`) and pass `skills: payload.skills` into the `executeAgentLoop` config (`index.ts:189-198`). Then `agentLoop.ts:199-201` + `agentLoopHelpers.ts:34` fire automatically — the `get_skill_content` tool and the "## Available Skills" prompt suffix appear.
- The edge payload is sent as raw `JSON.stringify(params)` (`edgeFunctionClient.ts:224`) with **no Zod parse at the boundary**, so the new field passes through untouched.
- `publish_agent_version_tx` already snapshots skills fully — **no migration change for skills.**

### D. Delete dead code
Delete `executeAgentPath.ts` (`routeAgentExecution`/`createAgentMcpSession`, zero callers). It is the file that *looks* like it loads agent MCP but doesn't — leaving it is a confusion trap for SP4.

## Data flow after the fix

- **MCP:** `publish_agent_version_tx` (widened) → `graph_data.mcpServers` → `fetchGraphAndKeys`/`buildAgentRuntimeGraph` → `fetched.graph.mcpServers` → `resolveMcpTransportVariables` (substitutes agent-wide `variableValues`) + `resolveOAuthForExecution` → edge payload → `buildRegistry` → callable via `selected_tools` `mcp` refs.
- **Skills:** `publish_agent_version_tx` → `graph_data.skills` → `fetchAgentConfig` → `AgentConfig.skills` → spread into `ExecuteAgentParams` → `ExecutePayload.skills` → `executeAgentLoop` config → `buildSkillsPromptSuffix` (prompt menu of name+description) + `buildSkillTool` (`get_skill_content` for full content on demand).

## Scope boundary

- **Resolution stays agent-wide** (identical to the workflow path today). **Per-tenant config is OUT OF SCOPE** (SP4). After this fix, agent MCP behaves exactly like workflow MCP: one config for all tenants.
- **tenantID contract:** validated as `tenants.id` on `/execute` (incl. web widget + child agents) via `enforceTenantScope`; DB-sourced on messaging; optional/unvalidated on `/simulate-agent` preview. tenantID is **not used** for MCP/skills resolution here, so no hardening is needed in SP0; the preview-path hardening is deferred to SP4 (where per-tenant snapshot lookups key on `tenants.id`).
- **Provisional snapshot shape:** SP0 bakes agent-wide `variableValues` into the agent snapshot. SP4 will extend both publish RPCs again and switch runtime to per-tenant resolution; whether SP0's agent-wide values are carried forward is an SP4 cross-cutting decision (see OVERVIEW). Since this is dev-only, re-publishing under SP4 is a non-issue.

## Known divergences / assumptions (documented, not fixed here)

- **Preview ≠ prod resolution.** Preview takes config from the live editor graph and resolves variables web-side (`resolveVariablesServer.ts`); prod uses the published snapshot and resolves backend-side (`resolveMcpTransportVariables` with `getDecryptedEnvVariables(orgId)`). These are two of the three resolvers SP2 unifies — so "works in preview" can still diverge from prod until SP2. Called out so it doesn't mask a future bug.
- **No tenant isolation on secrets/OAuth.** Agent MCP resolution uses org-wide env vars (`getDecryptedEnvVariables(orgId)`) and org-scoped OAuth (`oauth_connections` keyed `(org_id, library_item_id)`). SP0 ships agent MCP with no per-tenant isolation on secrets/OAuth — acceptable only because every tenant in an org is trusted with org secrets; SP4 introduces per-tenant config.
- **SSRF surface.** Enabling agent MCP opens outbound http/sse calls on the agent path (same exposure workflows already have; no new guard). `stdio` transports cannot execute in production — `createTransport.ts:25` throws for stdio (caught gracefully as a failed provider). Dedicated SSRF hardening is SP3.

## Error handling / edge cases

- Snapshot `mcpServers`/`skills` absent or empty: behaves as today (no tools / no skill menu); no crash.
- Old snapshot lacking `variableValues`: `McpServerConfigSchema` still parses it (only `id`/`name`/`transport` required), so the server is kept; a `{{placeholder}}` in the transport resolves to the literal and the MCP server rejects auth → classified `auth_failed`, logged as a failed provider (graceful). Re-publishing under the widened RPC fixes it (normal dev flow).
- MCP compose/connection errors are caught per-provider (`registry.ts` try/catch → `failedProviders`); never crash the run.
- `get_skill_content` for an unknown name returns a "not found, available: …" string (existing behavior).

## Testing

- **Unit (backend):** `buildAgentRuntimeGraph` — null / no-mcpServers / valid / preserves `libraryItemId`+`variableValues` / drops invalid / returns frozen `EMPTY_GRAPH`. `fetchGraphAndKeys` — agent app-type surfaces `mcpServers`; **workflow app-type unchanged** (regression). `fetchAgentConfig` — returns `skills` from `graph_data.skills`; empty/absent → `[]`.
- **Unit (api):** an `AgentLoopConfig` with `skills` yields the `get_skill_content` tool and the "## Available Skills" prompt suffix (guards the actual payoff). A `RuntimeGraph` with `mcpServers` composes a callable MCP provider via `composeRegistry`/`buildRegistry` (existing `composeRegistry.test.ts` patterns).
- **Migration:** `publish_agent_version_tx` now emits `libraryItemId`/`variableValues` in `mcpServers`; only those two lines differ from the source definition.
- **Regression:** workflow MCP path unchanged; built-in/calendar-OAuth/VFS agent tools unaffected.

## Out of scope

- Per-tenant MCP configuration, matrix UI, default tenant, discovery status/gate (SP1–SP4).
- Agent VFS-tools wiring (edge `index.ts:368-372` bootstraps VFS only for `!isAgent`) — a separate latent gap; flagged, not fixed here.
- SSRF hardening (SP3); shared-resolver unification (SP2); preview/prod parity (closed by SP2).
