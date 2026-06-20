# Tenant-scoped MCP configuration — Design

**Date:** 2026-06-20
**Status:** Approved (pending spec review)

## Problem

MCP servers are currently configured **agent-wide**. The set of MCPs an agent has is correctly fixed per agent, but every tenant that uses the agent shares one single MCP configuration. That is wrong: the same MCP often needs different values per tenant — different env-variable values, different configured values, even different URLs when the URL embeds a tenant-specific value.

We need each **(agent, tenant)** combination to carry its own configuration for the **same** set of MCPs. This applies equally to library-sourced MCPs and custom MCPs.

The current UI exposes per-server configuration through an accordion expansion in the "MCP servers" tab of the tools panel. That expansion is replaced by an **Edit** button (`variant="link"`) that opens a modal containing a **matrix**: one row per tenant, one column per configurable value — mirroring the existing channels matrix pattern.

An MCP server is only **"ok"** when *every* tenant has its values fully configured **and**, on running "discover tools" for that tenant's resolved configuration, the request resolves successfully.

## Current state (as built)

- **Definition + storage:** `graph_mcp_servers` keyed by `(agent_id, server_id)`. Columns: `transport_type`, `transport_config jsonb`, `enabled`, `library_item_id`, `variable_values jsonb` (agent-wide). Assembled into `McpServerConfig` in `packages/backend` (`graphAssemblers.ts`).
- **Types/schemas:** `packages/graph-types/src/schemas/mcp.schema.ts`
  - `McpServerConfig = { id, name, transport, enabled, libraryItemId?, variableValues? }`
  - `McpTransport` = discriminated union `http | sse | stdio` (`url`/`headers` or `command`/`args`/`env`).
  - `VariableValue = { type: 'direct', value } | { type: 'env_ref', envVariableId }`.
- **Placeholder syntax:** `{{NAME}}` — regex `/\{\{(\w+)\}\}/g`, substituted into url/headers/env/command/args.
- **Library vs custom:** library MCPs reference `mcp_library(id)` via `libraryItemId` and declare `variables: {name, description?}[]`; custom MCPs have a hand-edited transport and no declared variables.
- **Discovery:** `POST /api/mcp/discover` (web) resolves `variableValues` into the transport, then proxies to backend `POST /mcp/discover`. Returns `DiscoveredTool[]`. Status today is a flat `'pending' | 'active'` per server (`useMcpServers.ts`), displayed as a green check / orange warning (`McpServersSection.tsx`).
- **Env variables:** `org_env_variables`, unique `(org_id, name)` — **org-scoped**. `env_ref.envVariableId` references `org_env_variables.id`.
- **Tenants:** `tenants` table; `TenantRow { id, org_id, slug, name, avatar_url, ... }`; fetched via `getTenantsByOrgAction(orgId)`.
- **Channels matrix (reference pattern):** `packages/web/app/components/agents/channels/` — `ChannelsPanel` loads tenants, `ChannelsTable` renders rows=tenants × columns=channels, `ChannelCell` per cell.
- **Runtime:** `tenantId` is threaded to execution: `/api/execute` → `executeHandler` → `ExecuteAgentParams.tenantID` → `ProviderCtx.tenantId`. MCP transport variables are resolved at a **single point** — `resolveMcpTransportVariables` (`executeHelpers.ts`), called from `executeCoreHelpers.ts:59`, *before* the runtime edge function. `packages/api` receives fully-resolved transports.

## Decisions

| Decision | Choice |
| --- | --- |
| What defines matrix columns | **Auto-detected** `{{NAME}}` placeholders scanned from the transport (url, header values, env values, command, args). Same mechanism for library and custom MCPs. |
| When discovery runs | **On-demand + cached.** Live discovery fires only when the modal opens, on per-row "Test", or on "Verify all". Results persist per `(server, tenant)`. List view reflects last-known aggregate status with no live calls. |
| Defaults / inheritance | **None.** Every tenant configures every value independently. |
| Toolset across tenants | **Identical.** Same MCP = same tools for all tenants; per-tenant discovery is a connectivity/auth check only. The builder shows one canonical (agent-level) tool list; node tool-wiring stays tenant-agnostic. |
| Cell value type | Reuses `VariableValueSchema` (`direct` | `env_ref` → org-scoped `org_env_variables`). |
| Runtime change scope | `packages/backend` only; `packages/api` untouched. |

## Architecture

### 1. Data model

New table holding per-tenant configuration **and** the cached discovery result:

```sql
create table public.graph_mcp_server_tenant_config (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  server_id       text not null,                  -- matches graph_mcp_servers.server_id
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  variable_values jsonb not null default '{}',    -- Record<varName, VariableValue>
  discovery_status text not null default 'pending',-- 'pending' | 'ok' | 'error'
  discovery_error  text,
  discovered_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (agent_id, server_id, tenant_id)
);
```

- RLS follows the existing org-membership pattern used by `graph_mcp_servers` / `tenants` (membership via `agents.org_id` → org member, and `tenant_id` belongs to the same org). Use `SECURITY DEFINER` helpers where a subquery would otherwise run under the caller's RLS context (per project storage/RLS conventions).
- `graph_mcp_servers` remains the **definition**: transport template (with `{{placeholders}}`), `enabled`, `library_item_id`. Its `variable_values` column is **deprecated for resolution** but retained for the backfill migration; not removed in this change.
- **Backfill migration:** for every existing `graph_mcp_servers` row, insert one `graph_mcp_server_tenant_config` row per current tenant of the agent's org, copying the old agent-wide `variable_values`. `discovery_status` starts `'pending'`.

