# OPENFLOW/KV_STORE and OPENFLOW/RAG Implementation Plan (rev 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Rev 2 changes** (from initial draft): fixed `statement_timeout` units, restricted regex/text-search RPCs to `service_role`, backfill only `current_version`, kept FE-facing `simple` naming intact, added pre-validation + size caps on regex inputs, moved tenant-scope check to a channel-agnostic guard, switched KV substring search to SQL+pg_trgm (kept regex in-memory with row cap), added `FOR SHARE` on agent row during publish, added Jest coverage for the version sourcing change, split provider tool executors for `max-lines-per-function: 40` compliance, added dedicated rate limiter for store-bindings, and made `_sys.` matching case-insensitive at the service layer.

**Goal:** Add two builtin OpenFlow tool groups (`OPENFLOW/KV_STORE` and `OPENFLOW/RAG`) that let agents read/search/write KV stores and read/search RAG stores, gated per-agent via a single bound store id per group; snapshot bindings + `selected_tools` into `agent_versions` to fix tool versioning; scope execution keys to tenants.

**Architecture:** Two builtin providers in `packages/api/src/providers/` define tool schemas + dispatch via a backend-injected service. The bound store id is baked into each per-provider service instance — `ProviderCtx` stays universal. Pure search/filter cores live in `packages/backend/src/rag/search/` and `packages/shared-validation/src/kv/`; the existing FE route handlers and FE filter become wrappers around the same cores. Bindings are PATCHed from the FE through a debounced optimistic-concurrency save flow that mirrors `useAgentToolsState`.

**Tech stack:** TypeScript ESM (NodeNext), Supabase/Postgres, Vercel AI SDK, Express on backend, Next.js 16 App Router on frontend, shadcn/ui (@base-ui/react), Jest, next-intl, dayjs, `node-re2`.

**Spec reference:** `docs/superpowers/specs/2026-06-17-openflow-kv-rag-tools-design.md`

---

## File Structure

### Created files

```
packages/shared-validation/src/kv/
  filter.ts                    — pure KV filter helpers (substring + regex via node-re2)
  filter.test.ts               — Jest tests

packages/backend/src/rag/search/
  simple.ts                    — extracted from searchChunks.ts; pure runSimpleSearch() (FE 'simple' mode)
  semantic.ts                  — extracted from searchChunks.ts; pure runSemanticSearch()
  hybrid.ts                    — extracted from hybridSearch.ts; pure runHybridSearch()
  regex.ts                     — new; runRegexSearch() via rag_regex_search RPC

packages/backend/src/services/
  kvStoreService.ts            — backend impl of KvStoreServices; baked storeId
  ragStoreService.ts           — backend impl of RagStoreServices; baked storeId
  noStoreBoundServices.ts      — sentinel that throws ToolError('no_store_bound')

packages/backend/src/db/queries/
  agentStoreBindingsQueries.ts — get/set bindings + findAgentsByXStore (org-scoped)
  executionKeyTenantsQueries.ts — get/replace tenant scopes for an execution key

packages/api/src/providers/kv_store/
  index.ts                     — provider registration
  buildTools.ts                — tool execute() functions; services narrowed via guard
  descriptors.ts               — describeTools()
  buildTools.test.ts           — Jest tests for execute() paths

packages/api/src/providers/rag/
  index.ts                     — provider registration
  buildTools.ts                — single search tool dispatching by mode
  descriptors.ts               — describeTools()
  buildTools.test.ts           — Jest tests

packages/backend/src/routes/agents/
  updateStoreBindings.ts       — PATCH /agents/:agentId/store-bindings handler

packages/backend/src/routes/execute/
  enforceTenantScope.ts        — channel-agnostic tenant scope + ownership guard

packages/web/app/actions/
  agentToolStoreBindings.ts    — server action wrapping PATCH /agents/:id/store-bindings

packages/web/app/hooks/
  useAgentToolStoresState.ts   — mirror of useAgentToolsState for bindings

packages/web/app/components/panels/
  FixStorePopover.tsx          — floating popover for the Fix link in ToolCombobox
  StoreSelect.tsx              — single-select with None used in ProviderHeader rightSlot

supabase/migrations/
  20260617000000_agent_store_bindings_and_snapshots.sql
  20260617100000_rag_regex_search.sql
  20260617150000_kv_entries_trigram_indexes.sql
  20260617200000_execution_key_tenant_scoping.sql

docs/superpowers/specs/
  (the spec, already committed)
```

### Modified files

```
packages/api/src/providers/types.ts          — add ToolError + KvStoreServices/RagStoreServices interfaces + observability wrapping
packages/api/src/providers/index.ts          — register kv_store + rag (first two entries)
packages/api/src/providers/provider.ts       — no shape change; document services-bag pattern
packages/api/src/core/providerCtxFromContext.ts — forward tenantId
packages/api/src/types/tools.ts              — (no change; Context.tenantID already exists)

packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts  — thin wrapper around runSimpleSearch / runSemanticSearch
packages/backend/src/routes/ragStores/ragFiles/hybridSearch.ts  — thin wrapper around runHybridSearch
packages/backend/src/db/queries/kvEntriesQueries.ts             — add listKeys / getByKeys / updateValue
packages/backend/src/db/queries/ragChunksQueries.ts             — add searchByRegex (calls rag_regex_search)
packages/backend/src/db/queries/agentQueries.ts                 — selected_kv_store_id / selected_rag_store_id columns
packages/backend/src/db/queries/selectedToolsOperations.ts      — extract precondition helper for reuse
packages/backend/src/routes/agents/agentRouter.ts               — wire new PATCH route
packages/backend/src/routes/agents/handlePostPublish.ts         — snapshot selected_tools + bindings (+ FOR SHARE locks)
packages/backend/src/routes/execute/originGuard.ts              — tenant scoping check
packages/backend/src/routes/execute/executeCoreSetup.ts         — version sourcing for selected_tools + bindings
packages/backend/src/routes/simulationOrchestrator.ts           — wire kv_store + rag services
packages/backend/src/routes/simulateHandler.ts                  — same
packages/backend/src/routes/execute/executeHandler.ts (or current real path) — wire services
packages/backend/src/routes/kvStores/deleteKvStore.ts           — usage guard
packages/backend/src/routes/ragStores/deleteRagStore.ts         — usage guard
packages/backend/src/db/queries/executionKeyQueries.ts          — read all_tenants + scoped tenants
packages/backend/src/db/queries/executionKeyMutations.ts        — write all_tenants + tenant scope rows

packages/web/app/components/panels/ProviderHeader.tsx           — rightSlot prop
packages/web/app/components/panels/ToolRow.tsx                  — disabledReason prop + orange info icon
packages/web/app/components/panels/ToolsPanelAgentMode.tsx      — pass binding state down
packages/web/app/components/panels/ToolCombobox.tsx             — Fix link + FixStorePopover wiring
packages/web/app/hooks/useAgentRegistry.ts                      — order kv_store + rag first
packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/StoresSidebar.tsx — DeleteStoreDialog blocked state
packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/kv/[storeSlug]/ (existing KV editor) — _sys. badge + helper text
packages/web/app/...execution-keys-dialog (existing path)        — tenant multi-select + warning
packages/web/messages/en.json                                   — new keys
```

(Find the exact KV editor and execution-keys dialog paths during their respective tasks — they live under `app/orgs/[slug]/(dashboard)/` and exist today.)

---

## Standing rules

These apply at every step; the plan does not repeat them.

1. **Never disable ESLint.** Refactor into smaller helpers if you hit `max-lines-per-function: 40`, `max-lines: 300`, or `max-depth: 2`.
2. **Never use `any`.** Explicit types. `unknown` + narrowing guard is the project pattern at service-bag boundaries.
3. **Add translations.** Every new user-facing string goes into `packages/web/messages/en.json` and is referenced via `next-intl`.
4. **Frequent commits.** One commit per task. The commit message should describe the change, not the task number.
5. **`npm run check` after every phase.** Format + lint + typecheck must be green.
6. **DB migrations: write only; do not apply.** The user applies them. Place migration files in `supabase/migrations/` with the timestamps listed below.
7. **Reuse existing patterns.** Look at neighboring code (calendar provider, useAgentToolsState, selectedToolsOperations, deleteRagStore) before writing anything new.
8. **No new logic where existing logic can be reused.** This is a hard user requirement.

---

## Phase 0a — Extract FE KV filter, preserve current contract

Goal: move the in-memory KV filter from the FE page into a shared module that both FE and the future agent tool can import. **No behavior change in this phase.**

### Task 0a.1: Locate the existing FE filter

**Files:**
- Read: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/kv/[storeSlug]/` (find the KV table/list component)

- [ ] **Step 1: Find the filter call site.** Run `grep -rn "filter\|search\|query" packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/kv/ | head -40`. Identify the file that filters KV entries client-side. Most likely a component containing a search input and an `entries.filter(...)` over `{ key, value }[]`.
- [ ] **Step 2: Read the matched file and copy the exact predicate.** Confirm semantics: substring, case-insensitive, matches on key OR value. Record file path + line range — you'll edit it in Task 0a.3.

### Task 0a.2: Create the shared module

**Files:**
- Create: `packages/shared-validation/src/kv/filter.ts`
- Create: `packages/shared-validation/src/kv/filter.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// packages/shared-validation/src/kv/filter.test.ts
import { filterDefault } from './filter.js';

