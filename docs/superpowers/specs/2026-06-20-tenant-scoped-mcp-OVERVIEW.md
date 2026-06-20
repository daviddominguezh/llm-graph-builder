# Tenant-scoped MCP configuration — Decomposition Overview

**Date:** 2026-06-20
**Status:** Decomposition agreed; sub-project specs to follow

After two adversarial review rounds (six staff-level reviews total), the single all-in-one design (`2026-06-20-tenant-scoped-mcp-config-design.md`, kept for reference) was found to (a) rest on a missing foundation — the `agent` app-type runtime does not load MCP servers today — and (b) entangle ~5 separable concerns. Per the brainstorming decomposition path, the work is split into ordered sub-projects, each getting its own spec → plan → build cycle.

## Confirmed foundation gap (spike 2026-06-20)

For `appType==='agent'`: `executeFetcher.ts:176` returns `EMPTY_GRAPH`; `executeCore.ts:104` resolves `mcpServers = fetched.graph.mcpServers ?? []` → `[]`; the MCP-aware agent path (`routeAgentExecution`/`createAgentMcpSession`, `executeAgentPath.ts`) has **zero callers** (dead code). `fetchAgentConfig` (`executeFetcher.ts:249-273`) reads `graph_data` but its `AgentGraphData` type doesn't declare `mcpServers`, so they're dropped. `publish_agent_version_tx` **does** snapshot `mcpServers` into `agent_versions.graph_data` — persisted at rest, never read at runtime. MCP is the **only** tool category structurally omitted for agents (built-in tools, calendar-OAuth, VFS reach them via `selected_tools`).

**Why it can look like it works:** the builder **preview** path (`/simulate-agent`) wires MCP from the live editor graph, so previews invoke MCP tools while production `/execute` silently does not.

## Sub-projects (dependency order)

### 0. FOUNDATION FIX — agent MCP runtime (bug)  ⟵ blocking
Spike complete (confirmed real bug). Scope of the fix:
- **Surface snapshot MCP servers into the agent runtime graph:** add `mcpServers` to `AgentGraphData` (`executeFetcher.ts:234`) and `fetchAgentConfig`; populate `fetched.graph.mcpServers` in the `appType==='agent'` branch (`executeFetcher.ts:176` / `fetchAllCoreData`) so the existing transforms (`resolveMcpTransportVariables`, `resolveOAuthForExecution`) and the edge `buildRegistry` (already reads `payload.graph.mcpServers`) pick them up. **No edge-function change needed.**
- **Widen `publish_agent_version_tx` mcpServers fields** to match `publish_version_tx` (add `libraryItemId`, `variableValues`) — the transforms need them.
- **Verify `selected_tools` carries `mcp` refs** (`{providerType:'mcp', providerId: server.id, toolName}`); MCP providers only yield callable tools when referenced. If the agent editor doesn't write these, that's a second sub-gap to fix here.
- **tenantID contract:** safe (`tenants.id`) on `/execute` (incl. web widget, child agents) via `enforceTenantScope`; DB-sourced on messaging; **optional/unvalidated on `/simulate-agent` preview** — harden that one path (require/validate `tenantId` or scope it). `graph_context_presets.tenant_id` default `''` is preset data, not an execution join key.
- Ships independently as a bug fix; prerequisite for all per-tenant work.

### 1. Default-tenant subsystem
- `is_default` column + partial unique index; **atomic** org-creation hook (transaction/RPC, not a fragile multi-await) in the backend; backfill creating an org-named default tenant for every org (respecting global-unique slug `^[a-z0-9]{1,40}$` + reserved denylist, and `UNIQUE(org_id,name)`); identity-lock + delete-guard enforced in **backend route handlers** (`POST /orgs`, `PATCH/DELETE /tenants`) not just web; avatar mirroring (decide: copy bytes into `tenant-avatars` vs cross-bucket URL reference); `is_default` propagation through type/guard/query/UI layers; tenant-list per-row special-casing.
- Self-contained; unblocks "default tenant always exists."

### 2. Shared resolver + variable extraction refactor
- One module in `@daviddh/graph-types`: canonical `{{NAME}}` regex, `extractTemplateVariables`, `resolveTransport`. Replace the three duplicated resolvers (web `resolveVariablesServer.ts`, backend `executeHelpers.ts`, backend `mcpToolService.ts`). Pure refactor, no behavior change (the two regexes are already behaviorally identical for ASCII names).

### 3. SSRF hardening + discovery-error redaction
- Egress allowlist/denylist (block loopback, link-local 169.254/16, RFC-1918, non-http(s)) + outbound timeout at the discovery proxy; closed-set error categories (DNS/timeout/TLS/auth-4xx/5xx/blocked) with static copy, never interpolating upstream text. Orthogonal security fix, shippable standalone.

### 4. Per-tenant MCP config (the feature) — split further:
- **4a. Data + RLS + matrix CRUD:** two tables (config + discovery cache) with composite FK to `graph_mcp_servers(agent_id,server_id)` ON DELETE CASCADE, optimistic locking, indexes, CHECK, `updated_at` trigger; concrete RLS (1-arg `is_org_member` + tenant∈org clause); the Edit-button matrix modal (Scrollable wrapper; default tenant first; env_ref-default cells with secret warning; capability remap incl. **org-level OAuth rendered once, not per row**).
- **4b. Discovery + status + publish gate:** tenant-aware discovery (web route gains `tenantId`; backend `/mcp/discover` stays stateless); on-demand+cached with `values_hash`; **publish path force-recomputes/verifies** (closes the stale-`ok` TOCTOU); aggregate 3-state status (server→(server,tenant)); rewire `hasMcpErrors`/`getRegistry` to the default tenant + aggregate; **a separate invalidation** for `org_env_variables` value changes (hash can't catch them); Redis cache key gains a tenant dimension.
- **4c. Snapshot + restore + runtime resolution:** extend **both** publish RPCs (incl. `publish_agent_version_tx`, which embeds no var data today); extend `RuntimeGraphSchema`/`McpServerConfigSchema` + the assembler so the per-tenant blob survives `safeParse`; fix `restore_version_tx` ordering + legacy-snapshot data-loss; runtime resolves per-tenant values from the snapshot keyed by validated `tenants.id`.

## Cross-cutting decisions to make BEFORE 4a
- **Export/import:** per-tenant config is not in the export schema; round-trips lose it. Decide: freeze export at agent-wide template (no values) vs extend schema + import remap.
- **OAuth per tenant:** `oauth_connections` is org-scoped `(org_id, library_item_id)`. Confirm OAuth status is rendered once at server level and excluded from per-tenant aggregation.
- **Existing agents:** D8 default-tenant + D9 all-tenants-ok would block every pre-existing agent until configured. Decide migration/runbook (and whether to copy existing agent-wide values forward).

## Reference
- Full (superseded) design: `2026-06-20-tenant-scoped-mcp-config-design.md`
- Original decisions D1–D9 carry forward into Sub-project 4 unless revised.
