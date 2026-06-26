# RU1 — `shared-store-services` + `re2js` — design

**Date:** 2026-06-24
**Status:** Design approved; pending implementation plan.
**Part of:** Runtime-unification decomposition — sub-project **RU1** (`2026-06-23-runtime-unification-OVERVIEW.md`). North-star: `2026-06-19-runtime-unification-design.md` §11.2.
**Depends on:** SP2 (graph-types resolver — shipped). Runs in **parallel with RU2**; consumed by RU3 (sim driver) and RU4 (Worker).

## 1. Intent

The four builtin store-service factories — **KV, RAG, Forms, LeadScoring** — are implemented **twice**: Node backend (`packages/backend/src/services/*`, used by simulation) and Deno edge (`supabase/functions/execute-agent/{kv,rag}StoreServices.ts` + `*Queries.ts`, used by production). They have drifted (audit #1 KV regex; #2 forms/LS absent in sim; #6 parallel impls).

RU1 collapses them into **one portable package, `packages/shared-store-services`**, imported by every host (Node backend, Cloudflare Worker, and the Deno edge during transition), using `@supabase/supabase-js` for all DB access.

Along the way RU1 **redesigns the agent search API** (KV + RAG) to fix correctness, security, and pagination problems found during design. So RU1 is **"consolidate the factories + redesign search + always-on rerank,"** *not* a pure behavior-equivalent dedup — the agent-facing search contract changes.

## 2. Scope

**In:**
- New `packages/shared-store-services` — portable KV/RAG/Forms/LeadScoring factory + DB layer.
- KV regex via `re2js` + trigram-`ILIKE` prefilter + bounded keyset-scan fallback; drop native `re2` and the `/internal/regex/validate` hop.
- Uniform **opaque-cursor, match-count** search pagination across all modes (KV + RAG).
- RAG: **always-on rerank** via a new `/internal/rerank` hop; query embedding via the existing `/internal/embed` hop.
- Remove the FE rerank toggle (and its i18n); rerank becomes unconditional everywhere.
- Both runtimes re-export from old locations during the transition window.

**Out:**
- Unifying the **dashboard** RAG search path (`routes/ragStores/ragFiles/*`) with the agent search path — they stay separate; both simply always rerank. (Follow-up.)
- RAG **ingestion** (GCS, DocumentAI, chunking, the dashboard `rerank.ts` callers) — unchanged except removing the toggle.
- Moving embeddings/rerank out of the BE into the Worker (REST-in-Workers via Web Crypto) — **future**; the central Vertex project-RPM throttle and the service-account key stay in the BE.
- The runtime/orchestration core (RU3) and the host migration (RU4).

## 3. Portability model

The factory logic is portable; two things are not, and stay BE-side behind HTTP hops the Worker already uses today:

| Concern | Where it runs | Why |
|---|---|---|
| KV/RAG/Forms/LS DB queries | **portable** (supabase-js) | works in Node + Workers + Deno |
| KV regex match | **portable** (`re2js`, pure JS) | no native addon |
| KV regex pattern-literal prefilter | **portable** (`ILIKE`, SQL) | DB does substring, trigram-indexed |
| RAG query embedding | **BE only** → `/internal/embed` | `@ai-sdk/google-vertex` + `google-auth-library` are Node-only; the **central project-RPM throttle** must live in one place |
| RAG rerank | **BE only** → `/internal/rerank` | Vertex `semantic-ranker` via Google-auth (Node-only); same throttle argument |

`re2js` replaces native `re2` everywhere — one ReDoS-safe, linear-time engine in Node, Workers, and Deno, eliminating the `/internal/regex/validate` hop and the RE2-vs-Postgres-`~` dialect divergence (audit #1).

## 4. Package layout

```
packages/shared-store-services/src/
├── kv/
│   ├── kvStoreService.ts        ← factory: list/get/set/search tools
│   ├── kvQueries.ts             ← supabase-js queries (keyset, ILIKE prefilter)
│   └── regexSearch.ts           ← re2js literal-extraction + match + scan-budget
├── rag/
│   ├── ragStoreService.ts       ← factory: search (simple/semantic/hybrid/bm25)
│   ├── ragQueries.ts            ← vector / FTS / ILIKE queries
│   └── rerank.ts                ← calls /internal/rerank (always on)
├── forms/formsService.ts        ← conversation-metadata DB ops
├── leadScoring/leadScoringService.ts
├── pagination.ts                ← shared opaque-cursor codec + SearchPage type
├── internalApiClient.ts         ← /internal/embed + /internal/rerank (NOT regex)
└── index.ts
```

Imported by `packages/backend/` and `packages/worker/` (+ `supabase/functions/_shared/` during transition). Pure JS/TS, no native addons.

## 5. Search API — uniform opaque-cursor pagination

**Hard requirement: every search mode (KV simple/regex, RAG simple/semantic/hybrid/bm25) exposes the *identical* LLM-facing pagination contract.** The mode never changes the interface.

```ts
interface SearchRequest {
  query: string;
  limit: number;             // max MATCHES per page
  cursor?: string;           // opaque continuation; omit for first page
  // mode-specific knobs (on: 'keys'|'values', minSimilarity, …) never affect pagination shape
}

interface SearchPage {
  items: Array<{ /* match shape per mode */ }>;
  limit: number;
  nextCursor: string | null; // null ⇒ exhausted; non-null ⇒ page again
}
```

- **By match count, forward-only.** The LLM thinks in *matches*, asks for up to `limit`, and pages by passing `nextCursor` back. No `offset`, no `total`, no reachable-index clamp. Depth is unbounded.
- **Opaque cursor** encodes the per-mode continuation; the LLM never sees mode internals:
  - RAG: position in the (reranked) candidate pool, then vector order beyond the pool.
  - KV simple / RAG bm25/FTS: keyset position (last key / last row).
  - KV regex: source-scan position (last key examined).
- **`total` is dropped** — cursors can't produce a cheap exact total, and a forward-paging LLM only needs "is there more?" = `nextCursor != null`.

Rationale: numeric `offset` is O(offset) and needed a ~1000 clamp; keyset cursors are O(log n) per page (index seek) and need no clamp. Opaque token keeps the API uniform while letting each mode page efficiently. Trade-off: cursors are sequential (no random jump to "page N"), which matches how an LLM paginates (forward, "get more").

## 6. KV regex search — secure, fast, consistent

The regex is **LLM-controlled input**, so it must **never run on the shared Postgres** (Postgres `~` backtracks → ReDoS → DB-wide DoS; `statement_timeout` bounds one query but not aggregate CPU/connection exhaustion). The DB only ever runs **safe, indexed `ILIKE`**; the regex runs only in-app via **linear `re2js`**.

Flow for `search(mode:'regex', pattern, on, limit, cursor?)`:

1. **Parse with `re2js`; extract required literal substring(s)** from the pattern (e.g. `foo.*bar` ⇒ `foo`, `bar`; `(foo|foobar)` ⇒ `foo`).
2. **Literal present (common case):** trigram-accelerated prefilter —
   `WHERE <target> ILIKE '%lit%' AND key > :cursor ORDER BY key LIMIT 500` (uses `idx_kv_entries_{key,value}_trgm`). re2js-match the candidates; accumulate up to `limit` matches across successive 500-row batches; `nextCursor` = last key.
3. **No literal (`.*`, `[a-z]+`, …):** bounded keyset **scan fallback** — fetch 500-row batches by `key`, re2js-match, accumulate until `limit` matches **or a per-call scan budget** (~5,000 rows / ~4 MB) is hit; `nextCursor` = scan position (forward progress guaranteed even if a page yields 0 matches).
4. **Memory bound:** one 500-row page at a time, hard-capped by a **~4 MB byte budget** (a KV value may legally be 256 KB; at ~1–2 KB realistic values a page is ~1.25 MB).

Security properties: no backtracking regex runs anywhere (DB does `ILIKE`; app does `re2js`). Consistent RE2 dialect in every runtime ⇒ the simulation preview matches production (audit #1 fixed).

## 7. RAG search — embed → retrieve → rerank → paginate

Semantic / hybrid:
1. **Embed query** via `/internal/embed` (BE → Vertex `text-embedding-004`, batched, **central RPM throttle**, SA key BE-only).
2. **Vector-retrieve a candidate pool** (top ~100) via supabase-js RPC — portable.
3. **Rerank the pool — always on** — `/internal/rerank` (BE → Vertex `semantic-ranker-default-004`; `rerankRecords({ query, records, topN })` already has this shape). One rerank call per search on a bounded pool, BE-throttled.
4. **Cursor-paginate the reranked pool**; if the agent pages past the pool, continue in vector order.

Simple / bm25: no embed; `ILIKE` / FTS retrieve a pool → rerank (always on) → cursor-paginate.

This resolves the documented reason the agent path skipped rerank (*"so pagination composes cleanly"*): we rerank a **bounded pool** (not an infinite stream), so pagination still composes (reranked within the pool, vector beyond), and agents — which consume the top results — get the accuracy.

## 8. Rerank everywhere, no toggle

Rerank becomes an unconditional default:
- **Remove** the FE rerank checkbox and its i18n key.
- **Remove** the `rerank?: boolean` param from `web/app/lib/ragFiles.ts`, `routes/ragStores/ragFiles/searchChunks.ts`, and `hybridSearch.ts`; hardcode rerank on.
- Agent search always reranks (§7).

(The dashboard and agent RAG search remain *separate code paths*; only the toggle removal + always-on behavior is shared. Unifying the two paths is a follow-up.)

## 9. Forms / LeadScoring

Plain conversation-metadata DB reads/writes (`getFormData`, set/get lead score), already behind injected service interfaces. Move the DB-query implementations into `packages/shared-store-services` unchanged — portable via supabase-js, no Node-only deps. This also makes forms/LS available wherever the factory is imported (fixing audit #2's "absent in simulation" at the factory level; the per-tool *simulation behavior* is RU3's seam, not RU1).

## 10. Transition & deletions

- During RU1, `packages/backend/src/services/{kv,rag}StoreService.ts` and the edge `execute-agent/*StoreServices.ts`/`*Queries.ts` **re-export from the new package** so callers are untouched mid-migration.
- Native `re2` dependency removed (KV) once `re2js` lands; `shared-validation/kv/matcher.ts` (native re2) replaced by the re2js path.
- `/internal/regex/validate` endpoint + its edge client usage removed (validation now in-process).
- The actual file deletions of the old service copies happen in RU6 (with the rest of the manifest), after RU3/RU4 consume the package directly.

## 11. Tests

- **Parity tests** where behavior IS preserved: Forms/LeadScoring DB ops, RAG vector retrieval, KV simple/get/set/list — old impl vs new package produce identical results.
- **New-contract tests** for the redesigned surface:
  - Cursor pagination: forward paging, `nextCursor` correctness, exhaustion (`null`), uniform shape across all modes.
  - KV regex: re2js dialect correctness; literal-extraction prefilter soundness (never misses a match a full scan would find); **ReDoS-safety** (a catastrophic pattern stays linear and never touches Postgres as a regex); scan-budget bound + forward progress on sparse no-literal patterns; byte-budget memory cap.
  - RAG rerank: always-on; pool-rerank then cursor-paginate; vector-order continuation past the pool.
  - re2js portability: same results invoked from a Node and a Workers-runtime test context.
- `npm run check` + all suites green.

## 12. Risks / open questions

- **Two Vertex hops per RAG semantic/hybrid search** (embed + rerank). Both BE-throttled; acceptable for accuracy, but watch p99 latency on multi-search turns. (Future: collapse or cache.)
- **Sparse no-literal regex** can return `< limit` (even 0) matches per call under the scan budget — by design (forward progress via cursor). Tool description must tell the LLM to keep paging when `nextCursor != null`.
- **re2js vs native `re2` feature parity** — both omit lookaround/backreferences (intended); confirm no current KV pattern relies on them. Adapt `shared-validation/kv/matcher.ts` call sites + parity test (à la SP2).
- **Dashboard/agent RAG search duplication persists** (only the toggle is unified) — flagged as a follow-up, not RU1.
- **`total` removal** is an agent-tool-contract change — update tool descriptions so the LLM stops expecting it.

## 13. Affected paths (selection)

- New: `packages/shared-store-services/**`, backend `routes/internal/rerank.ts` (`/internal/rerank`).
- Edited: `packages/backend/src/services/{kv,rag}StoreService.ts` (re-export), `packages/api/src/providers/{kv_store,rag}/**` (search args → cursor; descriptions), `routes/ragStores/ragFiles/{searchChunks,hybridSearch}.ts` + `web/app/lib/ragFiles.ts` (drop `rerank` param), FE RAG-search component (drop checkbox + i18n), `shared-validation/kv/matcher.ts` (re2js).
- Removed: native `re2` dep, `/internal/regex/validate` endpoint + edge client usage.
