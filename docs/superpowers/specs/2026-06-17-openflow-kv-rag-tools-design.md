# OPENFLOW/KVSTORE and OPENFLOW/RAG — agent tool groups

**Date:** 2026-06-17
**Status:** Design approved, ready for implementation plan
**Scope:** Two new builtin OpenFlow tool groups exposing KV-store and RAG-store operations to agents, plus the per-agent store-binding UI + delete-guard plumbing they require.

---

## Goals

1. Give agents read/search/write access to a KV store and read/search access to a RAG store, gated per-agent via a single bound store id per group.
2. Inject `tenantId` and the bound store id from runtime context — the agent only chooses the query parameters.
3. Mirror the existing graph save flow: changes go to draft, publish snapshots them into `agent_versions`.
4. Zero duplication with the existing FE-side KV filter and FE-side RAG search route handlers.

## Non-goals

- Multi-store per group. Single-select with `None` only.
- Regex as a user-facing RAG search mode. Regex is agent-only; FE keeps simple/semantic/hybrid.
- Audit logging on `update_value` — gated by the per-tool enable toggle, no separate permission layer.
- Backwards-compatibility shims for the new schema columns.

---

## Architecture overview

Two new builtin providers register in `packages/api/src/providers/index.ts`. Each provider's tool `execute` reads `tenantId` and the bound store id from `ProviderCtx`, then calls into a service injected by `packages/backend`. Bindings live on the `agents` row (draft) and snapshot into `agent_versions` on publish. The frontend mirrors the existing graph save flow for binding changes — `SaveStateIndicator` shows status; optimistic concurrency rejects conflicting edits.

Backend stays the owner of all data access. `packages/api` defines service interfaces only; `packages/backend` provides implementations and wires them into `ProviderCtx` at execute time (currently only the simulation path does this — we extend to the real execute path too).

---

## Data model

Two typed columns added to each of `agents` and `agent_versions`:

```sql
selected_kv_store_id  UUID NULL REFERENCES kv_stores(id)  ON DELETE RESTRICT;
selected_rag_store_id UUID NULL REFERENCES rag_stores(id) ON DELETE RESTRICT;
```

Plus single-column indexes on each (`agents.selected_kv_store_id`, `agents.selected_rag_store_id`, same on `agent_versions`) for the reverse-lookup query path.

`ON DELETE RESTRICT` is a race-condition safety net. The primary delete guard runs at the application layer so we can return a structured 409 with the list of blocking agents (the FK alone gives us a violation error with no actionable detail).

### Migrations

Two SQL files, applied by the user (per memory rule "no DB resets or migration applies"):

- `20260617000000_agent_store_bindings.sql` — the four columns + four indexes.
- `20260617100000_rag_regex_search.sql` — `rag_regex_search(p_store_id, p_tenant_id, p_pattern, p_offset, p_limit)` RPC using `content ~ p_pattern` with `SET LOCAL statement_timeout = '2s'`; `pg_trgm` extension and `gin (content gin_trgm_ops)` index on `rag_chunks` if not already present.

---

## Tool surfaces

All read tools accept optional `offset` and `limit` (with defaults) and return the data + a flat pagination metadata block. Mutations return `{ success: true }` and throw on failure.

### Pagination metadata (shared shape)

```ts
{
  // tool-specific data key (keys / entries / chunks / values)
  from: number,        // 1-indexed first item in this page
  to: number,          // 1-indexed last item in this page
  pageSize: number,    // limit applied (defaulted if not passed)
  total: number,       // total matching items
  totalPages: number,
}
```

### `OPENFLOW/KVSTORE` — 5 tools

```ts
list_keys(offset?: number, limit?: number = 100)
  → { keys: string[], from, to, pageSize, total, totalPages }

get_values(keys: string[])
  → Record<string, string | null>   // null when the key does not exist; no pagination (input bounds output)

search_simple(on: 'keys' | 'values' | 'both', query: string, offset?, limit? = 50)
  → { entries: { key: string; value: string }[], from, to, pageSize, total, totalPages }

search_regex(on: 'keys' | 'values' | 'both', pattern: string, offset?, limit? = 50)
  → { entries: { key: string; value: string }[], from, to, pageSize, total, totalPages }

update_value(key: string, value: string)
  → { success: true }
```

Semantics:

- `search_simple` = substring match, case-insensitive on the chosen field(s). If the existing FE filter differs, FE is updated to match.
- `search_regex` = JS-side `RegExp` matching the same filter helper. Agent uses `(?i)` in the pattern for case-insensitive.
- `get_values` returns `null` for missing keys so the agent can distinguish missing-vs-empty-string.

### `OPENFLOW/RAG` — 4 tools

```ts
search_simple(query: string, offset?, limit? = 20)
  → { chunks: string[], from, to, pageSize, total, totalPages }

search_semantic(query: string, minSimilarity?: number = 0.3, offset?, limit? = 20)
  → { chunks: string[], from, to, pageSize, total, totalPages }

search_hybrid(query: string, minSimilarity?: number = 0.3, offset?, limit? = 20)
  → { chunks: string[], from, to, pageSize, total, totalPages }

search_regex(pattern: string, offset?, limit? = 20)
  → { chunks: string[], from, to, pageSize, total, totalPages }
```

- `search_regex` uses the Postgres `rag_regex_search` RPC (POSIX regex). Statement timeout protects against catastrophic backtracking.
- Tool descriptions visible to the LLM teach mode selection: "Use `search_semantic` for natural-language meaning; `search_simple` for exact phrases; `search_regex` only for structured patterns (emails, IDs, SKUs); `search_hybrid` when unsure."

---

## Reusable cores (no duplication)

### KV filter → shared package

The existing FE filter logic is pure JS over `getKvEntries` output. Extract to `packages/shared-validation/src/kv/filter.ts`:

```ts
filterEntries(
  entries: { key: string; value: string }[],
  on: 'keys' | 'values' | 'both',
  matcher:
    | { kind: 'substring'; query: string; caseInsensitive: boolean }
    | { kind: 'regex'; pattern: string; flags: string }
): { key: string; value: string }[]
```

The FE page replaces its inline filter with this import. The backend `KvStoreService` (below) imports the same function. One source of truth.

### RAG search cores → extract from route handlers

`searchChunks.ts` and `hybridSearch.ts` today mix pipeline + Express `res`. Split into pure cores:

```
packages/backend/src/rag/search/
  simple.ts    → runSimpleSearch(supabase, params)
  semantic.ts  → runSemanticSearch(supabase, params)
  hybrid.ts   → runHybridSearch(supabase, params)
  regex.ts    → runRegexSearch(supabase, params)   // new, regex-only
```

Route handlers become thin wrappers: parse req → call core → write to res. The user-facing RAG search route only routes to simple/semantic/hybrid (regex stays agent-only).

### Service injection — `packages/api` stays decoupled

Provider tools in `packages/api/src/providers/{kvstore,rag}/` never import backend code. They define interfaces only:

```ts
// packages/api/src/providers/types.ts (interfaces only)

interface KvStoreService {
  listKeys(tenantId, storeId, offset, limit);
  getValues(tenantId, storeId, keys);
  searchSimple(tenantId, storeId, on, query, offset, limit);
  searchRegex(tenantId, storeId, on, pattern, offset, limit);
  updateValue(tenantId, storeId, key, value);
}

interface RagStoreService {
  searchSimple(tenantId, storeId, query, offset, limit);
  searchSemantic(tenantId, storeId, query, minSimilarity, offset, limit);
  searchHybrid(tenantId, storeId, query, minSimilarity, offset, limit);
  searchRegex(tenantId, storeId, pattern, offset, limit);
}
```

Implementations live in `packages/backend/src/services/{kvStoreService.ts, ragStoreService.ts}` and wrap the extracted cores + existing queries. They're injected at execute time at the same site `CalendarService` is wired today — extended from the simulation orchestrator to the real execute path (`routes/execute/*`).

---

## Runtime injection & cross-org guard

### `ProviderCtx` extension

```ts
interface ProviderCtx {
  orgId: string;
  tenantId: string;          // forwarded from upstream Context.tenantID (currently dropped in providerCtxFromContext)
  agentId: string;
  bindings: {
    kvStoreId: string | null;
    ragStoreId: string | null;
  };
  services<T>(providerId: string): T;
}
```

`providerCtxFromContext.ts` reads `tenantID` from the upstream `Context` and the bindings from either `agents` (draft execution) or `agent_versions` (published execution, snapshotted column).

### Per-tool guard

Every KV/RAG tool's `execute` does:

```ts
const storeId = ctx.bindings.kvStoreId;  // or ragStoreId for RAG tools
if (!storeId) {
  throw new ToolError(
    'no_store_bound',
    'No KV store bound to this agent. Bind one in the tools panel.'
  );
}
```

