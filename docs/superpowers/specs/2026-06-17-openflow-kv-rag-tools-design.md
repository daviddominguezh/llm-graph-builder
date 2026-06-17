# OPENFLOW/KV_STORE and OPENFLOW/RAG — agent tool groups

**Date:** 2026-06-17
**Status:** Design approved (revision 2), ready for implementation plan
**Scope:** Two new builtin OpenFlow tool groups exposing KV-store and RAG-store operations to agents, the per-agent store-binding UI + delete-guard plumbing they require, plus a versioning fix to `selected_tools` and tenant-scoping for execution keys.

## Goals

1. Give agents read/search/write access to a KV store and read/search access to a RAG store, gated per-agent via a single bound store id per group.
2. Inject `tenantId` and the bound store id from runtime context — the agent never controls those.
3. Bindings AND `selected_tools` snapshot into `agent_versions` on publish so unpublished changes don't affect production. Both today and going forward.
4. Tenant-scope execution keys so a leaked key for org A can't be used to write to an unrelated tenant in org A.
5. Zero duplication with the existing FE KV filter and FE RAG search route handlers.

## Non-goals (this rev explicitly skips)

- Multi-store per group. Single-select with `None`.
- Regex as a user-facing RAG search mode. Agent-only.
- Audit logging on `update_value` beyond standard tool execution logs.
- Per-tool rate / cost limiting (future ticket).
- Per-execution write-count cap.
- Indirect-prompt-injection delimiters / system-prompt addendum (skipped because of the `_sys.` trust model — see "Security model").
- Generalising `useAgentToolsState` and the selected-tools server action (acceptable duplication for now; abstract on the third caller).
- Tenant membership in `kv_entries` / `rag_chunks` RLS (separate hardening ticket; service-role backend already bypasses RLS).
- Backfill of existing execution keys to scoped tenants. Default `all_tenants = true`; admins migrate when they want.
- Backwards-compatibility shims around the new schema columns.

## Security model

The integrity boundary is the KV `_sys.` namespace. Agents cannot write to keys with the `_sys.` prefix. Anything that must remain trustworthy across agent interactions lives under `_sys.`.

Non-`_sys.` content may be influenced by agent execution under untrusted user prompts. Relying on a non-`_sys.` value for a security-sensitive decision is out of contract. The FE shows the user that `_sys.` keys are agent-read-only (badge in the KV editor).

This trust model is why prompt-injection delimiters and a system-prompt addendum are skipped. The boundary is enforced server-side, not by the model's compliance.

## Architecture overview

Two new builtin providers register in `packages/api/src/providers/index.ts` (in this order, kvstore first): `kv_store` and `rag`. Each tool's `execute` reads `tenantId` from `ProviderCtx` and calls a service whose **bound store id is baked into the service instance** (no `bindings` field on `ProviderCtx`). Bindings live on the `agents` row (draft) and snapshot into `agent_versions` on publish.

Backend owns all data access. `packages/api` defines service interfaces only; `packages/backend` provides implementations and wires them into `ProviderCtx` at execute time. Calendar's existing pattern (`CalendarServices.calendarId` baked into the service) is the template.

## Data model & migrations

Three migrations, applied by the user (per memory rule "no DB resets or migration applies"):

### `20260617000000_agent_store_bindings_and_snapshots.sql`

```sql
ALTER TABLE agents
  ADD COLUMN selected_kv_store_id  UUID NULL REFERENCES kv_stores(id)  ON DELETE RESTRICT,
  ADD COLUMN selected_rag_store_id UUID NULL REFERENCES rag_stores(id) ON DELETE RESTRICT;

ALTER TABLE agent_versions
  ADD COLUMN selected_tools         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- versioning fix
  ADD COLUMN selected_kv_store_id   UUID NULL,
  ADD COLUMN selected_rag_store_id  UUID NULL;

CREATE INDEX ON agents (selected_kv_store_id);
CREATE INDEX ON agents (selected_rag_store_id);
CREATE INDEX ON agent_versions (selected_kv_store_id);
CREATE INDEX ON agent_versions (selected_rag_store_id);
```

`ON DELETE RESTRICT` on `agents` is the race safety net. App-level guard runs first and returns 409 with the structured list of blocking agents. `agent_versions` columns deliberately have **no** FK — published snapshots are historical records; a deleted store leaves a dangling id which the execute path treats as `no_store_bound`.

