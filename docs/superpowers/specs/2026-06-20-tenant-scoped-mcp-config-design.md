# Tenant-scoped MCP configuration — Design (v2)

**Date:** 2026-06-20
**Status:** Revised after adversarial review (4 staff-level reviews) — pending user re-review

## Problem

MCP servers are configured **agent-wide**: the *set* of MCPs an agent has is correctly fixed per agent, but every tenant using the agent shares one MCP configuration. That is wrong — the same MCP often needs different per-tenant values: different env-variable values, different configured values, even different URLs when the URL embeds a tenant-specific value. This applies equally to library and custom MCPs.

We need each **(agent, tenant)** pair to carry its own configuration for the **same** set of MCPs. The accordion expansion in the tools-panel "MCP servers" tab is replaced by an **Edit** button (`variant="link"`) that opens a **matrix** modal: one row per tenant, one column per configurable value (mirroring the channels matrix in spirit).

An MCP server is **"ok"** only when *every* tenant has its values fully configured **and** "discover tools" resolves successfully for that tenant's resolved config. **Publishing an agent requires every server to be "ok" for every tenant.**

## Decisions (incl. review resolutions)

| # | Decision | Choice |
|---|---|---|
| D1 | Matrix columns | **Auto-detected** `{{NAME}}` placeholders scanned from the transport (url, header values, env values, command, args). Same mechanism for library & custom MCPs. |
| D2 | Discovery timing | **On-demand + cached.** Live discovery fires only on modal open, per-row "Test", or "Verify all". Results persist per `(server, tenant)`. List/status views use cached results. |
| D3 | Defaults / inheritance of values | **None.** Every tenant configures every value independently. |
| D4 | Toolset across tenants | **Identical.** Per-tenant discovery is a connectivity/auth check. Builder shows one canonical tool list resolved against the **default tenant**. |
| D5 | Cell value type | Reuses `VariableValueSchema` (`direct` \| `env_ref`). `env_ref` → org-scoped, **encrypted** `org_env_variables`. `direct` → **plaintext**; UI warns that secrets should use an env var. The user can always choose `env_ref`, so safety is the user's choice. |
| D6 | Config vs versioning | **Pure snapshot at publish.** Runtime executes the immutable published snapshot (template **and** per-tenant values frozen into the version). The live per-tenant config table is the builder's working copy only. A tenant added after publish **requires a republish** to run that agent. |
| D7 | Default tenant | Every org has exactly one **default tenant** (auto-created), used as the discovery/reference tenant for the builder's canonical tool list. Identity (name/slug/avatar) is locked and mirrors the org; it cannot be deleted; its operational config (channels, MCP values) is editable. |
| D8 | Backfill of default tenant | The migration **creates a new org-named default tenant for every org** (existing and future). |
| D9 | Publish gate | **All tenants must be configured + discover OK** (= aggregate server status all-ok across all servers). |

## Current state (verified)