describe('filterDefault', () => {
  const entries = [
    { key: 'user.name', value: 'Alice' },
    { key: 'user.email', value: 'alice@example.com' },
    { key: 'flags.beta', value: 'true' },
  ];

  it('matches substring on key or value, case-insensitive', () => {
    expect(filterDefault(entries, 'USER')).toEqual([entries[0], entries[1]]);
    expect(filterDefault(entries, 'beta')).toEqual([entries[2]]);
    expect(filterDefault(entries, 'alice')).toEqual([entries[0], entries[1]]);
  });

  it('returns all entries on empty query', () => {
    expect(filterDefault(entries, '')).toEqual(entries);
  });

  it('returns empty array on no match', () => {
    expect(filterDefault(entries, 'zzz')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run `npm test -w packages/shared-validation -- --testPathPattern=kv/filter`. Expect: `Cannot find module './filter.js'`.
- [ ] **Step 3: Implement `filterDefault`.**

```ts
// packages/shared-validation/src/kv/filter.ts
export interface KvEntry {
  key: string;
  value: string;
}

export function filterDefault(entries: KvEntry[], query: string): KvEntry[] {
  if (query === '') return entries;
  const needle = query.toLowerCase();
  return entries.filter(
    (e) => e.key.toLowerCase().includes(needle) || e.value.toLowerCase().includes(needle)
  );
}
```

- [ ] **Step 4: Run test to verify it passes.** Run `npm test -w packages/shared-validation -- --testPathPattern=kv/filter`. Expect: 3 passing.
- [ ] **Step 5: Export from package index.** Add `export * from './kv/filter.js';` to `packages/shared-validation/src/index.ts` (or wherever the package barrel lives — verify by reading the existing index).
- [ ] **Step 6: Run typecheck.** Run `npm run typecheck -w packages/shared-validation`. Expect: clean.
- [ ] **Step 7: Commit.**

```bash
git add packages/shared-validation/src/kv/filter.ts packages/shared-validation/src/kv/filter.test.ts packages/shared-validation/src/index.ts
git commit -m "feat(shared-validation): extract KV substring filter into shared module"
```

### Task 0a.3: Replace the FE call site

**Files:**
- Modify: the file identified in Task 0a.1

- [ ] **Step 1: Import from shared.** Add `import { filterDefault } from '@openflow/shared-validation';` (or the correct import path — verify the package name in the FE's `package.json` workspace map).
- [ ] **Step 2: Replace the inline predicate with `filterDefault(entries, query)`.** Delete the local helper. The component should be slightly shorter.
- [ ] **Step 3: Run typecheck.** `npm run typecheck -w packages/web`. Expect: clean.
- [ ] **Step 4: Manual verify.** Run `npm run dev -w packages/web`, open a KV store, type into the search box. Same behavior as before.
- [ ] **Step 5: Commit.**

```bash
git add packages/web/app/orgs/...
git commit -m "refactor(web): use shared KV filter helper in KV store table"
```

### Task 0a.4: Run full check

- [ ] **Step 1:** `npm run check`. Expect: clean.
- [ ] **Step 2:** Note any pre-existing lint warnings; don't address them in this phase.

---

## Phase 0b — Add `filterByMatcher` for agent-tool use

Goal: extend the shared module with the `on` parameter + regex matcher. FE keeps using `filterDefault`; the agent tool will use this.

### Task 0b.1: Write tests for `filterByMatcher`

**Files:**
- Modify: `packages/shared-validation/src/kv/filter.test.ts`

- [ ] **Step 1: Append tests.**

```ts
import { filterByMatcher } from './filter.js';

describe('filterByMatcher', () => {
  const entries = [
    { key: 'user.name', value: 'Alice' },
    { key: 'flags.beta', value: 'true' },
  ];

  it('substring on=keys ignores values', () => {
    expect(
      filterByMatcher(entries, 'keys', { kind: 'substring', query: 'alice', caseInsensitive: true })
    ).toEqual([]);
  });

  it('substring on=values matches only values', () => {
    expect(
      filterByMatcher(entries, 'values', { kind: 'substring', query: 'alice', caseInsensitive: true })
    ).toEqual([entries[0]]);
  });

  it('substring on=both matches either side', () => {
    expect(
      filterByMatcher(entries, 'both', { kind: 'substring', query: 'user', caseInsensitive: true })
    ).toEqual([entries[0]]);
  });

  it('regex on=keys with RE2', () => {
    expect(
      filterByMatcher(entries, 'keys', { kind: 'regex', pattern: '^flags\\..*', flags: '' })
    ).toEqual([entries[1]]);
  });

  it('throws ToolError on invalid pattern', () => {
    expect(() =>
      filterByMatcher(entries, 'keys', { kind: 'regex', pattern: '[unterminated', flags: '' })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run** — expect failures.

### Task 0b.2: Implement `filterByMatcher`

**Files:**
- Modify: `packages/shared-validation/src/kv/filter.ts`

- [ ] **Step 1: Install `node-re2` in the shared-validation package.** Run `npm install re2 -w packages/shared-validation`. (Package name on npm is `re2`, not `node-re2`.)
- [ ] **Step 2: Add the implementation.**

```ts
import RE2 from 're2';

export type FilterOn = 'keys' | 'values' | 'both';

export type FilterMatcher =
  | { kind: 'substring'; query: string; caseInsensitive: boolean }
  | { kind: 'regex'; pattern: string; flags: string };

function matchSubstring(s: string, query: string, ci: boolean): boolean {
  if (query === '') return true;
  if (ci) return s.toLowerCase().includes(query.toLowerCase());
  return s.includes(query);
}

function matchRegex(s: string, re: RE2): boolean {
  return re.test(s);
}

function applyMatch(entry: KvEntry, on: FilterOn, fn: (s: string) => boolean): boolean {
  if (on === 'keys') return fn(entry.key);
  if (on === 'values') return fn(entry.value);
  return fn(entry.key) || fn(entry.value);
}

export function filterByMatcher(
  entries: KvEntry[],
  on: FilterOn,
  matcher: FilterMatcher
): KvEntry[] {
  if (matcher.kind === 'substring') {
    return entries.filter((e) => applyMatch(e, on, (s) => matchSubstring(s, matcher.query, matcher.caseInsensitive)));
  }
  // matcher.kind === 'regex' — compile once via RE2 (linear-time, no catastrophic backtracking)
  const re = new RE2(matcher.pattern, matcher.flags);
  return entries.filter((e) => applyMatch(e, on, (s) => matchRegex(s, re)));
}
```

- [ ] **Step 3: Run tests.** Expect all passing.
- [ ] **Step 4: Run typecheck + lint.** `npm run typecheck -w packages/shared-validation && npm run lint -w packages/shared-validation`. Expect clean.
- [ ] **Step 5: Commit.**

```bash
git add packages/shared-validation/src/kv/filter.ts packages/shared-validation/src/kv/filter.test.ts packages/shared-validation/package.json packages/shared-validation/package-lock.json
git commit -m "feat(shared-validation): add filterByMatcher with on= and regex matcher via RE2"
```

---

## Phase 0c — Extract RAG search cores from route handlers

Goal: split `searchChunks.ts` and `hybridSearch.ts` so the pipeline pieces are pure functions returning paginated results, with the existing route handlers becoming thin wrappers. **No behavior change for the FE route.**

### Task 0c.1: Map the existing handlers

**Files:**
- Read: `packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts`
- Read: `packages/backend/src/routes/ragStores/ragFiles/hybridSearch.ts`

- [ ] **Step 1:** Read both. Identify: which functions touch `res`, which are already pure, which call which DB query. Record the parameter shape used by each (e.g. `SearchParams`, `tenantId`, etc.).

### Task 0c.2: Define canonical paginated result type

**Files:**
- Create: `packages/backend/src/rag/search/types.ts`

- [ ] **Step 1: Create the shared types file.**

```ts
// packages/backend/src/rag/search/types.ts
export interface PaginatedSearchResult {
  items: string[];     // chunk contents
  total: number;
  offset: number;
  limit: number;
  truncated?: true;
}

export interface SearchParams {
  storeId: string;
  tenantId: string;
  query: string;
  offset: number;
  limit: number;
}

export interface SemanticSearchParams extends SearchParams {
  minSimilarity: number;
}

export interface RegexSearchParams {
  storeId: string;
  tenantId: string;
  pattern: string;
  offset: number;
  limit: number;
}

export const MAX_OFFSET = 1000;

export function clampOffset(offset: number, limit: number): { offset: number; truncated: boolean } {
  if (offset + limit > MAX_OFFSET) return { offset: Math.max(0, MAX_OFFSET - limit), truncated: true };
  return { offset, truncated: false };
}
```

- [ ] **Step 2: Typecheck.** `npm run typecheck -w packages/backend`. Expect clean.
- [ ] **Step 3: Commit.**

```bash
git add packages/backend/src/rag/search/types.ts
git commit -m "feat(backend): add paginated RAG search result type + MAX_OFFSET clamp"
```

### Task 0c.3: Extract `runSimpleSearch` and `runSemanticSearch`

**Files:**
- Create: `packages/backend/src/rag/search/simple.ts`
- Create: `packages/backend/src/rag/search/semantic.ts`
- Modify: `packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts`

> **Important naming note.** The existing FE-facing route uses `mode: 'simple'`. Keep that contract intact. Core function is `runSimpleSearch`; the new RAG agent tool's enum value `'bm25'` is a more descriptive label for the LLM but maps to the same internal function (`bm25 → runSimpleSearch`). Do NOT rename the FE-facing string.

- [ ] **Step 1:** Move the existing "simple" / BM25 pipeline body from `searchChunks.ts` into `simple.ts` as `runSimpleSearch(supabase, params: SearchParams): Promise<PaginatedSearchResult>`. Apply `clampOffset` before the DB call. Compute `total` via the existing count path or a parallel `count` query — match what the existing handler did, do not invent new behavior.

```ts
// packages/backend/src/rag/search/simple.ts (skeleton — fill in by moving existing logic)
import type { SupabaseClient } from '@supabase/supabase-js';
import { searchByContent /* etc */ } from '../../db/queries/ragChunksQueries.js';
import { clampOffset, type PaginatedSearchResult, type SearchParams } from './types.js';

export async function runSimpleSearch(
  supabase: SupabaseClient,
  params: SearchParams
): Promise<PaginatedSearchResult> {
  const { offset, truncated } = clampOffset(params.offset, params.limit);
  // ... move existing logic from searchChunks.ts here, return shape:
  return { items, total, offset, limit: params.limit, ...(truncated ? { truncated: true as const } : {}) };
}
```

- [ ] **Step 2:** Same for `runSemanticSearch` in `semantic.ts` (takes `SemanticSearchParams`).
- [ ] **Step 3:** Rewrite `searchChunks.ts` as a thin wrapper: parse req, dispatch to `runSimpleSearch` or `runSemanticSearch` by mode (the FE mode string remains `'simple'`), write the response. No regex mode here.
- [ ] **Step 4: Manual verify.** Run `npm run dev -w packages/backend` (or whatever starts the API server) and exercise the FE RAG search box for both simple and semantic; results identical.
- [ ] **Step 5: Run check.** `npm run check`. Expect clean.
- [ ] **Step 6: Commit.**

```bash
git add packages/backend/src/rag/search/simple.ts packages/backend/src/rag/search/semantic.ts packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts
git commit -m "refactor(backend): extract simple + semantic search cores from route handler"
```

### Task 0c.4: Extract `runHybridSearch`

**Files:**
- Create: `packages/backend/src/rag/search/hybrid.ts`
- Modify: `packages/backend/src/routes/ragStores/ragFiles/hybridSearch.ts`

- [ ] **Step 1:** Move the hybrid pipeline body (currently `runHybridSearch` writing to `res`) into `hybrid.ts` as a pure function returning `PaginatedSearchResult`. Existing helpers (`runHybridPipeline`, `applyRerank`, `mergePoolsByScore`, etc.) move with it.
- [ ] **Step 2:** Rewrite `hybridSearch.ts` route handler as a thin wrapper.
- [ ] **Step 3:** Manual verify FE hybrid search.
- [ ] **Step 4:** `npm run check`. Commit.

```bash
git add packages/backend/src/rag/search/hybrid.ts packages/backend/src/routes/ragStores/ragFiles/hybridSearch.ts
git commit -m "refactor(backend): extract hybrid search core from route handler"
```

---

## Phase 1 — Migrations (write only; user applies)

### Task 1.0: Verify `agents.current_version` column exists

**Files:**
- Read: the migration that created the `agent_versions` versioning columns; the `agentQueries.ts` row type.

- [ ] **Step 1:** Run `grep -rn "current_version" packages/backend/src/db/` and `grep -rn "current_version" supabase/migrations/`. Confirm the column exists on `agents` with the type/semantics this plan assumes ("the version number of the latest published `agent_versions` row, or NULL if never published"). If the column has a different name (e.g. `published_version`, `latest_version`), update every later task's SQL to use the actual name. Stop and flag if the concept doesn't exist at all.
- [ ] **Step 2:** Note the resolved column name as a comment in your terminal scratchpad; it gets used in Migration 1.1's backfill, Task 2.5's reverse-lookup query, Migration 1.2 is unaffected, and Phase 6's snapshot read.

### Task 1.1: Write `20260617000000_agent_store_bindings_and_snapshots.sql`

**Files:**
- Create: `supabase/migrations/20260617000000_agent_store_bindings_and_snapshots.sql`

- [ ] **Step 1: Write the migration.**

```sql
-- 20260617000000_agent_store_bindings_and_snapshots.sql
-- Per-agent KV/RAG store bindings on agents (draft) and agent_versions (snapshot).
-- Also adds selected_tools snapshot to agent_versions to fix the tool-versioning bug.

ALTER TABLE agents
  ADD COLUMN selected_kv_store_id  UUID NULL REFERENCES kv_stores(id)  ON DELETE RESTRICT,
  ADD COLUMN selected_rag_store_id UUID NULL REFERENCES rag_stores(id) ON DELETE RESTRICT;

ALTER TABLE agent_versions
  ADD COLUMN selected_tools         JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN selected_kv_store_id   UUID NULL,
  ADD COLUMN selected_rag_store_id  UUID NULL;

CREATE INDEX idx_agents_selected_kv_store_id  ON agents (selected_kv_store_id) WHERE selected_kv_store_id IS NOT NULL;
CREATE INDEX idx_agents_selected_rag_store_id ON agents (selected_rag_store_id) WHERE selected_rag_store_id IS NOT NULL;
CREATE INDEX idx_agent_versions_selected_kv_store_id  ON agent_versions (selected_kv_store_id) WHERE selected_kv_store_id IS NOT NULL;
CREATE INDEX idx_agent_versions_selected_rag_store_id ON agent_versions (selected_rag_store_id) WHERE selected_rag_store_id IS NOT NULL;

-- Backfill: copy current agents.selected_tools into the LATEST published version row only.
-- Older historical versions keep the default '[]'::jsonb so a replay fails closed
-- rather than silently inheriting a different tool set than was live at publish time.
UPDATE agent_versions av
SET selected_tools = a.selected_tools
FROM agents a
WHERE av.agent_id = a.id
  AND av.version = a.current_version;
```

- [ ] **Step 2: Commit (do not apply).**

```bash
git add supabase/migrations/20260617000000_agent_store_bindings_and_snapshots.sql
git commit -m "feat(db): migration for agent store bindings + selected_tools snapshot column"
```

### Task 1.2: Write `20260617100000_rag_regex_search.sql`

**Files:**
- Create: `supabase/migrations/20260617100000_rag_regex_search.sql`

- [ ] **Step 1:** Look at the existing `20260512500000_rag_text_search_or_query.sql` to mirror its return-type shape and security-definer pattern. Note its `GRANT EXECUTE` line — this migration also rewrites that grant to lock it to `service_role` only.
- [ ] **Step 2: Write the migration.** Match `rag_text_search`'s return columns so callers downstream don't need to special-case the regex path. **Critical: `'500ms'` (not `'500'` — `set_config` interprets bare integers as seconds).**

```sql
-- 20260617100000_rag_regex_search.sql
-- POSIX regex search over rag_chunks with a 500ms statement timeout enforced inside
-- the SECURITY DEFINER function so concurrent malicious patterns can't exhaust the pool.
-- Locked to service_role only — the architecture rule says clients never touch the DB,
-- so authenticated/anon JWTs have no legitimate need to invoke this directly.

CREATE OR REPLACE FUNCTION rag_regex_search(
  p_store_id  UUID,
  p_tenant_id UUID,
  p_pattern   TEXT,
  p_offset    INT,
  p_limit     INT
) RETURNS TABLE (
  id          UUID,
  content     TEXT,
  page_number INT,
  rag_file_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '500ms', true);
  RETURN QUERY
    SELECT c.id, c.content, c.page_number, c.rag_file_id
    FROM rag_chunks c
    WHERE c.rag_store_id = p_store_id
      AND c.tenant_id    = p_tenant_id
      AND c.content ~ p_pattern
    ORDER BY c.id
    OFFSET p_offset
    LIMIT  p_limit;
END;
$$;

REVOKE ALL ON FUNCTION rag_regex_search(UUID, UUID, TEXT, INT, INT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION rag_regex_search(UUID, UUID, TEXT, INT, INT) TO service_role;

-- Also harden the existing rag_text_search: same architecture rule applies and it currently
-- accepts any authenticated caller, which is broader than necessary.
REVOKE ALL ON FUNCTION rag_text_search(UUID, UUID, TEXT, INT, INT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION rag_text_search(UUID, UUID, TEXT, INT, INT) TO service_role;
```

(Verify the `rag_text_search` argument signature in the existing migration before pasting the `REVOKE`/`GRANT` — adjust the type list to match exactly.)

- [ ] **Step 3: Commit.**

```bash
git add supabase/migrations/20260617100000_rag_regex_search.sql
git commit -m "feat(db): migration for rag_regex_search RPC with 500ms timeout"
```

### Task 1.2b: Write `20260617150000_kv_entries_trigram_indexes.sql`

**Files:**
- Create: `supabase/migrations/20260617150000_kv_entries_trigram_indexes.sql`

- [ ] **Step 1: Write the migration.** Substring search on `kv_entries.key` and `kv_entries.value` is now SQL-side via `ILIKE` (see Task 4.3a). Without these indexes a substring search scans the whole table per tenant — a tight agent loop becomes a tenant-level latency hit. Trigram GIN indexes accelerate `ILIKE '%q%'` patterns dramatically.

```sql
-- 20260617150000_kv_entries_trigram_indexes.sql
-- Trigram GIN indexes on kv_entries (key, value) to accelerate agent-tool substring search
-- via ILIKE. Skip equivalent index on rag_chunks.content — RAG substring is BM25/regex, not ILIKE.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_kv_entries_key_trgm
  ON kv_entries USING GIN (key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kv_entries_value_trgm
  ON kv_entries USING GIN (value gin_trgm_ops);
```

- [ ] **Step 2: Commit.**

```bash
git add supabase/migrations/20260617150000_kv_entries_trigram_indexes.sql
git commit -m "feat(db): pg_trgm GIN indexes on kv_entries.key/value for substring search"
```

### Task 1.3: Write `20260617200000_execution_key_tenant_scoping.sql`

**Files:**
- Create: `supabase/migrations/20260617200000_execution_key_tenant_scoping.sql`

- [ ] **Step 1:** Read the existing `execution_key_agents` table definition (find the migration that created it) so the policies mirror precisely.
- [ ] **Step 2: Write the migration.**

```sql
-- 20260617200000_execution_key_tenant_scoping.sql
-- Tenant scoping for execution keys, mirroring the existing all_agents + execution_key_agents pattern.

ALTER TABLE execution_keys
  ADD COLUMN all_tenants BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE execution_key_tenants (
  execution_key_id UUID NOT NULL REFERENCES execution_keys(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id)        ON DELETE CASCADE,
  PRIMARY KEY (execution_key_id, tenant_id)
);

CREATE INDEX idx_execution_key_tenants_tenant_id ON execution_key_tenants (tenant_id);

ALTER TABLE execution_key_tenants ENABLE ROW LEVEL SECURITY;

-- Mirror the org-membership pattern used for execution_key_agents.
-- (Adjust the policy body to match the actual execution_key_agents policy verbatim;
--  read the existing migration first and copy.)
CREATE POLICY "execution_key_tenants_select" ON execution_key_tenants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM execution_keys ek
      WHERE ek.id = execution_key_tenants.execution_key_id
        AND is_org_member(ek.org_id)
    )
  );

CREATE POLICY "execution_key_tenants_insert" ON execution_key_tenants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM execution_keys ek
      WHERE ek.id = execution_key_tenants.execution_key_id
        AND is_org_member(ek.org_id)
    )
  );

CREATE POLICY "execution_key_tenants_delete" ON execution_key_tenants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM execution_keys ek
      WHERE ek.id = execution_key_tenants.execution_key_id
        AND is_org_member(ek.org_id)
    )
  );
```

- [ ] **Step 3: Commit.**

```bash
git add supabase/migrations/20260617200000_execution_key_tenant_scoping.sql
git commit -m "feat(db): migration for execution key tenant scoping"
```

### Task 1.4: Notify the user

- [ ] **Step 1: Pause for user to apply the three migrations.** Send a message: "Migrations written. Please apply: `20260617000000`, `20260617100000`, `20260617200000`. I'll wait."

---

## Phase 2 — Backend foundations: ProviderCtx, ToolError, store-bindings endpoint

### Task 2.1: Add `ToolError` and update `ProviderCtx`

**Files:**
- Modify: `packages/api/src/providers/types.ts`

- [ ] **Step 1: Define the error class and codes.**

```ts
// packages/api/src/providers/types.ts (add to top of file)
export type ToolErrorCode =
  | 'no_store_bound'
  | 'protected_key'
  | 'key_too_long'
  | 'value_too_large'
  | 'invalid_pattern'
  | 'pattern_timeout'
  | 'tenant_not_allowed';

export class ToolError extends Error {
  public readonly code: ToolErrorCode;
  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ToolError';
  }
}
```

- [ ] **Step 2:** Add `tenantId: string` to the `ProviderCtx` interface (in `provider.ts` per recon — verify the exact file).
- [ ] **Step 3: Typecheck.** `npm run typecheck -w packages/api`. Expect new errors at `providerCtxFromContext.ts` (tenantId required but not supplied). Fix in next task.
- [ ] **Step 4: Do not commit yet** — wait for Task 2.2.

### Task 2.2: Forward `tenantID` in `providerCtxFromContext`

**Files:**
- Modify: `packages/api/src/core/providerCtxFromContext.ts`

- [ ] **Step 1: Read the file.** Identify where the `ProviderCtx` is built and where `Context.tenantID` is available.
- [ ] **Step 2: Add the field.** Wire `tenantId: ctx.tenantID` (or matching field name) into the returned `ProviderCtx`.
- [ ] **Step 3: Typecheck.** `npm run typecheck -w packages/api`. Expect clean.
- [ ] **Step 4: Commit.**

```bash
git add packages/api/src/providers/types.ts packages/api/src/providers/provider.ts packages/api/src/core/providerCtxFromContext.ts
git commit -m "feat(api): add ToolError with enum codes; forward tenantId onto ProviderCtx"
```

### Task 2.2b: Update `ProviderCtx` test fixtures

**Files:**
- Modify: every test that constructs a fake `ProviderCtx` (grep below)

- [ ] **Step 1:** Run `grep -rn "ProviderCtx\b" packages/api/src/` and `grep -rn ": ProviderCtx\|as ProviderCtx" packages/`. Every test that builds a fixture object literal or asserts `as ProviderCtx` needs to add `tenantId: 'test-tenant-id'` (or similar literal). The new field is required, but `as ProviderCtx` casts silently bypass the typecheck — manual sweep is required.
- [ ] **Step 2: Add the field everywhere.** Choose a stable literal like `'00000000-0000-0000-0000-000000000000'` for the test value.
- [ ] **Step 3: Typecheck + tests.** `npm run check`. Expect clean.
- [ ] **Step 4: Commit.**

```bash
git add packages/api/src/providers/__tests__/ packages/backend/src/...
git commit -m "chore(tests): add tenantId to ProviderCtx fixtures"
```

### Task 2.3: Define `KvStoreServices` and `RagStoreServices` interfaces

**Files:**
- Modify: `packages/api/src/providers/types.ts`

- [ ] **Step 1: Add the interfaces (keep them lean — only what the tools call).**

```ts
// packages/api/src/providers/types.ts
import type { PaginatedSearchResult } from '...'; // shared types? — if PaginatedSearchResult lives in backend, redefine the same shape here in packages/api (it has no Supabase dep)

export interface KvPagedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  truncated?: true;
}

export interface KvStoreServices {
  storeId: string;
  listKeys(tenantId: string, offset: number, limit: number): Promise<KvPagedResult<string>>;
  getValues(tenantId: string, keys: string[]): Promise<Record<string, string | null>>;
  searchSubstring(
    tenantId: string,
    on: 'keys' | 'values' | 'both',
    query: string,
    offset: number,
    limit: number
  ): Promise<KvPagedResult<{ key: string; value: string }>>;
  searchRegex(
    tenantId: string,
    on: 'keys' | 'values' | 'both',
    pattern: string,
    offset: number,
    limit: number
  ): Promise<KvPagedResult<{ key: string; value: string }>>;
  updateValue(tenantId: string, key: string, value: string): Promise<{ success: true }>;
}

export interface RagStoreServices {
  storeId: string;
  searchBm25(
    tenantId: string,
    query: string,
    offset: number,
    limit: number
  ): Promise<KvPagedResult<string>>;
  searchSemantic(
    tenantId: string,
    query: string,
    minSimilarity: number,
    offset: number,
    limit: number
  ): Promise<KvPagedResult<string>>;
  searchHybrid(
    tenantId: string,
    query: string,
    minSimilarity: number,
    offset: number,
    limit: number
  ): Promise<KvPagedResult<string>>;
  searchRegex(
    tenantId: string,
    pattern: string,
    offset: number,
    limit: number
  ): Promise<KvPagedResult<string>>;
}

export function isKvStoreServices(v: unknown): v is KvStoreServices {
  return (
    typeof v === 'object' && v !== null &&
    'storeId' in v && typeof (v as { storeId: unknown }).storeId === 'string' &&
    'listKeys' in v && typeof (v as { listKeys: unknown }).listKeys === 'function'
  );
}

export function isRagStoreServices(v: unknown): v is RagStoreServices {
  return (
    typeof v === 'object' && v !== null &&
    'storeId' in v && typeof (v as { storeId: unknown }).storeId === 'string' &&
    'searchBm25' in v && typeof (v as { searchBm25: unknown }).searchBm25 === 'function'
  );
}
```

- [ ] **Step 2: Typecheck.** Expect clean.
- [ ] **Step 3: Commit.**

```bash
git add packages/api/src/providers/types.ts
git commit -m "feat(api): add KvStoreServices and RagStoreServices interfaces with type guards"
```

### Task 2.4: Observability wrapping in `toAiSdkTool`

**Files:**
- Modify: `packages/api/src/providers/types.ts` (find the `toAiSdkTool*` adapters)

- [ ] **Step 1: Read the existing adapter.** Note exactly how `execute` is wrapped.
- [ ] **Step 2: Add a structured log on every tool call.** Use the existing logger if `ctx.logger` is available; otherwise add a structured `process.stdout.write` with namespace `[tool]` capturing `{ providerId, toolName, durationMs, ok, errorCode? }`. Do NOT log inputs or outputs.

```ts
// Inside toAiSdkTool* (sketch)
const start = Date.now();
try {
  const result = await opts.execute(input, ctx);
  process.stdout.write(`[tool] ${providerId}/${toolName} ok ms=${Date.now() - start}\n`);
  return result;
} catch (err) {
  const code = err instanceof ToolError ? err.code : 'unknown';
  process.stdout.write(`[tool] ${providerId}/${toolName} fail ms=${Date.now() - start} code=${code}\n`);
  throw err;
}
```

- [ ] **Step 3: Typecheck.** Clean.
- [ ] **Step 4: Commit.**

```bash
git add packages/api/src/providers/types.ts
git commit -m "feat(api): instrument toAiSdkTool with per-call timing + error code"
```

### Task 2.5: Add `agentStoreBindingsQueries.ts`

**Files:**
- Create: `packages/backend/src/db/queries/agentStoreBindingsQueries.ts`

- [ ] **Step 1: Define the query functions.**

```ts
// packages/backend/src/db/queries/agentStoreBindingsQueries.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AgentStoreBindings {
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
  updatedAt: string;
}

