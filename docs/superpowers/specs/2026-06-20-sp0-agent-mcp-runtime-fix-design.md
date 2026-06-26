# Sub-project 0 — Agent runtime drops published data (MCP + skills)

**Date:** 2026-06-20
**Status:** Design (rev 3 — adds child-agent skills, review fixes; dev-only) — pending user review
**Parent:** `2026-06-20-tenant-scoped-mcp-OVERVIEW.md`
**Blocking for:** all per-tenant MCP work (Sub-projects 1–4)

> All runtime files referenced live in **`packages/backend/src/routes/execute/`** unless noted (the agent loop + skill tool live in `packages/api` = `@daviddh/llm-graph-runner`; the edge function in `supabase/functions/execute-agent`).

## Problem

Agent-type apps (`appType==='agent'`) silently discard two kinds of published data at runtime: **MCP servers** and **skills**. A user can add MCP servers + skills to an agent, select MCP tools, and publish — the data is snapshotted into the version — but production `/execute` runs the agent with **zero** MCP tools and **zero** skills. Both work in the builder *preview* (`/simulate-agent`), masking the bug. The skills drop also affects **agents invoked as sub-agents** (`invoke_agent`).

This is **dev-only** today (no live agents), so there is no rollout/blast-radius concern; we just fix it.

## Root cause (verified — spike + 6 SP0 reviews, 2026-06-20)

Same bug class: `publish_*_tx` snapshots the data into `agent_versions.graph_data`, but the runtime reader never surfaces it.

**MCP:** `executeFetcher.ts:176` uses `EMPTY_GRAPH` (no `mcpServers`) for agents; `fetchAgentConfig`'s `AgentGraphData` omits `mcpServers`; so `executeCore.ts:104` → `mcpServers ?? []` → `[]`, and the edge `buildRegistry` (`toolBuilder.ts:445`) registers nothing. `routeAgentExecution`/`createAgentMcpSession` (`executeAgentPath.ts`) — the only code reading agent `graph.mcpServers` — has **zero callers** (dead).

**Skills (top-level):** `fetchAgentConfig` (`executeFetcher.ts:249-273`) returns only `{ systemPrompt, context, maxSteps }`; `AgentConfig`/`AgentGraphData` omit `skills`; the edge function has zero `skills` references; so `AgentLoopConfig.skills` is `undefined`. The runtime mechanism is **already built and wired** in `packages/api`: `agentLoop.ts:198-201` adds `get_skill_content` via `buildSkillTool`, and `agentLoopHelpers.ts:33-34` appends a "## Available Skills" prompt section via `buildSkillsPromptSuffix` — both **gated on `config.skills` being non-empty** (so 0 skills already produces no tool and no prompt section). `SkillDefinition = { name, description, content }` (`agentLoopTypes.ts:10`), exported from `@daviddh/llm-graph-runner`.

**Skills (child / `invoke_agent`):** child dispatch builds the child's config via `resolveChildConfig`→`buildConfigFromGraphData` (`simulateChildResolver.ts`, reads the *child's* published `graph_data`) into a `ResolvedChildConfig`, which is converted to an `OverrideAgentConfig` (`executeCoreInlineDispatch.ts:37,16,173`) and passed down. `resolveAgentConfig` (`executeCoreHelpers.ts:38-43`) takes the **override branch** and never calls `fetchAgentConfig`. None of `ResolvedChildConfig`, `OverrideAgentConfig`, or the override branch carry `skills`, so a published agent invoked as a sub-agent runs skill-less. (Child MCP survives because the child re-fetches its own graph via `fetchGraphAndKeys`→`buildAgentRuntimeGraph`; skills ride `agentConfig`, so they need explicit threading.)

**Snapshots already carry the data:** `publish_agent_version_tx` stores `mcpServers` (without `libraryItemId`/`variableValues`) and `skills` (as `{ name, description, content, repoUrl, sortOrder }`).

## Requirement: skills are per-agent identity

Each agent keeps its **own** skills regardless of role. If agent A (skills X) invokes agent B (skills Y), then while B runs it can use **Y only** — not X, not none. Being invoked as a child must not lose or inherit/replace skills. Therefore child skills are sourced from the **child's own** published snapshot, never from the parent.

## Fix

### A. MCP — surface snapshot `mcpServers` into the agent runtime graph
- Add `mcpServers?: McpServerConfig[]` to `AgentGraphData`; introduce a pure helper `buildAgentRuntimeGraph(graphData)` returning a frozen `EMPTY_GRAPH` extended with schema-validated `mcpServers`; use it in `fetchGraphAndKeys` (`executeFetcher.ts:176`).
- `EMPTY_GRAPH` is `Object.freeze`d (returned by shared reference; freezing prevents downstream mutation).
- Verified end-to-end: `resolveMcpTransportVariables`/`resolveOAuthForExecution` key off `graph.mcpServers` (early-return on undefined, opt-in on `libraryItemId`); `buildCoreExecuteParams` puts the graph in the payload; the edge `buildRegistry` registers providers. **No edge change for MCP.** Child agents inherit this automatically via their own graph re-fetch.

