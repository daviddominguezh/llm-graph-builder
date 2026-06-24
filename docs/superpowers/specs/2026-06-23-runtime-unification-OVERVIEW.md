# Runtime unification — Decomposition Overview

**Date:** 2026-06-23
**Status:** Decomposition agreed; sub-project specs to follow.
**Reference / north-star:** `2026-06-19-runtime-unification-design.md` (kept as the full design; §-refs below point into it). Review & dispositions: `2026-06-19-runtime-unification-REVIEW.md`.

## Why decomposed

The original design assumed a single-shot refactor. It grew into ~8 distinct concerns with very different risk profiles (a stateful MCP pool, a host migration to Cloudflare Workers, a durable-execution model, an SSE cutover across three consumers, a portable factory package, a simulation rewrite). Bundling them means one giant, largely non-reversible PR. Per the same decomposition path the tenant-scoped-MCP work took (`2026-06-20-tenant-scoped-mcp-OVERVIEW.md`), the work is split into ordered sub-projects (**RU1–RU6**), each with its own spec → plan → build cycle and each independently verifiable.

## Decisions already settled (baked into every sub-project)

These were resolved in review and must not be re-litigated per-RU:

- **Production host:** Cloudflare Worker (`packages/worker`), not the Supabase Deno edge function (400s cap can't hold hours-long runs; Workers cap CPU, not wall-clock).
- **Durability:** DB-backed suspend/resume in Supabase Postgres (via Hyperdrive/pooler) — chosen over Cloudflare Workflows / Durable-Object orchestration. Human resumes via BE re-invoke; autonomous resumes via sharded Queues / cron over `pending_resumes`; idempotency key on every resume.
- **MCP:** backend-owned connection pool with sticky routing; the pool resolves/attaches/refreshes OAuth internally on connect (no runtime-facing OAuth resolver). Egress guard + server-side tenant auth required.
- **OAuth:** MCP is the only provider (Google Calendar removed). Resolution is pool-internal + lazy; only **preflight** is FE-facing. Grants stay org-level; transport config is tenant-scoped (SP4).
- **KV regex:** `re2js` (pure JS) — one validator across Node/Workers/Deno; no native addon, no `/internal/regex/validate` hop.
- **Simulation:** runtime is the single source of truth (display-only patches + terminal authoritative snapshot); state deep-frozen at the ctx boundary; per-tool `simulatedNoop` seam now, bespoke per-tool behavior deferred uniformly; MCP tools carry a "real side effects" badge.
- **SSE:** one **superset** `ExecutionEvent` vocabulary, hard cutover across all three consumers, single shared serializer — no per-runtime adapters.
- **Foundations (shipped):** SP0 (agent MCP runtime), SP1 (default tenant), SP2 (graph-types transport resolver — consume it, don't re-dedupe), SP4 (tenant-scoped MCP config). Build on these.

## Sub-projects (dependency order)

### RU1 — `shared-store-services` + `re2js`  ∥ parallel with RU2
Consolidate the four factories **+ redesign the agent search API** — *not* a pure behavior-equivalent dedup. Spec: `2026-06-24-RU1-shared-store-services-design.md`.
- New `packages/shared-store-services`: portable KV / RAG / Forms / LeadScoring factory + DB layer (Node + Workers + Deno). (§11.2)
- **KV regex:** `re2js` (linear, ReDoS-safe) + trigram-`ILIKE` literal-prefilter (the DB never runs the regex) + bounded keyset-scan fallback. Drops native `re2` and the `/internal/regex/validate` hop; kills the RE2-vs-Postgres-`~` dialect divergence.
- **Search API:** uniform opaque-cursor, match-count pagination across all modes (drops `offset`/`total`/clamp).
- **RAG:** embed (`/internal/embed`) → vector pool → **always-on rerank** (`/internal/rerank`, new hop; FE toggle removed) → cursor-paginate.
- **Forms/LeadScoring:** portable DB-op extraction. Both runtimes re-export from old locations during transition; deletions land in RU6.

### RU2 — MCP connection pool (backend-owned)  ∥ parallel with RU1
A standalone reliability subsystem the runtimes *call*; delivers value before the rewrite. (§8, §7)
- `packages/backend/src/mcp` pool: `connectionPool`, `poolEntry` state machine, `circuitBreaker`, `healthCheck`, `reconnect` (backoff + jitter).
- Pool key `agentId::tenantId::mcpBindingId`; **sticky routing** (consistent-hash) from day one.
- **Egress guard** on connect + re-validate on borrow (TOCTOU); **server-side tenant/binding authorization** on `/internal/mcp/*` (never trust the caller's body).
- `/internal/mcp/{invoke,preflight}`.
- **MCP-OAuth into the pool's connect path** — lazy, reuse `resolveAccessToken`; 401 → refresh + reconnect (retry the connect, never the invoke).
- **OAuth preflight**: `/internal/oauth/preflight` + FE surfaces (publish button, sim first-message).
- Reconcile the api session-id cache into the pool; delete `mcp/lifecycle.ts` only after the guard is wired.
- Consumed by simulation first; production wires it in RU4.

### RU3 — Runtime core + simulation driver
The heart, exercised by the **simpler** runtime first.
- `packages/api` core: `executeAgent`/`executeTurn`/`childDispatch`, `RuntimeCapabilities` (5 seams) + `RuntimeServices`, `ChildResult` (incl. `awaiting_input`), `DispatchStrategy` (`SyncRecurse` + `Durable` contracts) with `DispatchOutcome = completed | suspended`, the `ExecutionEvent` emitter (superset), env-discriminated `ProviderCtx`. (§6, §10)
- Migrate the **simulation driver** onto the core (`SyncRecurseStrategy` + `NoopPersistence`).
- Sim-state model: FE-owned, runtime sole writer, deep `Object.freeze` at the ctx boundary, write-side deep-clone, display-only patches + terminal authoritative snapshot. (§9)
- Per-tool simulation seam: shared `simulatedNoop` now; MCP **side-effect badge**. (§12.4, §13)
- Sim FE UX: testing-presets popover, sim-state panel, reset / tenant-switch modals, translations. (§12)
- Consumes RU1 + RU2. Validated by its own behavior tests. (Bounded "two cores" window — sim on the new core, prod still legacy — until RU4.)

### RU4 — Production Cloudflare Worker + durable execution
The biggest / riskiest; the host move and durability are isolated here. (§10.4, §11.5)
- `packages/worker`: Cloudflare Worker running the RU3 core (replaces `supabase/functions/execute-agent` + `execute-tool`).
- DB-backed durable suspend/resume: `SupabaseDispatchPersistence` + `DurableDispatchStrategy`; resume triggers (human → BE re-invoke; autonomous → sharded Queues / cron over `pending_resumes`); idempotency key on every resume.
- Hyperdrive (or Supabase pooler) in front of Postgres; sized tier.
- Consumes RU3, RU1, RU2.
- If still too large at execution time, sub-splits into **4a** (durable dispatch on the core) and **4b** (Cloudflare host cutover) — keep as one spec until proven necessary.

### RU5 — SSE hard cutover
Touches all three consumers at once, so it comes after both drivers emit `ExecutionEvent`. (§6.6)
- Land the superset `ExecutionEvent` + the single `executionEventSse.ts` serializer.
- Migrate all three consumers: production API (`web/app/lib/api.ts`), simulation panel, widget (`packages/widget/useChatStream.ts`).
- Delete the legacy public/sim SSE shapes + writers; no adapters.
- Verify each consumer renders the full superset (tokens, durations, structured output, per-node errors, `child_awaiting_input`) before deleting the old shapes.
- Depends on RU3 + RU4.

### RU6 — Dead-code deletion / finalize
Quarantine the irreversible step. (§11.3)
- Delete the (verified) §11.3 manifest — run `find_referencing_symbols` on the partial `kvStoreService`/`ragStoreService` deletions first.
- Delete `mcp/lifecycle.ts`, the old orchestrators, and the Supabase edge function.
- Non-reversible; the full test suite must stay green.

## Dependency graph

```
RU1 ─┐
RU2 ─┴─→ RU3 ──→ RU4 ──→ RU5 ──→ RU6
              (RU4 also consumes RU2 for production MCP)
```

- **RU1 and RU2 run in parallel** — neither depends on the core (fast start).
- **Critical path:** RU1/RU2 → RU3 → RU4 → RU5 → RU6.

## Boundary rationale (the non-obvious choices)

1. **Simulation migrates before production (RU3 before RU4).** Sim is sync, ephemeral, no Worker, no durability — the low-risk way to validate the core before the hard prod migration. The "two cores" window is bounded to one sub-project and guarded by RU3's own behavior tests.
2. **The MCP pool is its own sub-project (RU2), not part of the core.** It's a backend service called over HTTP — genuinely independent, and ships reliability wins early.
3. **Durability + host move stay together and late (RU4),** isolated from the core. Durability is *implementation* (DB-backed is decided), not an up-front decision-spike.
