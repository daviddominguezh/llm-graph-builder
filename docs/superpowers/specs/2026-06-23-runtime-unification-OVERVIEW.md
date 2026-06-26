# Runtime unification — Decomposition Overview

**Date:** 2026-06-23
**Status:** Decomposition agreed; sub-project specs to follow.
**Reference / north-star:** `2026-06-19-runtime-unification-design.md` (kept as the full design; §-refs below point into it). Review & dispositions: `2026-06-19-runtime-unification-REVIEW.md`.

## Why decomposed

The original design assumed a single-shot refactor. It grew into ~8 distinct concerns with very different risk profiles (a stateful MCP pool, a host migration to Cloudflare Workers, a durable-execution model, an SSE cutover across three consumers, a portable factory package, a simulation rewrite). Bundling them means one giant, largely non-reversible PR. Per the same decomposition path the tenant-scoped-MCP work took (`2026-06-20-tenant-scoped-mcp-OVERVIEW.md`), the work is split into ordered sub-projects (**RU1–RU6**), each with its own spec → plan → build cycle and each independently verifiable.

## Decisions already settled (baked into every sub-project)

These were resolved in review and must not be re-litigated per-RU:

- **Production host:** Cloudflare Worker (`packages/worker`), not the Supabase Deno edge function (400s cap can't hold hours-long runs; Workers cap CPU, not wall-clock).
- **Durability:** DB-backed suspend/resume in Supabase Postgres (via Hyperdrive/pooler) — chosen over Cloudflare Workflows / Durable-Object orchestration. Human resumes via BE re-invoke; autonomous resumes via **direct self-re-invoke (primary) + a Cloudflare Cron sweep over `pending_resumes` as a backstop** (Queues dropped — RU4 §5); idempotency key on every resume.
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
A **warm MCP connection cache** in the BE so tool calls reuse connections instead of reconnecting per call; transparently survives idle drops + instance crashes. Spec: `2026-06-24-RU2-mcp-connection-pool-design.md`. (§8, §7)
- Reuses the api MCP primitives (`connectMcp`/`createTransport`/`callTool`), **absorbs** `ensureSession`/`sessionCache`; adds the pooling layer in `packages/backend/src/mcp/pool/`.
- Pool key `agentId::tenantId::mcpBindingId`; warm cache + TTL/LRU eviction (stdio capped tighter) + keepalive + lazy reconnect-on-borrow.
- **Fly routing:** consistent-hash `poolKey` over live `vms.<app>.internal` membership; `fly-replay` + `replay_cache` (per the Fly sticky-sessions guide); dead-owner re-routed server-side over 6PN — **one client call, one response**; only a mid-execution crash surfaces (`uncertain_outcome`).
- **Egress guard** (`assertEgressForServers`) on connect + re-validate on borrow (TOCTOU); **server-side tenant/binding authorization** on `/internal/mcp/*` (never trust the caller's body).
- `/internal/mcp/{invoke,preflight}` + `McpPoolClient` (injected into `buildMcpProvider`'s execute seam).
- **MCP-OAuth into the pool's connect path** — lazy, reuse `resolveAccessToken`; 401 → refresh + reconnect (retry the connect, never the invoke).
- **Trimmed** vs north-star §8: no circuit breaker / background health-sweep / backoff state machine / idempotency keys (unnecessary — only provably-unsent calls are retried).
- Runtime call-site flip lands with RU3/RU4; `mcp/lifecycle.ts` deletion in RU6.

### RU3 — Runtime core + simulation driver
The heart, exercised by the **simpler** runtime first. Spec: `2026-06-24-RU3-runtime-core-simulation-design.md`.
- `packages/api` core: `executeAgent`/`executeTurn`/`childDispatch`, `RuntimeCapabilities` (5 seams) + `RuntimeServices`, `ChildResult` (incl. `awaiting_input`), `DispatchStrategy` (`SyncRecurse` + `Durable` contracts) with `DispatchOutcome = completed | suspended`, the `ExecutionEvent` emitter (superset), env-discriminated `ProviderCtx`. (§6, §10)
- Migrate the **simulation driver** onto the core (`SyncRecurseStrategy` + `NoopPersistence`).
- Sim-state model: FE-owned, runtime sole writer, deep `Object.freeze` at the ctx boundary, write-side deep-clone, display-only patches + terminal authoritative snapshot. (§9)
- Per-tool simulation seam: shared `simulatedNoop` now; MCP **side-effect badge**. (§12.4, §13)
- Sim FE UX: testing-presets popover, sim-state panel, reset / tenant-switch modals, translations. (§12)
- Consumes RU1 + RU2. Validated by its own behavior tests. (Bounded "two cores" window — sim on the new core, prod still legacy — until RU4.)

### RU4 — Production Cloudflare Worker + durable execution
The biggest / riskiest; the host move and durability are isolated here. Spec: `2026-06-25-RU4-worker-durable-execution-design.md`. (§10.4, §11.5)
- **Durable step-machine:** every execution checkpoints **per step** (agent: each LLM request + each tool call; workflow: each node + each tool call) and spans many Worker invocations. The per-step write **is** the dashboard message-persistence (moved from end-of-execution to per-step). Suspends for budget / human-input / dispatch.
- **Resume triggers:** human → BE re-invoke (active-leaf routing); non-input suspends → **direct self-re-invoke (primary)** + **Cloudflare Cron Trigger sweep over `pending_resumes` (backstop / sanity-check only)**; idempotency key on every resume.
- `SupabaseDispatchPersistence` + `DurableDispatchStrategy` over `agent_stack_entries`; re-introduce `pending_resumes` + `claim_pending_resumes` RPC. `maxDispatchDepth` default **3**, single variable, N-safe.
- **Scope = the current sleep-model made durable only**; concurrent-child + N-children deferred (stages 2–3) but schema/interfaces accommodate them (collection `listPending`, tree `execution_id` addressing, "input-source").
- `packages/worker` (4b) runs the RU3 core + RU1 factories (Workers-compatible), Hyperdrive in front of Postgres, folds in `execute-tool`, flips `edgeFunctionClient` → Worker. Consumes RU3, RU1, RU2.
- **Two phases, one spec:** **4a** (durable dispatch on the core, built + tested in Node) → **4b** (Cloudflare host cutover).

### RU5 — SSE hard cutover
Touches all three consumers at once, so it comes after both drivers emit `ExecutionEvent`. Spec: `2026-06-25-RU5-sse-hard-cutover-design.md`. (§6.6)
- Land the superset `ExecutionEvent` + the single `executionEventSse.ts` serializer (`data: {type,...}` wire); deletes the prod **internal→public adapter** too.
- Migrate all three consumers — **full rename, no aliases**: production API (`web/app/lib/api.ts`), sim path (`sseSimComposition.ts`/`compositionMachine.ts`/`useSimulationSend.ts`), widget (`packages/widget/src/ui/useChatStream.ts`).
- Delete the legacy public/sim SSE shapes + writers + the **RU3 throwaway bridge** (`executionEventToSim` + its temporary sim-state members); no adapters.
- **No automated verification harness** — manual cross-consumer verification (RU3's emitter-completeness assertion is retained, source-side).
- Depends on RU3 + RU4.

### RU6 — Dead-code deletion / finalize
Quarantine the irreversible step. Spec: `2026-06-26-RU6-dead-code-deletion-design.md`. (§11.3)
- Delete the (verified) §11.3 manifest — run `find_referencing_symbols` on the partial `kvStoreService`/`ragStoreService` deletions first.
- Delete `mcp/lifecycle.ts`; **both** legacy sim orchestrators (`simulationOrchestrator`, `simulateHandler` workflow, `simulateAgentHandler` agent); the legacy prod orchestrator (`executeCore*`); and the Supabase edge functions (`execute-agent` + `execute-tool`).
- **Keeps** `PublicExecutionEvent` (decision B) + the engine internals (`executeAgentLoop`/`executeWithCallbacks`).
- Runs **only after** RU1–5 merged + the user's end-to-end gate passes. Non-reversible; full suite must stay green; each deletion gated by a reference check.

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