export async function getAgentStoreBindings(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ result: AgentStoreBindings | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agents')
    .select('selected_kv_store_id, selected_rag_store_id, updated_at')
    .eq('id', agentId)
    .maybeSingle();
  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  return {
    result: {
      selectedKvStoreId: data.selected_kv_store_id,
      selectedRagStoreId: data.selected_rag_store_id,
      updatedAt: data.updated_at,
    },
    error: null,
  };
}

export async function updateAgentStoreBindingsWithPrecondition(
  supabase: SupabaseClient,
  agentId: string,
  expectedUpdatedAt: string,
  patch: { selectedKvStoreId: string | null; selectedRagStoreId: string | null }
): Promise<{ result: AgentStoreBindings | null; error: string | null; conflict: boolean }> {
  // updated_at MUST be set explicitly. Without it, downstream save flows reading
  // updated_at as the optimistic-concurrency token see a stale value and can
  // mask lost writes. Mirrors selectedToolsOperations.ts.
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('agents')
    .update({
      selected_kv_store_id: patch.selectedKvStoreId,
      selected_rag_store_id: patch.selectedRagStoreId,
      updated_at: nowIso,
    })
    .eq('id', agentId)
    .eq('updated_at', expectedUpdatedAt)
    .select('selected_kv_store_id, selected_rag_store_id, updated_at')
    .maybeSingle();
  if (error !== null) return { result: null, error: error.message, conflict: false };
  if (data === null) return { result: null, error: null, conflict: true };
  return {
    result: {
      selectedKvStoreId: data.selected_kv_store_id,
      selectedRagStoreId: data.selected_rag_store_id,
      updatedAt: data.updated_at,
    },
    error: null,
    conflict: false,
  };
}