- **Definition/storage:** `graph_mcp_servers`, unique `(agent_id, server_id)`; `server_id` is a **client-generated `nanoid`** (`useMcpServers.ts:37,108`). Columns include `transport_config jsonb`, `enabled`, `library_item_id`, `variable_values jsonb` (**nullable, usually NULL for custom MCPs** — `20260314000000_mcp_server_library.sql:36`).
- **Types:** `packages/graph-types/src/schemas/mcp.schema.ts` — `McpServerConfig`, `McpTransport` (http|sse|stdio), `VariableValue = {type:'direct',value} | {type:'env_ref',envVariableId}`.
- **Placeholder regex differs by site:** web `/\{\{(\w+)\}\}/g` (`resolveVariables.ts:13`); backend `/\{\{(?<name>\w+)\}\}/gv` (`executeHelpers.ts:68`).
- **Three resolution sites:** web discovery proxy (`resolveVariablesServer.ts`), backend **execute** (`executeHelpers.ts` `resolveServerTransport`), backend **discovery** (`mcp-server/services/mcpToolService.ts:40` `resolveServerVars`). All read **agent-wide** `variableValues`.
- **Runtime executes a published snapshot, not live tables:** `executeCoreHelpers.ts:59` resolves over `graphAndKeys.graph`, which comes from `getPublishedGraphData` → `agent_versions.graph_data` (`executeFetcher.ts:170`), pinned by a request `version` (`executeAuth.ts:49-51`). The publish RPC embeds `variableValues` inline (`20260618000000_publish_snapshot_with_locks.sql:126-136`). **For `appType==='agent'`, `fetchGraphAndKeys` returns `EMPTY_GRAPH`** (`executeFetcher.ts:108-114`), so the agent-path loads MCP servers elsewhere — see §7.
- **`restore_version_tx` does NOT restore `variable_values`/`library_item_id`** (`20260310000000_add_restore_version_tx.sql:118-127`).
- **Builder canonical tool list:** `GET /agents/{id}/registry` → `getRegistry.ts:81-88`, resolves **agent-wide** values with `tenantId:''` then `describeAll`.
- **Publish/save gate:** `GraphBuilder.tsx:330-331` → `hasMcpErrors` (`StatusButton.tsx:143-149`) → errors when `discoveredTools[server.id]` empty; `discoveredTools` populated by load-time `useMcpDiscovery.ts:51,68-99` using agent-wide values.
- **Env vars:** `org_env_variables`, unique `(org_id,name)`, **encrypted** (`encrypted_value bytea`, plaintext column dropped; reads via `SECURITY DEFINER get_env_variable_value` decrypt RPC — `20260321000000_security_and_execution_tables.sql:136-198`).
- **Tenants:** `tenants` (`TenantRow {id,org_id,slug,name,avatar_url,...}`), fetched via `getTenantsByOrgAction(orgId)`. RLS uses 2-arg `is_org_member` (`20260326200000_tenants_table.sql:19`).
- **Runtime `tenantID` is a free-form `string`** (`edgeFunctionClient.ts:47`), NOT validated as a `tenants.id` UUID; `graph_context_presets.tenant_id` is `text default ''`.
- **RLS recursion-safe helper:** 1-arg `is_org_member(check_org_id uuid)` is `SECURITY DEFINER` and calls `auth.uid()` internally (`20260309300000_fix_rls_self_reference.sql:9-19`); `graph_mcp_servers` policies use it via inline subquery (`20260309500000_normalized_graph_storage.sql:304-334`).
- **Optimistic-lock precedent exists:** `selectedToolsOperations.ts:18-35` uses an `expected_updated_at` precondition; `mcpServerOperations.ts:48-60` and the channels matrix do **not**.
- **Reference matrix:** `components/agents/channels/*` — columns are a compile-time constant; channel cells are throwaway `useState` stubs with no persistence. **Not directly reusable.**
- **Scroll tripwire:** `GlobalScrollbarOverlay` hijacks `overflow-*auto` hosts; dynamic direct children crash React (`removeChild`). Use the `Scrollable` wrapper (CLAUDE.md).

---

## Architecture

### 1. Default-tenant subsystem (D7, D8)

- **Schema:** add `is_default boolean not null default false` to `tenants`; partial unique index `create unique index on tenants (org_id) where is_default` (one default per org).
- **Creation on org creation:** in the org-creation flow (located during planning), create the default tenant with `name = org.name`, slug derived from the org slug; on slug collision append a numeric suffix until unique (never fail). Set `is_default = true`. Avatar mirrors the org (below).
- **Avatar mirroring:** a DB trigger on `organizations` avatar updates syncs `tenants.avatar_url` for the org's default tenant (and the creation path copies the current org avatar). The tenant UI hides the avatar control for the default tenant.
- **Identity lock:** name/slug/avatar are immutable for the default tenant (enforced in the tenant update path + a DB guard); delete is disabled (DB guard rejecting delete of `is_default` rows). Operational config (channels, MCP values) remains editable.
- **Backfill migration:** for every existing org, insert one org-named default tenant (`is_default=true`), slug-collision-safe; idempotent (`on conflict do nothing` against the partial unique index / a guard so re-runs are safe).
- **Reference tenant resolution:** "the default tenant" = the org's `is_default` tenant. Used by the builder canonical tool list (§6) and as the always-present minimum tenant.