The FE-side disabled state already prevents the agent owner from enabling these tools without a binding; this guard is the belt-and-suspenders for the rare case where a binding clears between publish and execute.

### Cross-org guard at bind time

New endpoint `PATCH /agents/:agentId/store-bindings`:

```
1. Load agent → agent.org_id
2. If body.selectedKvStoreId !== null:
     load kv_stores row; reject 403 if kv_stores.org_id !== agent.org_id
3. If body.selectedRagStoreId !== null:
     same check against rag_stores
4. updateAgentStoreBindingsWithPrecondition(...)
5. return { updatedAt, bindings }
```

Optimistic concurrency mirrors `selectedToolsOperations.ts:updateSelectedToolsWithPrecondition`. The existing `selectedToolsLimiter` rate limiter wraps the route.

### Publish snapshot

`POST /agents/:agentId/publish` already copies draft state into a new `agent_versions` row. Extend the copy to include the two new columns. No new endpoint.

### Execute version sourcing

Draft runs read bindings from `agents`. Published runs read from `agent_versions` for the running version. This keeps "store unbound in draft but still bound in latest published version" sane: published runs keep working until the user republishes, and the delete guard prevents the store from being deleted while the published reference exists.

---

## Frontend UX

### Group ordering

`useAgentRegistry.buildState` sorts `kvstore` and `rag` groups to the front regardless of backend response order. Backend `builtInProviders` Map insertion order puts them first as well — belt-and-suspenders.

### Group header — store select

`ProviderHeader.tsx` gains an optional `rightSlot`. For kvstore/rag groups, render a compact single-select populated with the org's stores of that type plus a `None` option. Selection state comes from `useAgentToolStoresState`; changing it fires through that hook.

### Disabled tool rows

`ToolRow.tsx` gains `disabledReason: { kind: 'no_store_bound'; storeKind: 'kv' | 'rag' } | null`. When set:

- Checkbox disabled.
- Orange `Info` icon (size-3.5) right of the tool name.
- Tooltip: "Select a {kind} store at the top of this group to enable this tool."
- Row remains visible so the user understands what's gated.

### Save flow

New files mirroring the selected-tools flow:

```
app/actions/agentToolStoreBindings.ts   — server action → PATCH /agents/:id/store-bindings
app/hooks/useAgentToolStoresState.ts    — debounce + optimistic concurrency + SaveState
                                          (mirror of useAgentToolsState)
```

Reuses the existing `SaveStateIndicator` component. The hook is the single source of truth for both surfaces (group header select AND the Fix popover) — any update propagates everywhere.

### Fix popover in `ToolCombobox`

`ToolCombobox.tsx`:

- `buildGroupItems` marks items disabled when their provider needs an unbound store.
- Disabled `ComboboxItem` renders a trailing `<Button variant="link" size="sm">{t('fix')}</Button>`.
- Clicking Fix opens a floating popover anchored to the link (shadcn `Popover`) containing:
  - Title: "Select a {kind} store"
  - Description: "Tools in this group need a store to operate on. You can change this later in the tools panel."
  - Single-select (None / store options) — same data as the panel header
  - `Cancel` and `Confirm` buttons
- On `Confirm`: writes through `useAgentToolStoresState`. On success the popover closes, the binding flips, the combobox re-renders, Fix disappears, items un-disable. No dialog close, no panel open.

No global "open panel" API needed.

---

## Delete guards

### Reverse-lookup queries

New file `db/queries/agentStoreBindingsQueries.ts`:

```ts
findAgentsByKvStore(supabase, orgId, storeId)
  → { draft: AgentRef[], published: AgentRef[] }

findAgentsByRagStore(supabase, orgId, storeId)
  → same shape

type AgentRef = { id: string; slug: string; name: string }
```

- `draft` = rows from `agents` where the matching column equals `storeId`.
- `published` = rows from `agent_versions` where the matching column equals `storeId` **and** `version = agents.current_version`. Older snapshots don't block.

### Backend delete handlers

`routes/kvStores/deleteKvStore.ts` and `routes/ragStores/deleteRagStore.ts`:

```
1. Call findAgentsByXStore
2. If draft.length || published.length:
     return 409 { error: 'in_use', draft, published }
3. Else: deleteStore(...)
```

FK RESTRICT remains the race-condition safety net.

### `DeleteStoreDialog` UI