export interface AgentRef {
  id: string;
  slug: string;
  name: string;
}

async function findDraftAgentsByColumn(
  supabase: SupabaseClient,
  orgId: string,
  storeId: string,
  column: 'selected_kv_store_id' | 'selected_rag_store_id'
): Promise<{ rows: AgentRef[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agents')
    .select('id, slug, name')
    .eq('org_id', orgId)
    .eq(column, storeId);
  if (error !== null) return { rows: [], error: error.message };
  return { rows: (data ?? []) as AgentRef[], error: null };
}

async function findPublishedAgentsByColumn(
  supabase: SupabaseClient,
  orgId: string,
  storeId: string,
  column: 'selected_kv_store_id' | 'selected_rag_store_id'
): Promise<{ rows: AgentRef[]; error: string | null }> {
  // Latest-published only: join agent_versions on a.current_version. Org-scoped on both sides.
  // (If Task 1.0 surfaced a different column name than `current_version`, substitute here.)
  const { data, error } = await supabase.rpc('find_agents_by_published_store', {
    p_org_id: orgId,
    p_store_id: storeId,
    p_column:  column,
  });
  // RPC option: write a small SQL function (define in a new migration if you prefer).
  // Inline option: two-step — fetch agents in org with current_version set, then fetch
  // agent_versions rows matching the column, join in JS. Inline is simpler and avoids a
  // new migration. Pick the inline option:
  if (error !== null) return { rows: [], error: error.message };
  return { rows: (data ?? []) as AgentRef[], error: null };
}

export async function findAgentsByKvStore(
  supabase: SupabaseClient,
  orgId: string,
  storeId: string
): Promise<{ draft: AgentRef[]; published: AgentRef[]; error: string | null }> {
  const [draft, published] = await Promise.all([
    findDraftAgentsByColumn(supabase, orgId, storeId, 'selected_kv_store_id'),
    findPublishedAgentsByColumn(supabase, orgId, storeId, 'selected_kv_store_id'),
  ]);
  const err = draft.error ?? published.error;
  if (err !== null) return { draft: [], published: [], error: err };
  return { draft: draft.rows, published: published.rows, error: null };
}

export async function findAgentsByRagStore(
  supabase: SupabaseClient,
  orgId: string,
  storeId: string
): Promise<{ draft: AgentRef[]; published: AgentRef[]; error: string | null }> {
  const [draft, published] = await Promise.all([
    findDraftAgentsByColumn(supabase, orgId, storeId, 'selected_rag_store_id'),
    findPublishedAgentsByColumn(supabase, orgId, storeId, 'selected_rag_store_id'),
  ]);
  const err = draft.error ?? published.error;
  if (err !== null) return { draft: [], published: [], error: err };
  return { draft: draft.rows, published: published.rows, error: null };
}
```

**On the RPC vs inline-JOIN choice for `findPublishedAgentsByColumn`:** the inline JS approach avoids a new SQL function. The sketch above shows an RPC call; if you go inline, fetch `agents` filtered by `org_id` + `current_version IS NOT NULL`, then `agent_versions` filtered by the column, and join in JS. Whichever you pick, the query MUST enforce `agents.org_id = orgId` and the `agent_versions` row must belong to that agent — never trust the `storeId` alone.

- [ ] **Step 2: Add Jest tests.** Mirror the pattern in `ragStoresQueries.test.ts`. Cover: draft-only match, published-only match, both, neither, cross-org request returns empty arrays, updated_at is bumped on every successful binding write.
- [ ] **Step 3: Run tests + typecheck.**
- [ ] **Step 4: Commit.**

```bash
git add packages/backend/src/db/queries/agentStoreBindingsQueries.ts packages/backend/src/db/queries/agentStoreBindingsQueries.test.ts
git commit -m "feat(backend): add agent store-binding queries with org-scoped reverse lookup"
```

### Task 2.6: PATCH `/agents/:agentId/store-bindings` route

**Files:**
- Create: `packages/backend/src/routes/agents/updateStoreBindings.ts`
- Modify: `packages/backend/src/routes/agents/agentRouter.ts`

- [ ] **Step 1: Read the existing PATCH selected-tools handler** for the optimistic-concurrency error shape, rate limiter wiring, and Zod input validation. Copy the structure.
- [ ] **Step 2: Implement the route.**

```ts
// packages/backend/src/routes/agents/updateStoreBindings.ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getKvStoreById } from '../../db/queries/kvStoresQueries.js';
import { getRagStoreById } from '../../db/queries/ragStoresQueries.js';
import {
  getAgentStoreBindings,
  updateAgentStoreBindingsWithPrecondition,
} from '../../db/queries/agentStoreBindingsQueries.js';
import { getAgentById } from '../../db/queries/agentQueries.js';

const BodySchema = z.object({
  expectedUpdatedAt: z.string(),
  selectedKvStoreId: z.string().uuid().nullable(),
  selectedRagStoreId: z.string().uuid().nullable(),
});

export async function handleUpdateStoreBindings(req: Request, res: Response): Promise<void> {
  // Parse body, get supabase client (mirror existing handler).
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }
  const agentId = req.params.agentId;
  const body = parsed.data;
  const supabase = /* ... existing pattern */;

  const agentRes = await getAgentById(supabase, agentId);
  if (agentRes.result === null) { res.status(404).end(); return; }
  const agent = agentRes.result;

  if (body.selectedKvStoreId !== null) {
    const kv = await getKvStoreById(supabase, body.selectedKvStoreId);
    if (kv.result === null || kv.result.orgId !== agent.orgId) {
      res.status(403).json({ error: 'store_org_mismatch' });
      return;
    }
  }
  if (body.selectedRagStoreId !== null) {
    const rag = await getRagStoreById(supabase, body.selectedRagStoreId);
    if (rag.result === null || rag.result.orgId !== agent.orgId) {
      res.status(403).json({ error: 'store_org_mismatch' });
      return;
    }
  }

  const updated = await updateAgentStoreBindingsWithPrecondition(
    supabase,
    agentId,
    body.expectedUpdatedAt,
    { selectedKvStoreId: body.selectedKvStoreId, selectedRagStoreId: body.selectedRagStoreId }
  );
  if (updated.conflict) { res.status(409).json({ error: 'conflict' }); return; }
  if (updated.error !== null) { res.status(500).json({ error: updated.error }); return; }
  res.status(200).json(updated.result);
}
```

- [ ] **Step 3: Wire in `agentRouter.ts`.** Add `router.patch('/:agentId/store-bindings', storeBindingsLimiter, handleUpdateStoreBindings)`. Do NOT share `selectedToolsLimiter` — a noisy FE writing both endpoints would deplete the shared bucket and lock teammates out of tool toggles. Create `storeBindingsLimiter` in the same file as `selectedToolsLimiter` (mirror its construction: same window, same per-org keying, dedicated instance).
- [ ] **Step 4: Typecheck + lint.**
- [ ] **Step 5: Commit.**

```bash
git add packages/backend/src/routes/agents/updateStoreBindings.ts packages/backend/src/routes/agents/agentRouter.ts
git commit -m "feat(backend): PATCH /agents/:id/store-bindings with org guard + optimistic concurrency"
```

---

## Phase 3 — Execution key tenant scoping (can ship independently)

### Task 3.1: Read existing pattern

**Files:**
- Read: `packages/backend/src/db/queries/executionKeyQueries.ts`
- Read: `packages/backend/src/db/queries/executionKeyMutations.ts`
- Read: `packages/backend/src/routes/execute/originGuard.ts`

- [ ] **Step 1:** Note exactly how `all_agents` + `execution_key_agents` is wired across these three files. The tenant-scoping change mirrors it line-for-line.

### Task 3.2: Extend queries to read tenant scope

**Files:**
- Modify: `packages/backend/src/db/queries/executionKeyQueries.ts`
- Create: `packages/backend/src/db/queries/executionKeyTenantsQueries.ts`

- [ ] **Step 1: Add `all_tenants` to the SELECT list and the row type.**

```ts
// in executionKeyQueries.ts
export interface ExecutionKeyRow {
  // ... existing fields
  all_agents: boolean;
  all_tenants: boolean;     // new
}