### 2. Per-tenant config + discovery cache (two tables)

Config (durable, user-authored) and discovery cache (derived, volatile) are **separate tables** to avoid write-write races and `updated_at` churn (review data-H3).

```sql
-- working-copy config (builder edits this; snapshotted at publish)
create table public.graph_mcp_server_tenant_config (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  server_id       text not null,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  variable_values jsonb not null default '{}',          -- Record<varName, VariableValue>
  updated_at      timestamptz not null default now(),
  unique (agent_id, server_id, tenant_id),
  -- real referential integrity to the server row (fixes orphan/nanoid problem):
  foreign key (agent_id, server_id)
    references public.graph_mcp_servers (agent_id, server_id) on delete cascade
);
create index on public.graph_mcp_server_tenant_config (tenant_id); -- cascade perf

-- discovery verification cache
create table public.graph_mcp_server_tenant_discovery (
  agent_id        uuid not null,
  server_id       text not null,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending','ok','error')),
  error           text,                                  -- REDACTED (see §5)
  values_hash     text,                                  -- hash of values verified
  discovered_at   timestamptz,
  primary key (agent_id, server_id, tenant_id),
  foreign key (agent_id, server_id)
    references public.graph_mcp_servers (agent_id, server_id) on delete cascade
);
```

- The composite FK requires `graph_mcp_servers` to have a unique `(agent_id, server_id)` — it does. This makes delete+re-add of a server **cascade-clean** instead of orphaning rows.
- `update_updated_at` trigger on the config table; cell saves use the **`expected_updated_at` optimistic-lock** pattern from `selectedToolsOperations.ts` (review data-H4).
- A discovery row is only authoritative when `values_hash` matches the current config's hash — a stale `ok` after an edit is treated as `pending` (closes the env-value-changed and edit-vs-verify races, review UI-H5/data-H3).
- `graph_mcp_servers.variable_values` is **removed from the resolution path**; retained only until the snapshot/registry paths are migrated, then dropped in a follow-up (tracked, not permanent — review security-M4). Backfill copies it where present but it is usually NULL, so backfill is effectively an initialization, not a value-preserving migration (review data-H1); the migration coalesces NULL→`'{}'`.

### 3. Variable extraction + single shared resolver (review C4/M2)

Consolidate the three resolvers and two regexes into one shared module (in `packages/graph-types` or a shared util both web & backend import):

```ts
const PLACEHOLDER = /\{\{(\w+)\}\}/g;                // single canonical regex
extractTemplateVariables(transport): string[]        // unique, ordered columns
resolveTransport(transport, values, env): McpTransport // single substitution impl
```

`mcpToolService.ts`, `executeHelpers.ts`, and the web discovery proxy all call the shared `resolveTransport`. Library MCPs supply `description` tooltips from `mcp_library.variables` when a detected name matches.

### 4. Publish snapshot + restore (D6)

- **Publish RPC** (`20260618...`) is extended to snapshot the per-tenant config for **all** tenants into the version (alongside the existing template/`variableValues` embedding), so a published version is fully self-contained and reproducible.
- **`restore_version_tx`** is extended to restore per-tenant config (and the previously-missing `variable_values`/`library_item_id`) from the snapshot.
- Publish is **gated** on every server being "ok" for every tenant (D9) — the publish path verifies/uses the cached aggregate status and refuses otherwise.

### 5. Discovery (tenant-aware) + egress safety (review security-H1)

- `verifyMcpTenantConfig(agentId, serverId, tenantId)` resolves that tenant's values via the shared resolver and runs discovery through the tenant-aware path (incl. `mcpToolService.ts`), writing `status`/`error`/`values_hash`/`discovered_at`.
- **SSRF guard + outbound timeout** added at the discovery proxy: block `localhost`/loopback, link-local `169.254.0.0/16`, RFC-1918, and non-http(s) schemes; enforce a per-call timeout.
- **`error` is redacted before persistence** (never store resolved URLs/headers or secret-bearing upstream bodies); the stored string is a sanitized category + short message.
- **"Verify all"** runs with a bounded concurrency cap and per-call timeout; partial failures are written per-row transactionally; the UI tolerates partial results. OAuth library servers (no `{{placeholders}}`) verify via the OAuth-aware discover path (`handleOAuthDiscover`), not value substitution.