### B. MCP — widen `publish_agent_version_tx`
- New migration `CREATE OR REPLACE`s the RPC, adding `'libraryItemId', m.library_item_id` and `'variableValues', m.variable_values` to its `mcpServers` `jsonb_build_object` (parity with `publish_version_tx`). Add a cross-reference comment in both RPCs noting the block is duplicated (SP4 edits both).

### C. Skills — populate `config.skills` for every agent (top-level AND child), progressive disclosure
Reuse the existing `buildSkillTool`/`buildSkillsPromptSuffix` mechanism (no new tool). Skills travel via `agentConfig`, so:

**C1. Top-level path:**
- Add `skills: SkillDefinition[]` to `AgentConfig` (`executeFetcher.ts:40`) and `skills?` to `AgentGraphData`; `fetchAgentConfig` reads `graph_data.skills`, **schema-validated** (small `z.object`, drop invalid rows — symmetry with MCP's `safeParse`, null-safe).
- Add `skills?: SkillDefinition[]` to `ExecuteAgentParams` (`edgeFunctionClient.ts:34`). The existing spread `{ ...base, ...fetched.agentConfig }` (`executeCoreHelpers.ts:107`) carries it into the payload.

**C2. Override / compile fix:**
- Add `skills?: SkillDefinition[]` to `OverrideAgentConfig` (`executeOverrideTypes.ts`).
- `resolveAgentConfig` override branch returns `{ systemPrompt, context, maxSteps, skills: overrideAgentConfig.skills ?? [] }` (required: `AgentConfig.skills` is now non-optional, so this branch must set it — also the compile fix).

**C3. Child path (per-agent identity):**
- Add `skills: SkillDefinition[]` to `ResolvedChildConfig` and `skills?` to `PublishedAgentGraphData` (`simulateChildResolver.ts`).
- `buildConfigFromGraphData` and `resolveInvokeWorkflow` read `gd.skills` (validated); `resolveCreateAgent` sets `skills: []` (dynamic agents have no published skills).
- `childConfigToRecord` (`executeCoreInlineDispatch.ts:37`) includes `skills`; `extractChildConfig` (`:16`) maps it into `OverrideAgentConfig.skills`. The child then runs with its own snapshot's skills via the C2 passthrough.

**C4. Edge:**
- Add `skills?: SkillDefinition[]` to `ExecutePayload` (`toolBuilder.ts:61`) and pass `skills: payload.skills` into the `executeAgentLoop` config (`index.ts:189-198`, the agent branch). The wired `buildSkillTool`/`buildSkillsPromptSuffix` then fire.
- Payload is raw `JSON.stringify(params)` (`edgeFunctionClient.ts:224`) with **no Zod parse at the boundary** — the field passes through.
- **Empty skills produce no prompt pollution:** `buildSystemMessage` already guards `if (config.skills !== undefined && config.skills.length > 0)` before appending the suffix, and `mergeSkillTools` gates the tool the same way. An agent with 0 skills gets no "## Available Skills" header and no `get_skill_content` tool. Our readers return `[]` (not a placeholder), so the guard holds.
- `publish_agent_version_tx` already snapshots skills fully — **no migration change for skills.**

### D. Delete dead code
Delete `executeAgentPath.ts` (zero callers) — the file that *looks* like it loads agent MCP but doesn't; a confusion trap for SP4.

## Data flow after the fix

- **MCP:** `publish_agent_version_tx` (widened) → `graph_data.mcpServers` → `buildAgentRuntimeGraph` → `fetched.graph.mcpServers` → resolve → edge payload → `buildRegistry` → callable via `selected_tools` `mcp` refs. Children: same, via their own graph re-fetch.
- **Skills (top-level):** `graph_data.skills` → `fetchAgentConfig` → `AgentConfig.skills` → spread → `ExecuteAgentParams.skills` → `ExecutePayload.skills` → `executeAgentLoop` config → tool + prompt menu.
- **Skills (child):** child's `graph_data.skills` → `buildConfigFromGraphData` → `ResolvedChildConfig.skills` → `childConfigToRecord`/`extractChildConfig` → `OverrideAgentConfig.skills` → `resolveAgentConfig` passthrough → `AgentConfig.skills` → … → loop. Sourced from the child's own snapshot.

## Scope boundary

- **Resolution stays agent-wide** (per-tenant is SP4). No `/simulate-agent` or tenant changes.
- **tenantID contract** (validated `tenants.id` on `/execute`; unvalidated on preview) is not used for MCP/skills resolution here; hardening deferred to SP4.
- **Provisional snapshot shape:** SP0 bakes agent-wide `variableValues` into the snapshot; SP4 switches to per-tenant and may carry these forward (an SP4 decision). Dev-only, so re-publishing later is a non-issue.

## Known divergences / assumptions (documented, not fixed here)

- **`fewShotExamples`** is consumed by the loop (`agentLoopHelpers.ts:53`) but has **no producer** today — no column, no editor UI, no snapshot field (verified: zero `fewShot`/`few_shot` references in web/backend/migrations). It is a latent same-class drop that only activates when a producer is added. Excluded deliberately — not arbitrary.
- **`model`** is request-level: the runtime always uses `resolveModel()` (`executeCoreSetup.ts:21-25`, `input.model ?? default`); `AgentConfig.model` is not an `/execute` input and is never snapshot-sourced. Not a drop — by design. (`childTimeout`/`maxNestingDepth` are simulation-only — N/A.)
- **MCP servers without selected tools = zero tools, by design.** The MCP tab (servers) and tools tab (`selected_tools`) are independent. An agent with MCP servers but no `mcp` entries in `selected_tools` registers providers but yields **zero callable tools** (`buildAgentToolsAtStart` no-ops on unreferenced providers). This is expected UX and is indistinguishable from "the fix didn't work" — verification must select an MCP tool.
- **Maintainability — graph vs agentConfig split is forced.** MCP rides the runtime graph because the whole downstream pipeline keys off `graph.mcpServers`; skills ride `agentConfig` because `RuntimeGraphSchema` has no `skills` field and the loop reads `config.skills`. Not unifiable without rewriting the resolver chain. SP4 will edit `buildAgentRuntimeGraph` again — acceptable.
- **Preview ≠ prod resolution** (config source + resolver differ; SP2 unifies). "Works in preview" can still diverge from prod until SP2. Child-agent skills are unwired in *preview* too (`simulationOrchestratorHelpers.ts:132` hardcodes `skills: undefined` for children), so preview cannot validate the child path — only prod tests can.
- **No tenant isolation on secrets/OAuth.** Agent MCP uses org-wide env vars + org-scoped OAuth; acceptable only because every tenant in an org is trusted with org secrets until SP4.
- **SSRF surface** (http/sse) opens on the agent path — same exposure workflows already have; `stdio` can't run in prod (`createTransport.ts:25` throws, caught gracefully). Hardening is SP3.

## Error handling / edge cases

- Snapshot `mcpServers`/`skills` absent or empty: no tools / no skill menu / no header; no crash.
- Old snapshot lacking `variableValues`: `McpServerConfigSchema` still parses (only `id`/`name`/`transport` required); a `{{placeholder}}` resolves to the literal → MCP server rejects auth → classified `auth_failed`, logged as a failed provider (graceful). Re-publishing under the widened RPC fixes it.
- MCP compose/connection errors caught per-provider; never crash the run.
- `get_skill_content` for an unknown name returns a "not found, available: …" string (existing).

## Testing

- **Unit (backend):** `buildAgentRuntimeGraph` — null / no-mcpServers / valid / preserves `libraryItemId`+`variableValues` / drops invalid / frozen `EMPTY_GRAPH` / `RuntimeGraphSchema.safeParse(EMPTY_GRAPH).success`. `fetchGraphAndKeys` — agent surfaces `mcpServers`; **workflow unchanged** (regression). `fetchAgentConfig` — returns validated `skills`; absent → `[]`. `resolveAgentConfig` override branch returns `skills` from the override (default `[]`). Child: `buildConfigFromGraphData` returns the child's `skills`; `extractChildConfig` preserves `skills`.
- **Unit (api) — required payoff (not deferred):** an `AgentLoopConfig` with one skill → resulting `tools` contains `get_skill_content` AND the system message contains "## Available Skills"; with **zero** skills → neither the tool nor the header appears. `buildAgentToolsAtStart` with an `mcp` `selected_tools` ref → tool present; `[]` → none.
- **Migration:** `publish_agent_version_tx` emits `libraryItemId`/`variableValues`; only those lines differ from source.
- **Regression:** workflow MCP path unchanged; built-in/calendar-OAuth/VFS agent tools unaffected.

## Out of scope

- Per-tenant MCP config, matrix UI, default tenant, discovery status/gate (SP1–SP4).
- `fewShotExamples`/`model` (excluded above with rationale).
- Agent VFS-tools wiring (edge `index.ts:368-372` bootstraps VFS only for `!isAgent`) — separate latent gap; flagged, not fixed.
- SSRF hardening (SP3); shared-resolver unification + preview/prod parity (SP2).