const SELECT = 'id, org_id, name, key_prefix, all_agents, all_tenants, expires_at, created_at, last_used_at';
```

- [ ] **Step 2: Add `getExecutionKeyTenants(executionKeyId): Promise<string[]>` in `executionKeyTenantsQueries.ts`.** Mirror the agent-scope read.
- [ ] **Step 3: Typecheck + commit.**

```bash
git add packages/backend/src/db/queries/executionKeyQueries.ts packages/backend/src/db/queries/executionKeyTenantsQueries.ts
git commit -m "feat(backend): read all_tenants + scoped tenants from execution keys"
```

### Task 3.3: Extend mutations to write tenant scope

**Files:**
- Modify: `packages/backend/src/db/queries/executionKeyMutations.ts`
- Modify: `packages/backend/src/db/queries/executionKeyTenantsQueries.ts`

- [ ] **Step 1: Add `allTenants: boolean` and `tenantIds: string[]` to create/update input types.**
- [ ] **Step 2: In the create + update functions, mirror the `if (!input.allAgents)` block: when `!allTenants`, insert into `execution_key_tenants`.**
- [ ] **Step 3: Add `replaceExecutionKeyTenants(executionKeyId, tenantIds)` in `executionKeyTenantsQueries.ts`.** Delete-then-insert pattern.
- [ ] **Step 4: Typecheck + commit.**

```bash
git add packages/backend/src/db/queries/executionKeyMutations.ts packages/backend/src/db/queries/executionKeyTenantsQueries.ts
git commit -m "feat(backend): write all_tenants + scoped tenants on execution key create/update"
```

### Task 3.4: Channel-agnostic tenant-scope guard

> **Important.** The existing `originGuard.ts` only runs when `channel === 'web'`. Putting the tenant-scope check there means `api`, `widget`, and `edge` channels bypass it entirely — the inverse of what we want. This task hoists the tenant lookup AND the new tenant-scope check into a channel-agnostic guard that runs for every channel.

**Files:**
- Create: `packages/backend/src/routes/execute/enforceTenantScope.ts`
- Modify: `packages/backend/src/routes/execute/executeHandler.ts` (and any other channel handlers — check `parseRequest` and any per-channel branching)
- Modify: `packages/backend/src/routes/execute/originGuard.ts` (now just origin check, no tenant lookup)

- [ ] **Step 1: Read the call sites.** `grep -rn "enforceOriginIfWebChannel\|originGuard" packages/backend/src/routes/execute/`. Identify where each channel's request handling looks up the tenant today (likely inside `originGuard` for web; potentially nowhere for the other channels). Note the auth principal type for each channel (execution key, JWT, etc.) so the new guard can read it uniformly.
- [ ] **Step 2: Create `enforceTenantScope.ts`.** Channel-agnostic. Inputs: supabase client, execution key row, body tenant id. Returns `{ ok: true; tenant: Tenant } | { ok: false; status: number; error: string }`.

```ts
// packages/backend/src/routes/execute/enforceTenantScope.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getExecutionKeyTenants } from '../../db/queries/executionKeyTenantsQueries.js';

export interface TenantScopeArgs {
  supabase: SupabaseClient;
  executionKey: { id: string; org_id: string; all_tenants: boolean };
  bodyTenantId: string;
  lookupTenant: (id: string) => Promise<{ org_id: string } | null>;
}

export interface TenantScopeOk { ok: true; tenant: { id: string; org_id: string }; }
export interface TenantScopeFail { ok: false; status: number; error: string; }

export async function enforceTenantScope(args: TenantScopeArgs): Promise<TenantScopeOk | TenantScopeFail> {
  if (args.bodyTenantId === '') return { ok: false, status: 400, error: 'tenantId is required' };
  const tenant = await args.lookupTenant(args.bodyTenantId);
  if (tenant === null) return { ok: false, status: 404, error: 'tenant not found' };
  if (tenant.org_id !== args.executionKey.org_id) {
    return { ok: false, status: 403, error: 'tenant_org_mismatch' };
  }
  if (!args.executionKey.all_tenants) {
    const allowed = await getExecutionKeyTenants(args.supabase, args.executionKey.id);
    if (!allowed.includes(args.bodyTenantId)) {
      return { ok: false, status: 403, error: 'tenant_not_allowed' };
    }
  }
  return { ok: true, tenant: { id: args.bodyTenantId, org_id: tenant.org_id } };
}
```

- [ ] **Step 3: Invoke `enforceTenantScope` from every channel handler.** Wire it into `executeHandler.ts` right after authentication / execution-key load resolves, BEFORE channel-specific branching. Confirm the call site for every channel by reading `parseRequest` and channel handlers.
- [ ] **Step 4: Trim `originGuard.ts`** so it only handles the web-specific `Origin` / `Referer` check. The tenant lookup currently in `originGuard` moves to the new guard.
- [ ] **Step 5: Write a Jest test for `enforceTenantScope`.** Cases: `all_tenants=true` passes; tenant org mismatch returns 403; `all_tenants=false` + tenant in allowlist passes; `all_tenants=false` + tenant not in allowlist returns 403 `tenant_not_allowed`; tenant not found returns 404.
- [ ] **Step 6: Run tests + typecheck.**
- [ ] **Step 7: Manual verify per channel.** Issue a tenant-scoped key; hit each channel (web, api, widget, edge) with an allowed tenant (200) and a disallowed tenant (403).
- [ ] **Step 8: Commit.**

```bash
git add packages/backend/src/routes/execute/enforceTenantScope.ts packages/backend/src/routes/execute/originGuard.ts packages/backend/src/routes/execute/executeHandler.ts packages/backend/src/routes/execute/enforceTenantScope.test.ts
git commit -m "feat(backend): channel-agnostic tenant-scope guard for execution keys"
```

### Task 3.5: FE execution-key dialog — tenant scope UI

**Files:**
- Locate the existing execution-keys dialog (likely under `packages/web/app/orgs/[slug]/(dashboard)/...`); modify it.

- [ ] **Step 1: Find it.** `grep -rln "allAgents\|all_agents" packages/web/app/`. The dialog component that issues/edits keys.
- [ ] **Step 2: Mirror the agent-scope UI for tenants.** Multi-select with an "All tenants" toggle. Reuse the existing "All agents" warning component for "All tenants" (same copy approach, different label).
- [ ] **Step 3: Add a tenants badge to the key list row.** "tenants: N" or "all tenants".
- [ ] **Step 4: Wire the server action.** Mirror whatever action the existing dialog uses for agents.
- [ ] **Step 5: i18n keys** (defer the full add to Phase 11; for now, hardcode strings or add the keys provisionally).
- [ ] **Step 6: Manual verify.** Issue a tenant-scoped key, invoke an agent against the right tenant (works) and against another tenant (fails 403).
- [ ] **Step 7: Commit.**

```bash
git add packages/web/app/...
git commit -m "feat(web): tenant scoping UI in execution key dialog"
```

---

## Phase 4 — RAG regex core + KV/RAG providers + services + observability + execute wiring

### Task 4.1: Add `searchByRegex` query in `ragChunksQueries.ts`

**Files:**
- Modify: `packages/backend/src/db/queries/ragChunksQueries.ts`

- [ ] **Step 1: Add the wrapper around the new RPC.**

```ts
// Postgres SQLSTATE for query_canceled (statement_timeout fires this).
const PG_STATEMENT_TIMEOUT = '57014';

export async function searchByRegex(
  supabase: SupabaseClient,
  storeId: string,
  tenantId: string,
  pattern: string,
  offset: number,
  limit: number
): Promise<{ result: RagChunkRow[]; total: number; error: string | null; timedOut: boolean }> {
  const { data, error } = await supabase.rpc('rag_regex_search', {
    p_store_id: storeId,
    p_tenant_id: tenantId,
    p_pattern: pattern,
    p_offset: offset,
    p_limit: limit,
  });
  if (error !== null) {
    // Supabase exposes Postgres error code on the error object as .code.
    if (error.code === PG_STATEMENT_TIMEOUT) {
      return { result: [], total: 0, error: null, timedOut: true };
    }
    return { result: [], total: 0, error: error.message, timedOut: false };
  }
  // Total is not returned by the RPC; without a COUNT it equals the page size returned.
  return { result: data ?? [], total: data?.length ?? 0, error: null, timedOut: false };
}
```

- [ ] **Step 2: Commit.**

```bash
git add packages/backend/src/db/queries/ragChunksQueries.ts
git commit -m "feat(backend): add searchByRegex query wrapping rag_regex_search RPC"
```

### Task 4.2: Add `runRegexSearch` core

**Files:**
- Create: `packages/backend/src/rag/search/regex.ts`

- [ ] **Step 1: Implement.** Pre-validate the pattern via RE2 in Node before the RPC; RE2 rejects most catastrophic patterns instantly, so the Postgres timeout only catches patterns that pass RE2's compile but still blow up under POSIX semantics.

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import RE2 from 're2';
import { searchByRegex } from '../../db/queries/ragChunksQueries.js';
import { ToolError } from '@daviddh/llm-graph-runner';
import { clampOffset, type PaginatedSearchResult, type RegexSearchParams } from './types.js';

const MAX_PATTERN_LENGTH = 1024;

function preValidatePattern(pattern: string): void {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new ToolError('invalid_pattern', `Pattern exceeds ${MAX_PATTERN_LENGTH} chars`);
  }
  try {
    // Compile-only check. RE2 is linear-time; if it rejects, the pattern is malformed
    // or uses backtracking-only constructs that POSIX would also struggle with.
    new RE2(pattern);
  } catch (err) {
    throw new ToolError('invalid_pattern', err instanceof Error ? err.message : 'invalid regex');
  }
}

export async function runRegexSearch(
  supabase: SupabaseClient,
  params: RegexSearchParams
): Promise<PaginatedSearchResult> {
  preValidatePattern(params.pattern);
  const { offset, truncated } = clampOffset(params.offset, params.limit);
  const res = await searchByRegex(
    supabase, params.storeId, params.tenantId, params.pattern, offset, params.limit
  );
  if (res.timedOut) throw new ToolError('pattern_timeout', 'Regex pattern timed out (500ms)');
  if (res.error !== null) throw new ToolError('invalid_pattern', res.error);
  return {
    items: res.result.map((r) => r.content),
    total: res.total,
    offset,
    limit: params.limit,
    ...(truncated ? { truncated: true as const } : {}),
  };
}
```

- [ ] **Step 2: Jest test.** Mock the supabase client. Cases: success returns paginated result; timeout error path; invalid pattern error path.
- [ ] **Step 3: Commit.**

```bash
git add packages/backend/src/rag/search/regex.ts packages/backend/src/rag/search/regex.test.ts
git commit -m "feat(backend): add runRegexSearch core with ToolError mapping"
```

### Task 4.3: Implement `KvStoreService`