Backfill `agent_versions.selected_tools`: copy the current `agents.selected_tools` value into every existing `agent_versions` row at the user's last-published version. Older versions get the same value (best-effort; this preserves "what was published" for the latest version, which is what matters for execution).

### `20260617100000_rag_regex_search.sql`

```sql
CREATE OR REPLACE FUNCTION rag_regex_search(
  p_store_id UUID, p_tenant_id UUID, p_pattern TEXT,
  p_offset INT, p_limit INT
) RETURNS TABLE (...) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM set_config('statement_timeout', '500', true);
  RETURN QUERY SELECT ... FROM rag_chunks
    WHERE rag_store_id = p_store_id
      AND tenant_id    = p_tenant_id
      AND content ~ p_pattern
    OFFSET p_offset LIMIT p_limit;
END;
$$;
```

500 ms timeout (not 2s) so N concurrent malicious patterns can't exhaust the connection pool. No `pg_trgm` index — `content ~ pattern` rarely uses it and it's dead weight on writes; revisit if benchmarks change.

### `20260617200000_execution_key_tenant_scoping.sql`

```sql
ALTER TABLE execution_keys
  ADD COLUMN all_tenants BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE execution_key_tenants (
  execution_key_id UUID NOT NULL REFERENCES execution_keys(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id)        ON DELETE CASCADE,
  PRIMARY KEY (execution_key_id, tenant_id)
);
```

RLS policies on `execution_key_tenants` mirror the existing `execution_key_agents` policies (same org-membership pattern). Default `all_tenants = true` preserves current behavior for existing keys (acceptable because OpenFlow has no production users yet).

## Tool surfaces

Read tools accept optional `offset` and `limit`; mutations return `{ success: true }` and throw on failure. Canonical pagination shape across all read tools:

```ts
{
  items: T[],
  total: number,    // total matching items
  offset: number,   // echoed back (defaulted if not passed)
  limit: number,    // echoed back (defaulted if not passed)
  truncated?: true, // present only when (offset + limit) was clamped to MAX_OFFSET
}
```

`MAX_OFFSET` ≈ 1000 on every read tool. Any input exceeding it is clamped, the response sets `truncated: true`, and the agent learns to narrow the query instead of walking the corpus.

### `OPENFLOW/KV_STORE` — 4 tools

```ts
list_keys(offset?: number, limit?: number = 100)
  → { items: string[], total, offset, limit, truncated? }

get_values(keys: string[])
  → Record<string, string | null>   // null when missing; no pagination

search(
  on: 'keys' | 'values' | 'both',
  mode: 'substring' | 'regex',
  query: string,
  offset?: number,
  limit?: number = 50
)
  → { items: { key: string; value: string }[], total, offset, limit, truncated? }

update_value(key: string, value: string)
  → { success: true }
```

Semantics:

- `search` with `mode='substring'` = substring, case-insensitive on the chosen field(s). Reuses the FE filter helper (extracted to shared package; see Phase 0).
- `search` with `mode='regex'` = compiled with **`node-re2`** (linear-time engine — `new RegExp` is exploitable to catastrophic backtracking and is forbidden on this path).
- `update_value` enforces server-side: keys starting with `_sys.` are rejected with `ToolError('protected_key')`. Per-call size caps: key ≤ 256 bytes, value ≤ 256 KB. Both surfaced as `ToolError` codes (`key_too_long`, `value_too_large`).
- `get_values` returns `null` for missing keys.

### `OPENFLOW/RAG` — 1 tool

```ts
search(
  mode: 'bm25' | 'semantic' | 'hybrid' | 'regex',
  query: string,
  minSimilarity?: number = 0.3,  // applies only to semantic + hybrid
  offset?: number,
  limit?: number = 20
)
  → { items: string[], total, offset, limit, truncated? }
```

Zod descriptions on each enum value (visible to the LLM):

- `bm25`: "Lexical keyword search ranked by term frequency (Postgres FTS). Best for exact terms, proper nouns, IDs, and codes where the wording is known."
- `semantic`: "Vector similarity over text embeddings. Best for natural-language meaning when the exact wording differs."
- `hybrid`: "Combines semantic and bm25 — runs both and merges by score. Use when unsure which would win."
- `regex`: "POSIX regex over chunk content. Use only for structured patterns (emails, IDs, SKUs). Slow; prefer bm25 unless you need a pattern."