### 2. Variable extraction (columns)

Shared helper, used by both web (matrix columns) and any validation:

```ts
// scans transport.url, header values, env values, command, args
extractTemplateVariables(transport: McpTransport): string[]  // unique, ordered
```

- Lives in `packages/graph-types` (or a shared web/api util that both import) so column derivation and runtime validation agree.
- For library MCPs, the library's `variables[]` supply a `description` tooltip when a detected name matches; custom MCPs render the bare name.

### 3. Persistence / server layer (`packages/web` + `packages/backend`)

- New web server-action/route module (mirroring `actions/tenants.ts` + `lib/tenants.ts`) for:
  - `getMcpTenantConfigs(agentId, serverId)` → all per-tenant rows for the matrix.
  - `saveMcpTenantConfig(agentId, serverId, tenantId, variableValues)` → upsert; resets `discovery_status` to `'pending'` for that row.
  - `verifyMcpTenantConfig(agentId, serverId, tenantId)` → resolves that tenant's values into the transport, calls discovery, writes `discovery_status` (`ok`/`error`), `discovery_error`, `discovered_at`.
- Backend CRUD follows the existing operations pattern (`mcpServerOperations.ts`, `graphFetchers.ts`, `operationDispatch.ts`): a new `graphMcpTenantConfigOperations.ts` + fetchers.

### 4. UI

- `McpServersSection.tsx`: remove accordion expansion. Each server row shows the **aggregate status icon** + an **`Edit` button (`variant="link"`)**.
- New **matrix modal** (built like `ChannelsTable`):
  - Loads tenants via `getTenantsByOrgAction(orgId)` and configs via `getMcpTenantConfigs`.
  - **Rows = tenants** (avatar + name), **columns = `extractTemplateVariables(transport)`**, trailing column = **per-row status + "Test"** button. Header action: **"Verify all"**.
  - Each cell: text input with a toggle to "use env variable" (org-scoped picker), persisting a `VariableValue`. Editing invalidates that row's cached status.
  - For **custom** MCPs only, a collapsible **"Server definition"** section at the top edits the agent-wide transport template (URL/headers/env with `{{placeholders}}`); editing it re-derives the columns. Library MCPs hide this (template fixed by the library).
- Empty state when the org has no tenants (matrix has no rows): show guidance; server status is neutral/"needs tenants", not "ok".
- **i18n:** all new strings added to translations (modal title, column/empty/error/verify labels, status tooltips).

### 5. Status aggregation

Shared helper:

```ts
// per (server, tenant): ok iff every extracted variable has a non-empty effective
//   value AND discovery_status === 'ok'
// per server: 'ok' iff tenants.length > 0 AND every tenant row is ok; else 'warning'
```

- A cell edit sets that row's `discovery_status` back to `'pending'` → server drops out of "ok".
- A newly-added tenant has no config row → treated as `pending` → server is not "ok" until configured+verified.
- Computed from stored rows; only modal-open / Test / Verify-all fire live discovery.

### 6. Runtime resolution (`packages/backend` only)

At `executeCoreHelpers.ts:59`, resolution becomes tenant-aware:

- Load `graph_mcp_server_tenant_config` for `(agent_id, server_id, params.tenantID)`.
- Feed that row's `variable_values` into the existing `resolveServerTransport` (instead of the agent-wide `server.variableValues`), keeping the existing org-env-var merge for `env_ref`.
- If the run's tenant has **no row or incomplete values**, **fail fast** with a clear "MCP not configured for this tenant" error rather than calling a broken/unsubstituted URL.
- `packages/api` is untouched — still receives fully-resolved transports.

## Error handling

- **Discovery failure (Test/Verify):** store `discovery_status='error'` + `discovery_error`, surface in the row and as a toast; server aggregate becomes "warning".
- **Incomplete config at runtime:** fail fast with a descriptive error naming the tenant and missing variables.
- **No tenants in org:** matrix empty state; server status neutral ("needs tenants"), never "ok".
- **Env-ref points to a missing/deleted org env var:** resolves to empty → counts as not-configured → tenant not "ok".

## Testing

- **Unit:** `extractTemplateVariables` (multiple placeholders across url/headers/env, duplicates, none, malformed); aggregate-status helper (all-ok, one-pending, no-tenants, error row); tenant-aware resolution in backend (correct row picked by tenantId, fail-fast on missing/incomplete).
- **Backend:** CRUD operations for the new table (upsert resets status; fetch by agent/server).
- **Migration:** backfill produces one row per (server × current tenant) with copied values and `pending` status.
- **Web (component):** matrix renders rows=tenants × columns=variables; cell edit invalidates status; Verify-all wiring; custom-MCP definition section re-derives columns; library MCP hides it.

## Out of scope (YAGNI)

- Agent-level default/inherited values (explicitly rejected — every tenant independent).
- Per-tenant divergent toolsets / per-tenant node-wiring validation (toolset assumed identical).
- Removing the deprecated `graph_mcp_servers.variable_values` column (kept for backfill; cleanup is a later change).
- Making org env variables tenant-scoped (they stay org-scoped).