**Files:**
- Create: `packages/backend/src/services/kvStoreService.ts`

- [ ] **Step 1a: Add the missing KV queries** in `packages/backend/src/db/queries/kvEntriesQueries.ts`:
  - `listKeys(storeId, tenantId, offset, limit) → { keys: string[]; total: number }`
  - `getByKeys(storeId, tenantId, keys) → Record<string, string | null>`
  - `searchEntriesIlike(storeId, tenantId, on, query, offset, limit) → { entries: { key, value }[]; total: number }` — **SQL-side** substring via `ILIKE '%q%'` (the pg_trgm index from Migration 1.2b makes this fast). Always paginates at the DB.
  - `getEntriesForRegex(storeId, tenantId, maxRows) → { entries; truncated: boolean }` — bounded read for in-memory regex; if total exceeds `maxRows`, returns first `maxRows` + `truncated: true`.
  - `updateValueQuery(storeId, tenantId, key, value) → { error }` — explicit upsert.

Reference shapes (sketch — adapt to existing query style in the file):

```ts
// searchEntriesIlike — substring search at the DB
const escaped = query.replace(/[\\%_]/g, (m) => '\\' + m);
const pattern = `%${escaped}%`;
let q = supabase
  .from('kv_entries')
  .select('key, value', { count: 'exact' })
  .eq('kv_store_id', storeId)
  .eq('tenant_id', tenantId)
  .range(offset, offset + limit - 1)
  .order('key');
if (on === 'keys') q = q.ilike('key', pattern);
else if (on === 'values') q = q.ilike('value', pattern);
else q = q.or(`key.ilike.${pattern},value.ilike.${pattern}`); // 'both'

// updateValueQuery — explicit upsert
const { error } = await supabase
  .from('kv_entries')
  .upsert(
    { kv_store_id: storeId, tenant_id: tenantId, key, value },
    { onConflict: 'kv_store_id,tenant_id,key' }
  );
```

- [ ] **Step 1b: Commit the queries.**

```bash
git add packages/backend/src/db/queries/kvEntriesQueries.ts
git commit -m "feat(backend): KV queries — listKeys, getByKeys, searchEntriesIlike (pg_trgm), updateValueQuery"
```

- [ ] **Step 2a: Implement helper functions and constants.** Each tool method gets a top-level helper to stay under `max-lines-per-function: 40`.

```ts
// packages/backend/src/services/kvStoreService.ts
import { filterByMatcher } from '@openflow/shared-validation';
import { ToolError, type KvStoreServices } from '@daviddh/llm-graph-runner';
import {
  getEntriesForRegex,
  getByKeys,
  listKeys as listKeysQuery,
  searchEntriesIlike,
  updateValueQuery,
} from '../db/queries/kvEntriesQueries.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const PROTECTED_PREFIX = '_sys.';
const KEY_MAX_BYTES = 256;
const VALUE_MAX_BYTES = 256 * 1024;
const KV_REGEX_MAX_ROWS = 10_000;
const KV_REGEX_MAX_PATTERN_LENGTH = 1024;

function byteLen(s: string): number { return Buffer.byteLength(s, 'utf8'); }

// Case-insensitive check so `_SYS.foo` / `_Sys.bar` can't bypass the protected namespace.
function isProtectedKey(key: string): boolean {
  return key.toLowerCase().startsWith(PROTECTED_PREFIX);
}

function assertWriteable(key: string, value: string): void {
  if (isProtectedKey(key)) {
    throw new ToolError('protected_key', `keys starting with "${PROTECTED_PREFIX}" are read-only to agents`);
  }
  if (byteLen(key) > KEY_MAX_BYTES) {
    throw new ToolError('key_too_long', `key exceeds ${KEY_MAX_BYTES} bytes`);
  }
  if (byteLen(value) > VALUE_MAX_BYTES) {
    throw new ToolError('value_too_large', `value exceeds ${VALUE_MAX_BYTES} bytes`);
  }
}
```

- [ ] **Step 2b: Implement each tool method as a top-level helper.**

```ts
async function listKeysImpl(supabase: SupabaseClient, storeId: string, tenantId: string, offset: number, limit: number) {
  const res = await listKeysQuery(supabase, storeId, tenantId, offset, limit);
  return { items: res.keys, total: res.total, offset, limit };
}

async function getValuesImpl(supabase: SupabaseClient, storeId: string, tenantId: string, keys: string[]) {
  return getByKeys(supabase, storeId, tenantId, keys);
}

async function searchSubstringImpl(
  supabase: SupabaseClient, storeId: string, tenantId: string,
  on: 'keys' | 'values' | 'both', query: string, offset: number, limit: number
) {
  const res = await searchEntriesIlike(supabase, storeId, tenantId, on, query, offset, limit);
  return { items: res.entries, total: res.total, offset, limit };
}

async function searchRegexImpl(
  supabase: SupabaseClient, storeId: string, tenantId: string,
  on: 'keys' | 'values' | 'both', pattern: string, offset: number, limit: number
) {
  if (pattern.length > KV_REGEX_MAX_PATTERN_LENGTH) {
    throw new ToolError('invalid_pattern', `pattern exceeds ${KV_REGEX_MAX_PATTERN_LENGTH} chars`);
  }
  const fetched = await getEntriesForRegex(supabase, storeId, tenantId, KV_REGEX_MAX_ROWS);
  let filtered: { key: string; value: string }[];
  try {
    filtered = filterByMatcher(fetched.entries, on, { kind: 'regex', pattern, flags: '' });
  } catch (err) {
    throw new ToolError('invalid_pattern', err instanceof Error ? err.message : 'invalid regex');
  }
  const slice = filtered.slice(offset, offset + limit);
  return {
    items: slice,
    total: filtered.length,
    offset,
    limit,
    ...(fetched.truncated ? { truncated: true as const } : {}),
  };
}

async function updateValueImpl(supabase: SupabaseClient, storeId: string, tenantId: string, key: string, value: string) {
  assertWriteable(key, value);
  const { error } = await updateValueQuery(supabase, storeId, tenantId, key, value);
  if (error !== null) throw new Error(error);
  return { success: true as const };
}
```

- [ ] **Step 2c: The factory is a thin bind.**

```ts
export function makeKvStoreService(supabase: SupabaseClient, storeId: string): KvStoreServices {
  return {
    storeId,
    listKeys: (tenantId, offset, limit) => listKeysImpl(supabase, storeId, tenantId, offset, limit),
    getValues: (tenantId, keys) => getValuesImpl(supabase, storeId, tenantId, keys),
    searchSubstring: (tenantId, on, query, offset, limit) =>
      searchSubstringImpl(supabase, storeId, tenantId, on, query, offset, limit),
    searchRegex: (tenantId, on, pattern, offset, limit) =>
      searchRegexImpl(supabase, storeId, tenantId, on, pattern, offset, limit),
    updateValue: (tenantId, key, value) => updateValueImpl(supabase, storeId, tenantId, key, value),
  };
}
```

- [ ] **Step 3: Jest test.** Mock supabase. Cover: `_sys.` rejection (lowercase AND uppercase variants), size caps (key + value), substring goes through `searchEntriesIlike` (no in-memory fetch), regex above row cap returns `truncated: true`, regex pattern length cap, happy path through each method.
- [ ] **Step 4: Commit.**

```bash
git add packages/backend/src/services/kvStoreService.ts packages/backend/src/services/kvStoreService.test.ts packages/backend/src/db/queries/kvEntriesQueries.ts
git commit -m "feat(backend): KvStoreService with _sys. protection + size caps"
```

### Task 4.4: Implement `RagStoreService`

**Files:**
- Create: `packages/backend/src/services/ragStoreService.ts`

- [ ] **Step 1: Implement.**

```ts
import { runSimpleSearch } from '../rag/search/simple.js';
import { runSemanticSearch } from '../rag/search/semantic.js';
import { runHybridSearch } from '../rag/search/hybrid.js';
import { runRegexSearch } from '../rag/search/regex.js';

export function makeRagStoreService(supabase: SupabaseClient, storeId: string): RagStoreServices {
  return {
    storeId,
    // The 'bm25' agent-tool mode maps to the existing 'simple' FE mode and runSimpleSearch.
    searchBm25: (tenantId, query, offset, limit) =>
      runSimpleSearch(supabase, { storeId, tenantId, query, offset, limit }).then(toApiShape),
    searchSemantic: (tenantId, query, minSimilarity, offset, limit) =>
      runSemanticSearch(supabase, { storeId, tenantId, query, minSimilarity, offset, limit }).then(toApiShape),
    searchHybrid: (tenantId, query, minSimilarity, offset, limit) =>
      runHybridSearch(supabase, { storeId, tenantId, query, minSimilarity, offset, limit }).then(toApiShape),
    searchRegex: (tenantId, pattern, offset, limit) =>
      runRegexSearch(supabase, { storeId, tenantId, pattern, offset, limit }).then(toApiShape),
  };
}

function toApiShape(p: PaginatedSearchResult): KvPagedResult<string> {
  return p; // shapes are identical
}
```

- [ ] **Step 2: Jest test.** Mock the four cores; verify dispatch.
- [ ] **Step 3: Commit.**

```bash
git add packages/backend/src/services/ragStoreService.ts packages/backend/src/services/ragStoreService.test.ts
git commit -m "feat(backend): RagStoreService dispatching to extracted search cores"
```

### Task 4.5: No-store-bound sentinel

**Files:**
- Create: `packages/backend/src/services/noStoreBoundServices.ts`

- [ ] **Step 1: Implement.** Returns a `KvStoreServices` (or `RagStoreServices`) where every method throws `ToolError('no_store_bound', ...)`.

```ts
import { ToolError } from '@daviddh/llm-graph-runner';

export function makeNoStoreBoundKvServices(): KvStoreServices {
  const fail = (): never => { throw new ToolError('no_store_bound', 'No KV store bound to this agent.'); };
  return {
    storeId: '',
    listKeys: fail as never,
    getValues: fail as never,
    searchSubstring: fail as never,
    searchRegex: fail as never,
    updateValue: fail as never,
  };
}

export function makeNoStoreBoundRagServices(): RagStoreServices {
  // ... same pattern
}
```

- [ ] **Step 2: Commit.**

```bash
git add packages/backend/src/services/noStoreBoundServices.ts
git commit -m "feat(backend): no_store_bound sentinel services that throw on every method"
```

### Task 4.6: Build the KV provider

**Files:**
- Create: `packages/api/src/providers/kv_store/index.ts`
- Create: `packages/api/src/providers/kv_store/buildTools.ts`
- Create: `packages/api/src/providers/kv_store/descriptors.ts`

- [ ] **Step 1: Read the calendar provider** (`packages/api/src/providers/calendar/`) end-to-end. Mirror its structure exactly.
- [ ] **Step 2: Write `descriptors.ts`** — Zod schemas with size caps. The caps stop a runaway agent from passing 100k keys in one call or a 100 KB regex pattern. Descriptions teach the LLM what to expect.