In `StoresSidebar.tsx`'s existing `DeleteStoreDialog`:

- The action call returns a discriminated result: `{ ok: true } | { ok: false; reason: 'in_use'; draft, published }`.
- On `in_use`, swap dialog body to a **blocked state** with two conditional sections:
  - **Draft** (if non-empty): "Change the store to None (or another) in these draft agents. No publish required."
  - **Published** (if non-empty): "These agents reference this store in their **latest published version**. Change the binding in their draft **and publish a new version** before this store can be deleted."
- Each section renders the full list (no cap) of clickable rows: `<Link href={`/orgs/${slug}/agents/${agent.slug}`} target="_blank">` with the agent name and an external-link icon.
- Primary button changes from "Delete" to "Close". Re-attempt after fixes is the natural loop.
- When both sections are non-empty, both render in order (draft first because it's cheaper to fix).

---

## i18n

All keys added to `packages/web/messages/en.json` and parallel locale files (verify locale list before writing).

```
agentTools.storeRequired
agentTools.storeRequiredTooltip       // "Select a {kind} store at the top of this group..."
agentTools.selectStore                 // header select placeholder ("Select store")
agentTools.noneOption                  // "None"
agentTools.fix                         // "Fix"
agentTools.fixPopoverTitle             // "Select a {kind} store"
agentTools.fixPopoverDescription
agentTools.fixPopoverCancel
agentTools.fixPopoverConfirm

knowledgeBase.deleteBlocked.title      // "This store is in use"
knowledgeBase.deleteBlocked.draftSectionTitle
knowledgeBase.deleteBlocked.draftSectionBody
knowledgeBase.deleteBlocked.publishedSectionTitle
knowledgeBase.deleteBlocked.publishedSectionBody
knowledgeBase.deleteBlocked.closeButton
```

---

## Testing

1. **`packages/api` Jest** — each new provider's `execute`:
   - Happy path with bindings set (mock `ProviderCtx`).
   - `no_store_bound` error when binding is null.
   - Cross-tenant guard (tenant id mismatch surfaces a clean error from the service mock).
2. **`packages/backend` Jest**:
   - `findAgentsByKvStore` / `findAgentsByRagStore`: draft-only, published-only, both, neither.
   - Cross-org bind rejection (403 path).
   - `runRegexSearch` core: timeout fires on a malicious pattern; invalid pattern surfaces a clean error; valid pattern returns chunks.
3. **No new FE test infra** — manual verification flow:
   - Bind store → tools un-disable → save indicator fires → publish.
   - Published version still references the store; FK prevents delete.
   - Unbind in draft → try to delete store → blocked dialog shows the agent under the **published** section (since latest published still references).
   - Republish (unbound) → store deletable.

---

## Implementation order

One PR per phase batch:

1. Phase 0 — shared cores extraction (`shared-validation` KV filter; `packages/backend/src/rag/search/` cores; route handlers become wrappers). No behavioral change.
2. Phase 1 — migrations (you apply).
3. Phase 2 — backend store-bindings endpoint + `ProviderCtx.tenantId`/`bindings` plumbing.
4. Phase 3 — two new providers + service implementations + real-execute-path wiring.
5. Phase 4 — backend delete guards + reverse-lookup queries.
6. Phase 5 — FE save flow (server action + hook + indicator reuse).
7. Phase 6 — FE tools panel UX (header select, disabled rows, group ordering).
8. Phase 7 — FE Fix popover in `ToolCombobox`.
9. Phase 8 — FE `DeleteStoreDialog` blocked state.
10. Phase 9 — i18n.
11. Phase 10 — tests.

---

## Open questions resolved during brainstorming

- **Schema shape:** typed columns now; we'll revisit a generic config slot if a third provider needs config.
- **Pagination:** optional offset/limit with defaults; structured `from/to/pageSize/total/totalPages` metadata so the agent sees there's more.
- **Fix flow:** floating popover anchored to the Fix link (title + description + select + Cancel/Confirm). No dialog close, no panel redirect.
- **Simple search semantics:** substring, case-insensitive. FE filter updated to match if it diverges.
- **Delete-blocked list:** full list, each agent a clickable link to its page (no cap).
- **`update_value`:** trusted; gated by the existing per-tool enable toggle.
- **Cross-org guard:** at bind time only (stores don't get reassigned across orgs at runtime).
- **Regex case sensitivity:** agent uses POSIX `(?i)` inline; default sensitive. No separate flag param.