`mode='regex'` routes to the `rag_regex_search` RPC. Other modes route to the existing extracted cores.

## Reusable cores (no duplication)

### KV filter → shared package

Extract the FE filter to `packages/shared-validation/src/kv/filter.ts`, **preserving the existing contract first** (Phase 0a). The existing FE filter is `key OR value` substring, case-insensitive — no `on` parameter. Extract it as-is; FE imports it. No UX change.

Then (Phase 0b) add `filterByMatcher(entries, on, matcher)` for the agent tool:

```ts
filterByMatcher(
  entries: { key: string; value: string }[],
  on: 'keys' | 'values' | 'both',
  matcher:
    | { kind: 'substring'; query: string; caseInsensitive: boolean }
    | { kind: 'regex'; pattern: string; flags: string }
): { key: string; value: string }[]
```

`'both'` reproduces the existing `key OR value` semantics. FE can switch to `filterByMatcher(entries, 'both', { kind: 'substring', query, caseInsensitive: true })` at its leisure — not required by this work.

### RAG search cores → extract from route handlers

`searchChunks.ts` and `hybridSearch.ts` mix pipeline + Express `res`. Split into pure cores returning paginated results; **separate internal functions per mode** (no `mode` parameter on the cores):

```
packages/backend/src/rag/search/
  bm25.ts      → runBm25Search(supabase, params)        // existing simple/keyword path
  semantic.ts  → runSemanticSearch(supabase, params)
  hybrid.ts    → runHybridSearch(supabase, params)
  regex.ts     → runRegexSearch(supabase, params)       // new, via rag_regex_search RPC
```

Route handlers become thin wrappers: parse req → call core → write to `res`. The user-facing RAG search route only routes to bm25/semantic/hybrid (regex stays agent-only).

The `OPENFLOW/RAG.search` tool is a dispatcher that picks one of the four cores by `mode`. No FE call-site changes from the extraction.

### Service injection — `packages/api` stays decoupled

Provider tools in `packages/api/src/providers/{kv_store,rag}/` never import backend code. Service interfaces only, in `packages/api/src/providers/types.ts`. Per existing convention `services: (id: string) => unknown` stays as-is; each provider uses its own narrowing guard (e.g. `isKvStoreServices(x): x is KvStoreServices`) like `isCalendarServices` already does.

```ts
interface KvStoreServices {
  storeId: string;                              // baked in at instantiation
  listKeys(tenantId, offset, limit);
  getValues(tenantId, keys);
  searchSubstring(tenantId, on, query, offset, limit);
  searchRegex(tenantId, on, pattern, offset, limit);
  updateValue(tenantId, key, value);
}

interface RagStoreServices {
  storeId: string;
  searchBm25(tenantId, query, offset, limit);
  searchSemantic(tenantId, query, minSimilarity, offset, limit);
  searchHybrid(tenantId, query, minSimilarity, offset, limit);
  searchRegex(tenantId, pattern, offset, limit);
}
```

When a binding is `null`, the host registers a sentinel that throws `ToolError('no_store_bound')` from every method. The provider tool's `execute` doesn't need to read or check the binding — the service either works or throws.

Backend implementations live in `packages/backend/src/services/{kvStoreService.ts, ragStoreService.ts}` and wrap the cores + queries. Injected at execute time at the same site `CalendarService` is wired today — extended from the simulation orchestrator to the real execute path (`routes/execute/*`).

## Runtime injection, error contract & cross-tenant guard

### `ProviderCtx` extension

```ts
interface ProviderCtx {
  orgId: string;
  tenantId: string;                            // forwarded from upstream Context.tenantID
  agentId: string;
  services: (providerId: string) => unknown;   // unchanged; provider narrows via guard
}
```

No `bindings` field. The bound store id lives inside the per-provider service object (see above) — this keeps `ProviderCtx` universal as more providers gain config.

### `ToolError`

Defined in `packages/api/src/providers/types.ts`:

```ts
type ToolErrorCode =
  | 'no_store_bound'
  | 'protected_key'
  | 'key_too_long'
  | 'value_too_large'
  | 'invalid_pattern'
  | 'pattern_timeout'
  | 'tenant_not_allowed';

class ToolError extends Error {
  constructor(public code: ToolErrorCode, message: string) { super(message); }
}
```