### 6. Builder canonical tool list + publish gate rewire (review UI-C1/security-C4)

- `getRegistry.ts` resolves against the **default tenant's** live config (not agent-wide values, not `tenantId:''`).
- `useMcpDiscovery` no longer discovers from agent-wide values; the builder's per-server tool list comes from the default-tenant discovery.
- `hasMcpErrors` / the publish-save gate (`GraphBuilder.tsx`) are rewired to the **aggregate per-tenant status** (D9): a server is publishable only when every tenant's discovery `status==='ok'` and config is complete.

### 7. Runtime resolution (D6)

- Runtime reads per-tenant values **from the version snapshot** keyed by `(server_id, params.tenantID)` — not the live table — via the shared resolver. The live table is never consulted at runtime.
- **Validate the join key:** confirm `ExecuteAgentParams.tenantID` is always a `tenants.id` UUID; if any path passes a slug/empty string, normalize to the tenant id (or fail-fast with a clear error) — otherwise the lookup silently misses (review data-M3).
- **Agent app-type:** identify where the agent path loads MCP servers (it is *not* `executeCoreHelpers.ts:59`, which is a no-op for `appType==='agent'` — review security-C1) and apply the same snapshot-keyed, tenant-aware resolution there.
- **Fail fast** with a descriptive error (naming tenant + missing variables) if the snapshot lacks config for the run's tenant — which, under D6, means the tenant was added after publish and the agent needs republishing.

### 8. RLS (review security-C3/data-H2)

Mirror the proven `graph_mcp_servers` policy verbatim — **no new helper**:

```sql
-- both new tables, all of select/insert/update/delete:
using ( public.is_org_member((select org_id from public.agents where id = agent_id))
        and (select org_id from public.tenants where id = tenant_id)
            = (select org_id from public.agents where id = agent_id) )
```

Uses the recursion-safe **1-arg** `is_org_member`; the second clause enforces tenant∈agent's org. `direct` values are plaintext and readable by org members (D5); the matrix list endpoint returns config values for editing (acceptable per D5's user-choice model), while `env_ref` values stay behind the existing decrypt RPC and are never returned as plaintext.

### 9. UI — Edit button + matrix modal (review UI-C2/H3/H4/M6/M7/L9/L10)