```ts
import { z } from 'zod';

const MAX_GET_KEYS = 100;
const MAX_REGEX_PATTERN = 1024;
const MAX_QUERY = 2048;

export const listKeysInput = z.object({
  offset: z.number().int().min(0).optional().describe('Page offset; default 0'),
  limit: z.number().int().min(1).max(500).optional().describe('Items per page; default 100, max 500'),
});

export const getValuesInput = z.object({
  keys: z.array(z.string().max(256))
    .min(1).max(MAX_GET_KEYS)
    .describe(`Keys to fetch (max ${MAX_GET_KEYS} per call). Missing keys return null.`),
});

// Two enums combined so we can apply the length cap conditionally via superRefine.
export const searchInput = z.object({
  on: z.enum(['keys', 'values', 'both']).describe('Whether to match against keys, values, or both.'),
  mode: z.enum(['substring', 'regex']).describe(
    'substring: case-insensitive substring match (DB-side via ILIKE + pg_trgm). ' +
    'regex: linear-time regex (RE2) over a bounded sample of entries; truncates on large stores.'
  ),
  query: z.string().min(1).max(MAX_QUERY).describe('Substring query or regex pattern.'),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).superRefine((val, ctx) => {
  if (val.mode === 'regex' && val.query.length > MAX_REGEX_PATTERN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `regex pattern exceeds ${MAX_REGEX_PATTERN} chars`,
      path: ['query'],
    });
  }
});

export const updateValueInput = z.object({
  key: z.string().min(1).max(256).describe(
    'The key to write. Keys starting with "_sys." (case-insensitive) are read-only and will reject.'
  ),
  value: z.string().max(256 * 1024),
});

export const TOOL_NAMES = ['list_keys', 'get_values', 'search', 'update_value'] as const;
```

- [ ] **Step 3: Write `buildTools.ts`** — each tool's `execute` extracted as a top-level helper so the file stays under `max-lines-per-function: 40` regardless of how many tools we add later.

```ts
import type { ProviderCtx } from '../provider.js';
import { isKvStoreServices, type KvStoreServices } from '../types.js';
import { listKeysInput, getValuesInput, searchInput, updateValueInput } from './descriptors.js';

const DEFAULT_LIST_LIMIT = 100;
const DEFAULT_SEARCH_LIMIT = 50;

function narrowServices(ctx: ProviderCtx): KvStoreServices {
  const s = ctx.services('kv_store');
  if (!isKvStoreServices(s)) throw new Error('kv_store services not registered');
  return s;
}

async function executeListKeys(ctx: ProviderCtx, input: z.infer<typeof listKeysInput>) {
  return narrowServices(ctx).listKeys(ctx.tenantId, input.offset ?? 0, input.limit ?? DEFAULT_LIST_LIMIT);
}

async function executeGetValues(ctx: ProviderCtx, input: z.infer<typeof getValuesInput>) {
  return narrowServices(ctx).getValues(ctx.tenantId, input.keys);
}

async function executeSearch(ctx: ProviderCtx, input: z.infer<typeof searchInput>) {
  const offset = input.offset ?? 0;
  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
  const svc = narrowServices(ctx);
  if (input.mode === 'substring') {
    return svc.searchSubstring(ctx.tenantId, input.on, input.query, offset, limit);
  }
  return svc.searchRegex(ctx.tenantId, input.on, input.query, offset, limit);
}

async function executeUpdateValue(ctx: ProviderCtx, input: z.infer<typeof updateValueInput>) {
  return narrowServices(ctx).updateValue(ctx.tenantId, input.key, input.value);
}

export function buildTools(ctx: ProviderCtx) {
  return {
    list_keys: {
      description: 'List all keys in the bound KV store, paginated.',
      inputSchema: listKeysInput,
      execute: (input: z.infer<typeof listKeysInput>) => executeListKeys(ctx, input),
    },
    get_values: {
      description: 'Fetch values for specified keys. Returns null for missing keys.',
      inputSchema: getValuesInput,
      execute: (input: z.infer<typeof getValuesInput>) => executeGetValues(ctx, input),
    },
    search: {
      description:
        'Search the KV store. mode="substring" runs a case-insensitive substring match (DB-side). ' +
        'mode="regex" runs an RE2 regex over a bounded sample (truncates on large stores; pre-narrow with substring first).',
      inputSchema: searchInput,
      execute: (input: z.infer<typeof searchInput>) => executeSearch(ctx, input),
    },
    update_value: {
      description: 'Write a value to the bound KV store. Keys starting with "_sys." are read-only.',
      inputSchema: updateValueInput,
      execute: (input: z.infer<typeof updateValueInput>) => executeUpdateValue(ctx, input),
    },
  };
}
```

- [ ] **Step 4: Write `index.ts`** — provider registration object.
- [ ] **Step 5: Jest test the `execute` functions** for each tool with a mocked `KvStoreServices`. Cover: defaults applied, services method called with correct args, errors propagate.
- [ ] **Step 6: Commit.**

```bash
git add packages/api/src/providers/kv_store/
git commit -m "feat(api): OPENFLOW/KV_STORE provider with 4 tools (list_keys, get_values, search, update_value)"
```

### Task 4.7: Build the RAG provider

**Files:**
- Create: `packages/api/src/providers/rag/index.ts`
- Create: `packages/api/src/providers/rag/buildTools.ts`
- Create: `packages/api/src/providers/rag/descriptors.ts`

- [ ] **Step 1: Descriptors.** Size caps on query/pattern length and a `superRefine` to enforce the tighter cap for regex.

```ts
import { z } from 'zod';

const MAX_QUERY = 4096;
const MAX_REGEX_PATTERN = 1024;

export const searchInput = z.object({
  mode: z.enum(['bm25', 'semantic', 'hybrid', 'regex']).describe(
    'bm25: lexical keyword + term-frequency scoring (Postgres FTS). Best for exact terms, IDs, proper nouns. ' +
    'semantic: vector similarity over text embeddings. Best for natural-language meaning. ' +
    'hybrid: combines semantic and bm25 — runs both and merges by score. Use when unsure which would win. ' +
    'regex: POSIX regex over chunk content. Use only for structured patterns (emails, IDs, SKUs); slow.'
  ),
  query: z.string().min(1).max(MAX_QUERY).describe('Search query or, for mode=regex, the POSIX pattern.'),
  minSimilarity: z.number().min(0).max(1).optional().describe('Applies to semantic and hybrid. Default 0.3.'),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(200).optional(),
}).superRefine((val, ctx) => {
  if (val.mode === 'regex' && val.query.length > MAX_REGEX_PATTERN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `regex pattern exceeds ${MAX_REGEX_PATTERN} chars`,
      path: ['query'],
    });
  }
});
```

- [ ] **Step 2: `buildTools.ts`** — extract dispatch into a top-level helper so the file stays under `max-lines-per-function: 40`.

```ts
import type { ProviderCtx } from '../provider.js';
import { isRagStoreServices, type RagStoreServices } from '../types.js';
import { searchInput } from './descriptors.js';

const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_MIN_SIMILARITY = 0.3;

function narrowServices(ctx: ProviderCtx): RagStoreServices {
  const s = ctx.services('rag');
  if (!isRagStoreServices(s)) throw new Error('rag services not registered');
  return s;
}

async function executeSearch(ctx: ProviderCtx, input: z.infer<typeof searchInput>) {
  const svc = narrowServices(ctx);
  const offset = input.offset ?? 0;
  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
  const ms = input.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  switch (input.mode) {
    case 'bm25':     return svc.searchBm25(ctx.tenantId, input.query, offset, limit);
    case 'semantic': return svc.searchSemantic(ctx.tenantId, input.query, ms, offset, limit);
    case 'hybrid':   return svc.searchHybrid(ctx.tenantId, input.query, ms, offset, limit);
    case 'regex':    return svc.searchRegex(ctx.tenantId, input.query, offset, limit);
  }
}

export function buildTools(ctx: ProviderCtx) {
  return {
    search: {
      description: 'Search the bound RAG store. Pick mode based on the query.',
      inputSchema: searchInput,
      execute: (input: z.infer<typeof searchInput>) => executeSearch(ctx, input),
    },
  };
}
```