Each tool throws `ToolError` with a code. The `toAiSdkTool` adapter (single chokepoint) catches and formats as a structured tool error the LLM can reason about.

### Observability seam

`toAiSdkTool` wraps `execute` with `ctx.logger.timing(providerId, toolName, durationMs, ok)` and stamps `(orgId, agentId, providerId, toolName)` on every tool log. One diff covers all 5 new tools and every existing builtin going forward.

### Logging hygiene

No tool body, key, pattern, or query content is logged. Only metadata: provider id, tool name, duration, `ok`, error code if any. Audit existing `[ragSem]`/`[ragHyb]` lines as part of this phase and bring them in line.

### Cross-tenant guard via execution keys

`originGuard.ts`:

```
if (key.all_tenants) {
  // existing behavior — verify body.tenantId belongs to key.org_id
} else {
  // require body.tenantId IN (SELECT tenant_id FROM execution_key_tenants WHERE execution_key_id = key.id)
  // reject 403 'tenant_not_allowed' on miss
}
```

The check runs once per request before `ProviderCtx` is built. After it passes, `tenantId` is trusted throughout execution.

### Cross-org guard at bind time

`PATCH /agents/:agentId/store-bindings`:

```
1. Load agent → agent.org_id
2. If body.selectedKvStoreId !== null:
     load kv_stores row; reject 403 if kv_stores.org_id !== agent.org_id
3. If body.selectedRagStoreId !== null: same check on rag_stores
4. updateAgentStoreBindingsWithPrecondition(...)   // optimistic concurrency
5. return { updatedAt, bindings }
```

Mirrors `selectedToolsOperations.ts:updateSelectedToolsWithPrecondition`. The existing `selectedToolsLimiter` wraps the route.

### Publish snapshot (extended)

`POST /agents/:agentId/publish` already copies the agent's draft into a new `agent_versions` row. The copy now includes `selected_tools`, `selected_kv_store_id`, and `selected_rag_store_id`. To avoid the snapshot/delete race, the publish path takes `SELECT … FOR SHARE` on any referenced store row before inserting the `agent_versions` row.

### Execute version sourcing

Draft runs read `selected_tools` + bindings from `agents`. Published runs read all three from `agent_versions` for the running version. This is the fix to the previously-broken `selected_tools` versioning: unpublished tool toggles no longer affect production.

## Frontend UX

### Group ordering

`useAgentRegistry.buildState` sorts `kv_store` and `rag` to the front regardless of backend response order. Backend `builtInProviders` Map insertion order also puts them first — belt-and-suspenders.

### Group header — store select

`ProviderHeader.tsx` gains an optional `rightSlot`. For kv_store and rag groups, render a compact single-select populated with the org's stores of that type plus a `None` option. Selection state comes from `useAgentToolStoresState`; changes fire through that hook (debounced save → `SaveStateIndicator`).

### Disabled tool rows

`ToolRow.tsx` gains `disabledReason: { kind: 'no_store_bound'; storeKind: 'kv' | 'rag' } | null`. When set: checkbox disabled, orange `Info` icon (size-3.5) right of the tool name with tooltip "Select a {kind} store at the top of this group to enable this tool." Row stays visible.

### Save flow

```
app/actions/agentToolStoreBindings.ts   — server action → PATCH /agents/:id/store-bindings
app/hooks/useAgentToolStoresState.ts    — mirror of useAgentToolsState
                                          (debounce + optimistic concurrency + SaveState)
```

Existing `SaveStateIndicator` reused. The hook is the single source of truth for both the panel header select AND the Fix popover. Generalisation of the underlying save engine is deferred (not done as part of this work).

### Fix popover in `ToolCombobox`

`ToolCombobox.tsx` marks items disabled when their provider needs an unbound store. Disabled items render a trailing `<Button variant="link" size="sm">Fix</Button>`. Clicking opens a floating popover anchored to the link (shadcn `Popover`):

- Title: "Select a {kind} store"
- Description: "Tools in this group need a store to operate on. You can change this later in the tools panel."
- Single-select (None / store options) — same data as the panel header
- `Cancel` and `Confirm` buttons

On `Confirm`: writes through `useAgentToolStoresState`. On success the popover closes, the binding flips, the combobox re-renders, Fix disappears, items un-disable. No dialog close, no panel open.

### KV editor — `_sys.` indicator