- `McpServersSection.tsx`: remove the accordion; each row shows the aggregate **status icon** + an **`Edit` (`variant="link"`)** button. **Capability remap** — name edit, transport-type switch, stdio command/args, add/remove/**delete**, and **Publish** stay on the list row / a "Server definition" section; only value-filling moves into the matrix.
- **Matrix modal** (new components; *not* a reuse of `ChannelsTable` — be honest about the fork, or extract a shared `<Matrix>` primitive and migrate channels onto it):
  - **Body uses the `Scrollable` wrapper** (or keeps all conditional branches — loading, empty, "Server definition", async rows — *outside* the scroll host) to avoid the `removeChild` crash.
  - **Rows = tenants** (default tenant first, visibly marked); **columns = `extractTemplateVariables(transport)`**; trailing column = per-row **status + "Test"**; header action = **"Verify all"**.
  - **Cell**: text input with a toggle to "use env variable" (org-scoped picker). A small badge indicates `env_ref` is **org-scoped/shared**; a **warning** notes that secrets/API keys should use an env var (encrypted) rather than `direct` (plaintext) (D5).
  - **Custom MCPs**: collapsible **"Server definition"** section edits the transport template (`{{placeholders}}`); editing it **re-derives columns and resets ALL tenant rows' discovery to `pending`**. Placeholder syntax typed by the user is **validated/echoed** so typos (`{{ NAME }}`, `{{na-me}}`) are visible rather than producing a silent phantom column.
  - **OAuth library servers**: zero placeholder columns → matrix shows just per-row connect/test status.
  - **File split** (ESLint 40 lines/fn, 300/file): e.g. `McpTenantMatrixModal`, `McpMatrixRow`, `McpMatrixCell`, `McpServerDefinitionSection`, `useMcpTenantConfigs`, status helpers.
- **i18n:** new namespace (don't reuse `editor.channels`): modal title, "Verify all", "Test", status tooltips (ok/warning/error/needs-config), empty/needs-config states, definition header/help, env-ref toggle + secret warning, redacted-error toast.

### 10. Status aggregation (4 states)

```ts
type ServerTenantStatus = 'ok' | 'pending' | 'error';
type ServerAggregateStatus = 'ok' | 'warning' | 'error';
```

- **Per (server, tenant):** `ok` iff every variable from `extractTemplateVariables(liveTransport)` has a non-empty effective value **and** discovery `status==='ok'` with a matching `values_hash`. Stored keys ⊄ extracted vars ⇒ `pending` regardless of cached discovery (handles template-edited-after-config — review data-M2).
- **Per server (list):** `ok` iff every tenant is `ok`; `error` if any tenant errored; else `warning` (≥1 tenant `pending`/incomplete). A "needs-config / no tenants" state is unnecessary because the default tenant always exists; an unconfigured server simply shows `warning`. The icon set adds an `error` (red) state to the current green-check / orange-warning pair.
- Computed from stored rows; only modal-open / Test / Verify-all fire live calls.

### 11. Staleness / invalidation matrix (review UI-H5)

Invalidate (reset affected discovery rows to `pending`) on: cell edit (that row), **template edit (all rows)**, library-item update (all rows for that library server), env-var **value** change (rows referencing it — detected via `values_hash` mismatch), tenant delete (cascade). Reconcile the Redis discovery cache key (`mcp_tools:v1:{orgId}:{hash}`) with **per-tenant resolved URLs** rather than the template URL (`invalidateMcpCache.ts:42-46`), so per-server cache-busts actually match.

## Error handling

- Discovery failure: store sanitized `status='error'` + redacted `error`; surface per-row + toast; server aggregate → `error`.
- Runtime missing/incomplete snapshot config for the run's tenant: fail fast, name tenant + missing vars, hint "republish required" (D6).
- `env_ref` to a deleted/empty org var: resolves empty → not-configured → tenant not `ok`; runtime fail-fast must catch empty-resolved-but-present, not just missing rows (review security-L1).
- Default tenant invariants: deletion blocked at DB; identity edits blocked.

## Testing

- **Unit:** `extractTemplateVariables` (multi/dup/none/malformed); shared `resolveTransport` parity across the (formerly three) sites; aggregate-status helper (all-ok / one-pending / error / template-edited keys-mismatch); `values_hash` invalidation.
- **DB/migration:** composite-FK cascade on server delete (no orphans); backfill creates one default tenant per org, idempotent; default-tenant delete/identity-edit guards; avatar-mirror trigger.
- **RLS:** read-authorization for config rows (org member only; cross-org denied); no recursion.
- **Snapshot/version:** publish embeds per-tenant config; `restore_version_tx` restores it; runtime resolves from snapshot (correct row by tenantId; fail-fast for post-publish tenant).
- **Registry/builder:** canonical tool list resolves against the default tenant; publish gate blocks until all-tenants-ok.
- **Security:** SSRF egress blocks; `error` redaction (no URLs/secrets persisted).
- **Web (component):** matrix renders tenants × variables; default tenant marked & first; cell edit invalidates + optimistic-lock conflict surfaced; Verify-all concurrency/partial-failure; custom-template edit re-derives columns + resets rows; OAuth server zero-column path; `Scrollable` wrapper present.

## Out of scope (YAGNI)

- Per-variable agent-level default/inherited values (D3).
- Per-tenant divergent toolsets / per-tenant node-wiring validation (D4).
- Live-fallback resolution at runtime (D6 is pure snapshot).
- Making `org_env_variables` tenant-scoped (stays org-scoped).
- Final removal of `graph_mcp_servers.variable_values` (tracked follow-up once snapshot/registry paths are migrated).