- [ ] **Step 3: `index.ts`** + provider registration.
- [ ] **Step 4: Jest tests** — dispatch per mode.
- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/providers/rag/
git commit -m "feat(api): OPENFLOW/RAG provider with single search tool dispatching by mode"
```

### Task 4.8: Register both providers (first in the Map)

**Files:**
- Modify: `packages/api/src/providers/index.ts`

- [ ] **Step 1: Insert kv_store + rag at the top of the `builtInProviders` Map.** Verify ordering with `for (const [k] of builtInProviders) console.log(k)` if needed.
- [ ] **Step 2: Typecheck + commit.**

```bash
git add packages/api/src/providers/index.ts
git commit -m "feat(api): register kv_store + rag providers first in builtInProviders Map"
```

### Task 4.9: Wire services into real execute path — version-aware

> **Deploy ordering:** This task and Phase 6 (publish snapshot + executeCoreSetup version sourcing) MUST land together — don't deploy 4.9 without 6.1. Mid-deploy state where services factory reads bindings from `agents` for published runs would leak draft changes to production.

**Files:**
- Modify: `packages/backend/src/routes/simulationOrchestrator.ts`
- Modify: `packages/backend/src/routes/simulateHandler.ts`
- Modify: the real execute handler (find with `grep -rln "providerCtx\|services:" packages/backend/src/routes/execute/`)
- Modify: `packages/backend/src/routes/execute/executeCoreSetup.ts` (source bindings from the right row)

- [ ] **Step 1: Update `executeCoreSetup.ts` first.** Resolve `bindings` based on whether the run is draft or published:
  - **Draft runs** → read `selected_kv_store_id` / `selected_rag_store_id` from the `agents` row.
  - **Published runs** → read both columns from the `agent_versions` row for the running version.
  - Expose the resolved `bindings` and the resolved `selected_tools` from the same source on the `ExecuteContext`.

- [ ] **Step 2:** Read the existing calendar wiring (`if (providerId === 'calendar') …`). Add identical blocks for `kv_store` and `rag`, using the `bindings` resolved in Step 1.

```ts
services: (id: string) => {
  if (id === 'calendar') return /* existing calendar service */;
  if (id === 'kv_store') {
    const storeId = bindings.selectedKvStoreId;
    if (storeId === null) return makeNoStoreBoundKvServices();
    return makeKvStoreService(supabase, storeId);
  }
  if (id === 'rag') {
    const storeId = bindings.selectedRagStoreId;
    if (storeId === null) return makeNoStoreBoundRagServices();
    return makeRagStoreService(supabase, storeId);
  }
  return undefined;
}
```

- [ ] **Step 3: Jest test executeCoreSetup version sourcing.** Highest-stakes change — covered explicitly: (a) draft run reads bindings + selected_tools from `agents`; (b) published run reads them from `agent_versions` for the running version; (c) missing snapshot row (legacy version before backfill landed) → bindings null → tools resolve via the `no_store_bound` sentinel (fail closed, never silently falling back to draft).
- [ ] **Step 4: Manual e2e.** Create a draft agent, bind a KV store, enable `list_keys`, publish. Toggle the binding to None in draft. Invoke published — `list_keys` still works (uses snapshotted binding). Invoke draft — fails `no_store_bound`.
- [ ] **Step 5: Commit.**

```bash
git add packages/backend/src/routes/... packages/backend/src/routes/execute/executeCoreSetup.ts packages/backend/src/routes/execute/executeCoreSetup.test.ts
git commit -m "feat(backend): wire kv_store + rag services with version-aware binding resolution"
```

---

## Phase 5 — Delete guards

### Task 5.1: KV delete guard

**Files:**
- Modify: `packages/backend/src/routes/kvStores/deleteKvStore.ts`

- [ ] **Step 1: Add the reverse lookup before delete.**

```ts
const blocking = await findAgentsByKvStore(supabase, orgId, storeId);
if (blocking.draft.length > 0 || blocking.published.length > 0) {
  res.status(409).json({ error: 'in_use', draft: blocking.draft, published: blocking.published });
  return;
}
// existing delete
```

- [ ] **Step 2: Jest test.** Mock the query; verify 409 with structured body on non-empty, 200 on empty.
- [ ] **Step 3: Commit.**

```bash
git add packages/backend/src/routes/kvStores/deleteKvStore.ts packages/backend/src/routes/kvStores/deleteKvStore.test.ts
git commit -m "feat(backend): block KV store delete when referenced by draft or latest published agent"
```

### Task 5.2: RAG delete guard

**Files:**
- Modify: `packages/backend/src/routes/ragStores/deleteRagStore.ts`

- [ ] **Step 1: Same pattern.** Commit.

```bash
git add packages/backend/src/routes/ragStores/deleteRagStore.ts packages/backend/src/routes/ragStores/deleteRagStore.test.ts
git commit -m "feat(backend): block RAG store delete when referenced by draft or latest published agent"
```

---

## Phase 6 — Publish snapshot

> **Note.** The execute-path version sourcing (originally Task 6.2) moved into Task 4.9 because services wiring and binding resolution must land in a single atomic deploy. This phase is now publish-snapshot only.

### Task 6.1: Snapshot selected_tools + bindings on publish

**Files:**
- Modify: `packages/backend/src/routes/agents/handlePostPublish.ts` (or the actual publish handler — find with `grep -rln "agent_versions" packages/backend/src/routes/agents/`)

- [ ] **Step 1: Read the current handler.** Identify the INSERT into `agent_versions` and the current transaction boundary.
- [ ] **Step 2: Extend the INSERT** to include `selected_tools`, `selected_kv_store_id`, `selected_rag_store_id` sourced from the `agents` row.
- [ ] **Step 3: Take locks inside the publish transaction** so a concurrent `PATCH /selected-tools` or `/store-bindings` or a `DELETE kv_stores/:id` can't race. The agent-row lock prevents inconsistent snapshots (tools-without-binding); the store-row locks prevent dangling FK.

```sql
BEGIN;
-- Lock the agent row so concurrent PATCHes can't mutate while we read selected_tools + bindings.
SELECT selected_tools, selected_kv_store_id, selected_rag_store_id
FROM agents WHERE id = $agent_id FOR SHARE;
-- Lock referenced stores so a concurrent delete cannot win the race.
SELECT id FROM kv_stores WHERE id = $kv_id FOR SHARE;   -- only if non-null
SELECT id FROM rag_stores WHERE id = $rag_id FOR SHARE; -- only if non-null
INSERT INTO agent_versions (...) VALUES (..., $selected_tools, $kv_id, $rag_id);
COMMIT;
```

- [ ] **Step 4: Jest test.** A snapshot row has all three new columns populated; concurrent PATCH during publish either lands before or after, never mid-snapshot.
- [ ] **Step 5: Commit.**

```bash
git add packages/backend/src/routes/agents/handlePostPublish.ts
git commit -m "feat(backend): snapshot selected_tools + bindings on publish under FOR SHARE locks"
```

---

## Phase 7 — FE save flow for bindings

### Task 7.1: Server action

**Files:**
- Create: `packages/web/app/actions/agentToolStoreBindings.ts`

- [ ] **Step 1: Read `packages/web/app/actions/agentSelectedTools.ts`** end-to-end. Note the result discriminated union, the error decoding, the `expectedUpdatedAt` flow.
- [ ] **Step 2: Mirror it for store bindings.** PATCH `/agents/:id/store-bindings`. Same success/conflict/failure shapes.
- [ ] **Step 3: Commit.**

```bash
git add packages/web/app/actions/agentToolStoreBindings.ts
git commit -m "feat(web): server action for PATCH /agents/:id/store-bindings"
```

### Task 7.2: Hook

**Files:**
- Create: `packages/web/app/hooks/useAgentToolStoresState.ts`

- [ ] **Step 1: Read `useAgentToolsState.ts`** end-to-end. Note `SaveState`, debounce timing, `applySuccess`/`applyConflict`/`applyTransientFailure`.
- [ ] **Step 2: Mirror.** The hook exposes `bindings`, `setBindings(next)`, and `saveState`. Calls `updateAgentToolStoreBindingsAction` on debounce.
- [ ] **Step 3: Commit.**

```bash
git add packages/web/app/hooks/useAgentToolStoresState.ts
git commit -m "feat(web): useAgentToolStoresState hook mirroring useAgentToolsState"
```

---

## Phase 8 — FE tools panel UX

### Task 8.1: Order kv_store + rag first

**Files:**
- Modify: `packages/web/app/hooks/useAgentRegistry.ts`

- [ ] **Step 1: In `buildState`, sort groups so `kv_store` and `rag` come first.** Other groups preserve their existing order.
- [ ] **Step 2: Commit.**

### Task 8.2: `StoreSelect` component + `ProviderHeader` rightSlot

**Files:**
- Create: `packages/web/app/components/panels/StoreSelect.tsx`
- Modify: `packages/web/app/components/panels/ProviderHeader.tsx`

- [ ] **Step 1: Build `StoreSelect`.** Single-select with None option, takes a list of stores and a selected id.
- [ ] **Step 2: Add `rightSlot?: React.ReactNode` to `ProviderHeader`.** Render after the existing right-side content.
- [ ] **Step 3: Commit.**

### Task 8.3: Wire `StoreSelect` for kv_store and rag groups in `AgentModeGroup`

**Files:**
- Modify: `packages/web/app/components/panels/ToolsPanelAgentMode.tsx`

- [ ] **Step 1: Load the org's KV and RAG stores** for the dropdowns. (Add an endpoint or reuse existing — `/orgs/:slug/kv-stores` and `/orgs/:slug/rag-stores` likely exist.)
- [ ] **Step 2: Render `StoreSelect` in `ProviderHeader.rightSlot` for kv_store and rag groups only.** Value comes from `useAgentToolStoresState`; onChange writes back.
- [ ] **Step 3: Commit.**

### Task 8.4: Disabled `ToolRow` for unbound providers

**Files:**
- Modify: `packages/web/app/components/panels/ToolRow.tsx`

- [ ] **Step 1: Add `disabledReason: { kind: 'no_store_bound'; storeKind: 'kv' | 'rag' } | null` prop.**
- [ ] **Step 2: When set, disable the checkbox and render an orange `Info` icon (size-3.5) right of the tool name with a Tooltip.**
- [ ] **Step 3: Commit.**

### Task 8.5: `_sys.` badge + helper text in KV editor

**Files:**
- Locate the KV editor table component; modify it.

- [ ] **Step 1: Add a helper line above the table.** Translation key `knowledgeBase.kvStore.sysHelperText`.
- [ ] **Step 2: Add a small "read-only" badge next to keys starting with `_sys.`.** Translation key `knowledgeBase.kvStore.sysBadge`.
- [ ] **Step 3: Commit.**

---

## Phase 9 — Fix popover in ToolCombobox

### Task 9.1: Build `FixStorePopover`

**Files:**
- Create: `packages/web/app/components/panels/FixStorePopover.tsx`

- [ ] **Step 1: Implement using shadcn `Popover`.** Title, description, `StoreSelect`, Cancel + Confirm buttons. Internal state for the pending selection. `onConfirm(storeId)` callback.
- [ ] **Step 2: Commit.**

### Task 9.2: Wire into `ToolCombobox`

**Files:**
- Modify: `packages/web/app/components/panels/ToolCombobox.tsx`

- [ ] **Step 1: In `buildGroupItems`, compute disabled-because-no-store-bound** per item using the current bindings state.
- [ ] **Step 2: When rendered disabled, append a `<Button variant="link" size="sm">Fix</Button>`** to the item.
- [ ] **Step 3: Clicking Fix opens `FixStorePopover` anchored to the link.** On Confirm, write through `useAgentToolStoresState`; on success the popover closes, the combobox re-renders, items un-disable.
- [ ] **Step 4: Manual verify.** Open an Edit Precondition dialog, see a disabled item, click Fix, pick a store, see items un-disable without the dialog closing.
- [ ] **Step 5: Commit.**

---

## Phase 10 — DeleteStoreDialog blocked state

### Task 10.1: Extend delete actions to return discriminated result

**Files:**
- Modify: `packages/web/app/actions/kvStores.ts` (and the RAG equivalent)

- [ ] **Step 1: Change the return type** to `{ ok: true } | { ok: false; reason: 'in_use'; draft, published }`.
- [ ] **Step 2: On 409 from backend, decode the body** and return the `in_use` variant.
- [ ] **Step 3: Commit.**

### Task 10.2: Render blocked state

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/StoresSidebar.tsx`

- [ ] **Step 1: In `DeleteStoreDialog`, after the action call, check the result.** On `in_use`, swap body to the blocked sections.
- [ ] **Step 2: Render two sections** conditionally (draft / published) with the spec'd copy. Each section lists clickable `<Link target="_blank">` rows.
- [ ] **Step 3: Change the primary button to "Close".**
- [ ] **Step 4: Manual verify both single and combined cases.**
- [ ] **Step 5: Commit.**

---

## Phase 11 — i18n

### Task 11.1: Add all new keys to `en.json`

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add the keys listed in the spec** under `agentTools`, `knowledgeBase.deleteBlocked`, `knowledgeBase.kvStore`, `executionKeys`. Sample values:

```json
{
  "agentTools": {
    "storeRequired": "Store required",
    "storeRequiredTooltip": "Select a {kind} store at the top of this group to enable this tool.",
    "selectStore": "Select store",
    "noneOption": "None",
    "fix": "Fix",
    "fixPopoverTitle": "Select a {kind} store",
    "fixPopoverDescription": "Tools in this group need a store to operate on. You can change this later in the tools panel.",
    "fixPopoverCancel": "Cancel",
    "fixPopoverConfirm": "Confirm"
  },
  "knowledgeBase": {
    "deleteBlocked": {
      "title": "This store is in use",
      "draftSectionTitle": "Used in draft",
      "draftSectionBody": "Change the store to None (or another) in these draft agents. No publish required.",
      "publishedSectionTitle": "Used in latest published version",
      "publishedSectionBody": "These agents reference this store in their latest published version. Change the binding in their draft and publish a new version before this store can be deleted.",
      "closeButton": "Close"
    },
    "kvStore": {
      "sysHelperText": "Keys prefixed with \"_sys.\" are read-only to agents.",
      "sysBadge": "read-only"
    }
  },
  "executionKeys": {
    "allTenants": "All tenants",
    "allTenantsWarning": "This key will be valid for any tenant in this organization.",
    "selectTenants": "Select tenants",
    "tenantsBadge": "tenants: {count}"
  }
}
```

- [ ] **Step 2: Audit the FE components added in earlier phases** for any hardcoded strings; replace with `t(...)`.
- [ ] **Step 3: Commit.**

```bash
git add packages/web/messages/en.json packages/web/app/...
git commit -m "feat(i18n): add KV/RAG tools, delete blocked, _sys. badge, and execution-key tenants strings"
```

---

## Phase 12 — Final test + verification sweep

### Task 12.1: Run all tests

- [ ] **Step 1:** `npm run check` from repo root. Fix any issues.
- [ ] **Step 2:** `npm run test -w packages/api` + `npm run test -w packages/backend`. Confirm everything green.

### Task 12.2: Manual verification matrix

- [ ] **Bind store → tools un-disable → save indicator fires → publish.**
- [ ] **Republish without binding → published version stops referencing store → delete now allowed.**
- [ ] **Try to delete store referenced in latest published → blocked dialog shows the agent under the published section with a clickable link.**
- [ ] **Issue a tenant-scoped execution key; invoke an agent against the right tenant (works) and against another tenant (returns 403 `tenant_not_allowed`).**
- [ ] **Agent calls `update_value('_sys.foo', 'bar')` → ToolError `protected_key`.**
- [ ] **Agent calls `update_value` with a 300 KB value → ToolError `value_too_large`.**
- [ ] **Agent calls RAG `search` with mode='regex' and a catastrophic pattern → ToolError `pattern_timeout` within ~500ms.**
- [ ] **Open the Edit Precondition dialog with no store bound → disabled KV item with Fix → popover → select store → items un-disable.**

### Task 12.3: Final commit

- [ ] **Step 1:** Any cleanup commits. Push branch.