In the KV store editor (`StoresSidebar.tsx` / KV detail view), add a small badge next to keys starting with `_sys.` and a one-line helper above the table: "Keys prefixed with `_sys.` are read-only to agents. Use them for values that must remain trustworthy across agent interactions."

### Execution-key dialog — tenant scope

Mirror the existing agent-scope UI in the execution-key issue/edit dialog. Tenant multi-select with a "All tenants" toggle; same warning component currently shown for "All agents" appears for "All tenants". Key list row shows a "tenants: N" or "all tenants" badge alongside the existing agents badge.

## Delete guards

### Reverse-lookup queries

`db/queries/agentStoreBindingsQueries.ts`:

```ts
findAgentsByKvStore(supabase, orgId, storeId)
  → { draft: AgentRef[], published: AgentRef[] }

findAgentsByRagStore(supabase, orgId, storeId)
  → same shape

type AgentRef = { id: string; slug: string; name: string }
```

Both queries enforce `agents.org_id = :orgId` and `agent_versions.org_id = :orgId` in the WHERE — never trust a UUID alone. Draft = current `agents` row matching the store. Published = `agent_versions` row matching AND `version = agents.current_version` (older snapshots don't block).

### Backend delete handlers

`routes/kvStores/deleteKvStore.ts` and `routes/ragStores/deleteRagStore.ts`:

```
1. Verify caller can access the store (org-scoped)
2. Call findAgentsByXStore(orgId, storeId)
3. If draft.length || published.length:
     return 409 { error: 'in_use', draft, published }
4. Else: deleteStore(...)
```

FK RESTRICT on `agents` (no FK on `agent_versions`) remains the race safety net. The publish-vs-delete race is closed by the `SELECT … FOR SHARE` on the store row inside the publish transaction.

### `DeleteStoreDialog` UI

Action call returns `{ ok: true } | { ok: false; reason: 'in_use'; draft, published }`. On `in_use`, swap dialog body to a blocked state:

- Draft section (if non-empty): "Change the store to None (or another) in these draft agents. No publish required."
- Published section (if non-empty): "These agents reference this store in their **latest published version**. Change the binding in their draft **and publish a new version** before this store can be deleted."

Each section renders the full list (no cap) of clickable rows: `<Link href={`/orgs/${slug}/agents/${agent.slug}`} target="_blank">`. Primary button becomes "Close".

## i18n

```
agentTools.storeRequired
agentTools.storeRequiredTooltip
agentTools.selectStore
agentTools.noneOption
agentTools.fix
agentTools.fixPopoverTitle
agentTools.fixPopoverDescription
agentTools.fixPopoverCancel
agentTools.fixPopoverConfirm

knowledgeBase.deleteBlocked.title
knowledgeBase.deleteBlocked.draftSectionTitle
knowledgeBase.deleteBlocked.draftSectionBody
knowledgeBase.deleteBlocked.publishedSectionTitle
knowledgeBase.deleteBlocked.publishedSectionBody
knowledgeBase.deleteBlocked.closeButton

knowledgeBase.kvStore.sysHelperText   // "_sys.-prefixed keys are read-only to agents."
knowledgeBase.kvStore.sysBadge        // "read-only"

executionKeys.allTenants
executionKeys.allTenantsWarning       // mirrors allAgentsWarning
executionKeys.selectTenants
executionKeys.tenantsBadge            // "tenants: {count}"
```

Locale parity in `messages/es.json` etc.

## Testing

1. **`packages/api` Jest** — each new tool's `execute`:
   - Happy path (services mocked).
   - `no_store_bound` error when service is the unbound sentinel.
   - `protected_key` error on `_sys.*` writes.
   - `key_too_long` / `value_too_large` on cap violations.
2. **`packages/backend` Jest**:
   - `findAgentsByKvStore` / `findAgentsByRagStore`: draft-only, published-only, both, neither; explicit `orgId` enforcement (cross-org request returns empty).
   - Cross-org bind rejection (403).
   - `originGuard` with `all_tenants=true` (current behavior), `all_tenants=false` and tenant in allowlist (allow), `all_tenants=false` and tenant not in allowlist (reject `tenant_not_allowed`).
   - `runRegexSearch`: 500 ms timeout fires on a catastrophic pattern; invalid POSIX surfaces a clean error; valid pattern returns chunks.
   - Publish snapshot copies `selected_tools` + both bindings.
3. **No new FE test infra**. Manual verification:
   - Bind store → tools un-disable → save indicator fires → publish.
   - Republish without binding → published version stops referencing store → delete now allowed.
   - Try to delete store referenced in latest published → blocked dialog shows the agent under the published section.
   - Issue a tenant-scoped key; verify execute with that key against a non-allowed tenant returns 403.

## Implementation order

One PR per phase batch:

- **Phase 0a** — Extract FE KV filter to `packages/shared-validation/src/kv/filter.ts` preserving current contract; FE imports it. No behavioral change.
- **Phase 0b** — Add `filterByMatcher` (with `on` parameter) to the same module for agent-tool use.
- **Phase 0c** — Extract RAG search cores into `packages/backend/src/rag/search/{bm25,semantic,hybrid}.ts`; route handlers become wrappers.
- **Phase 1** — Migrations (you apply): three SQL files above.
- **Phase 2** — Backend store-bindings endpoint; `ProviderCtx.tenantId` forwarded; `ToolError` defined; logging hygiene rule.
- **Phase 3** — Tenant-scoping in `originGuard.ts`; `execution_key_tenants` mutations; execution-key UI tenant select + warning.
- **Phase 4** — `runRegexSearch` (backend) + new RAG and KV providers (`packages/api`) + service implementations (`packages/backend`) + real-execute-path wiring; observability seam in `toAiSdkTool`.
- **Phase 5** — Backend delete guards + reverse-lookup queries (org-scoped); publish path takes `SELECT … FOR SHARE` on referenced stores.
- **Phase 6** — Backfill `agent_versions.selected_tools` (one-off script, you run); switch execute path to read `selected_tools` + bindings from `agent_versions` for published runs.
- **Phase 7** — FE save flow (server action + hook + indicator reuse).
- **Phase 8** — FE tools panel UX (header select, disabled rows, group ordering); `_sys.` badge in KV editor.
- **Phase 9** — FE Fix popover in `ToolCombobox`.
- **Phase 10** — FE `DeleteStoreDialog` blocked state.
- **Phase 11** — i18n.
- **Phase 12** — Tests per the matrix above.

## Open questions resolved during brainstorming (rev 2)

- **Schema shape:** typed columns now.
- **Pagination:** canonical `{ items, total, offset, limit, truncated? }`. `MAX_OFFSET ≈ 1000`.
- **Fix flow:** floating popover anchored to the Fix link.
- **Simple search semantics:** KV `mode='substring'` = substring case-insensitive; RAG `mode='bm25'` = lexical FTS.
- **Delete-blocked list:** full list, clickable links.
- **`update_value` integrity boundary:** `_sys.` prefix is server-enforced; size caps (key ≤ 256 B, value ≤ 256 KB); no write-count cap.
- **Cross-org store guard:** at bind time only.
- **Regex case sensitivity:** agent uses POSIX `(?i)` inline (RAG) / standard JS flags (KV). Default sensitive.
- **Regex engine:** `node-re2` for KV-side JS regex (no `new RegExp`); plpgsql `~` with 500 ms timeout for RAG.
- **Bindings location:** baked into per-provider service objects (`KvStoreServices.storeId`, `RagStoreServices.storeId`), not on `ProviderCtx`.
- **`ToolError`:** defined with enum'd codes in `providers/types.ts`.
- **Observability:** wrapped once in `toAiSdkTool` for all builtins.
- **Versioning:** `selected_tools` + bindings both snapshot into `agent_versions`. Existing `selected_tools` versioning bug fixed as part of this work.
- **Execution-key tenant scoping:** `all_tenants` boolean + `execution_key_tenants` join table (mirrors `all_agents` + `execution_key_agents`). Existing keys default to `all_tenants = true`.
- **Prompt injection guardrails:** skipped. `_sys.` is the trust boundary; non-`_sys.` content is out of contract for security-sensitive decisions.
- **Rate / cost limiting:** skipped (future ticket).
- **Generalise `useAgentToolsState`:** skipped; two clones are fine, abstract on the third.
- **`kv_entries` / `rag_chunks` RLS tightening:** separate hardening ticket.
- **Playwright smoke for delete-blocked:** deferred; manual verification only.
- **Naming:** provider id `kv_store` (snake_case, matches `lead_scoring`).
- **RAG tool surface collapsed** to one `search` tool with a `mode` enum; same for KV. Zod descriptions teach the LLM each mode's purpose.
