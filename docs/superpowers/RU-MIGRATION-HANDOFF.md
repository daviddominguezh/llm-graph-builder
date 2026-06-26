# Runtime Unification (RU1–RU6) — Handoff / Knowledge Doc

**Date:** 2026-06-26. **Status:** All 6 specs + 6 plans written, cross-reviewed, and mutually consistent. README architecture updated. Web-tools + triggers integration folded in. **Nothing implemented yet** — next phase is building, RU1 first.

This doc is the single entry point for resuming. Read it, then read the OVERVIEW + the relevant RU spec/plan.

---

## 1. What we're doing

Collapse the **two divergent execution runtimes** — production (Supabase Deno **edge** `execute-agent`/`execute-tool`, hard **400s cap**) and simulation (backend orchestrators) — into **one durable runtime on Cloudflare Workers**, with one MCP connection pool, one portable store-services package, and one SSE event vocabulary. The payoff: agents/workflows that run for **hours** (durable suspend/resume), no code duplication, real-time chat UX that survives instance failure.

**Hard context (don't re-derive):**
- **No prod users, solo dev, `main` frozen.** Everything ships as **one long-lived branch**, merged only after the user manually tests all of RU1–6 end-to-end. Decomposition is for dev/review sequencing, NOT incremental prod rollout. Hard cutovers are fine.
- **Deploy:** BE on **Fly** (multi-instance, header sticky routing via `fly-replay`); prod execution → **Cloudflare Workers**; **Supabase Postgres** (via **Hyperdrive**); **Redis Cloud** (ioredis/TCP = pub/sub) + **Upstash** (HTTP REST = cache only).

## 2. The documents (all under `docs/superpowers/`, gitignored)

- **North-star** (full original design): `specs/2026-06-19-runtime-unification-design.md` + its `…-REVIEW.md`.
- **OVERVIEW** (decomposition, "settled decisions", dependency graph): `specs/2026-06-23-runtime-unification-OVERVIEW.md` — **read this second.**
- **Specs:** `specs/2026-06-24-RU1-shared-store-services-design.md`, `…RU2-mcp-connection-pool-design.md`, `…RU3-runtime-core-simulation-design.md`, `2026-06-25-RU4-worker-durable-execution-design.md`, `…RU5-sse-hard-cutover-design.md`, `2026-06-26-RU6-dead-code-deletion-design.md`.
- **Plans** (bite-sized TDD): same names under `plans/`, without `-design`.
- **Feature specs/plans (already shipped in code):** web tools `2026-06-23-web-builtin-tools(-design).md`; triggers `specs/2026-06-23-trigger-two-step-modal-persistence-design.md` + `plans/2026-06-24-triggers-event-driven-scheduler.md`.
- **README** `## Architecture` section: legacy + new diagrams + "Design notes". The product-facing source of truth for the architecture.
- **Memory:** `reference_codebase_architecture_facts.md` (non-obvious codebase facts — READ IT), `project_ru_unification_merge_strategy.md`.

## 3. Execution order (parallel vs sequential)

```
RU1 ─┐
RU2 ─┴─→ RU3 ──→ RU4 ──→ RU5 ──→ RU6
```
- **RU1 ∥ RU2** — parallel; neither depends on the core. **Build these first.**
- **RU3** depends on RU1 + RU2. **RU4** depends on RU3 (split internally: **4a** durable dispatch, Node-tested → **4b** Worker host cutover). **RU5** depends on RU3 + RU4. **RU6** depends on RU1–5 + the user's e2e gate (irreversible — runs LAST).
- Each RU: spec → plan → implement (subagent-driven-development or executing-plans). RU1/RU2 plans build against today's code; RU3–RU6 plans were drafted assuming the prior RUs are merged (cross-RU deps are flagged inside them).

## 4. Per-RU summary + the key gotcha for each

- **RU1 — `shared-store-services` + re2js.** Portable KV/RAG/Forms/LeadScoring package (Node + Workers + Deno). KV regex = **re2js** (linear, ReDoS-safe) + **trigram-`ILIKE` prefilter** (DB never runs the regex) + bounded scan. **Search API redesign** (not pure dedup): uniform **opaque-cursor, match-count** pagination across all modes, drops `offset`/`total`. RAG = embed→pool→**always-on rerank** (`/internal/rerank`)→cursor. Forms/LS = `conversations.metadata.{forms,lead_score}` **read-merge-write, no RPC**. _Gotcha: rerank toggle removed everywhere; the dashboard + agent RAG paths stay separate (only unified in always-on)._
- **RU2 — BE-owned MCP pool.** Warm connection cache, key `agentId::tenantId::serverConfigId` (= `McpServerConfig.id`; **no `mcp_binding_id` column**). Fly **consistent-hash routing** (`fly-replay` over `vms.<app>.internal`), TTL/LRU (stdio tighter), keepalive, lazy reconnect. **Transparent failover**: client calls once; only a crash **mid-execution** surfaces `uncertain_outcome`. Egress (`assertEgressForServers`) + server-side tenant auth + OAuth in connect (`resolveAccessToken`). Client = `McpPoolClient` (plan type `McpInvoker.invoke`). _Gotcha: reuses the api MCP primitives; absorbs `ensureSession`/`sessionCache`; `mcp/lifecycle.ts` deleted in RU6._
- **RU3 — runtime core + sim.** **Two-engine `StepMachine`**: `AgentStepMachine` (wraps `executeAgentLoop`) + `WorkflowStepMachine` (wraps `executeWithCallbacks`), engine chosen **by type, server-side**. `executeTurn`/`childDispatch`, `ChildResult`, `DispatchStrategy`/`DispatchPersistence` (sim impls only), `ExecutionEvent` emitter + **throwaway sim-SSE bridge**. Sim-state model (deep-freeze, clone-on-write, patches + terminal snapshot). `simulatedNoop` seam for **every** builtin (incl. `web`). **Both** sim endpoints migrate behind one BE-routed sim API. `maxDispatchDepth = 3`. _Gotcha: dispatch decision is on `AgentLoopResult.dispatchResult` (the loop), not `executeAgent` (the attempt)._
- **RU4 — Worker + durable execution.** Cloudflare Worker durable **step-machine** (a step = LLM-req/tool for agents, node/tool for workflows). Per-step checkpoint to Postgres = the dashboard write moved per-step. Suspend reasons budget/input/dispatch; resume = **direct self-re-invoke (primary) + CF Cron backstop over `pending_resumes`** (re-introduced; was dropped 2026-06-18). Per-execution **`accumulated_active_ms`** enforces the 1h cap (NOT shared across siblings). Reuses `agent_stack_entries` + `agent_execution_events(execution_id, sequence)` (adds an atomic seq allocator). **Durable two-tier SSE producer**: Worker batches events (~50ms) → `POST /internal/events/publish` → **Redis Cloud** pub/sub; publishes **`{ seq, event }`**; durable events also persisted. `maxDispatchDepth=3` (RU3 already exports 3 — RU4 just consolidates the legacy `=10` sites). **+§18 integration:** `invokeWorker`, shared portable preparer module, `TAVILY_API_KEY` Worker binding, trigger `triggerRunId` recording. _Gotcha: Workers-compat of the api core + RU1 is asserted but only PROVEN in 4b._
- **RU5 — SSE hard cutover.** One `ExecutionEvent` + one `executionEventSse.ts` serializer. **Decision B:** keep a curated `PublicExecutionEvent` at the public edge via **one projection** at the BE serve step; **the widget is NOT rewritten** (it's an external embed with a vendored public shape). Single sim + prod API, **BE-routed by type**. **Durable SSE serve**: subscribe Redis Cloud + tail Postgres log (`getEventsAfter`) + `Last-Event-ID`/`seq` resume + heartbeats + failover. Deletes internal→public converter + the RU3 bridge; **keeps `PublicExecutionEvent`**. **No automated verification harness** (manual). _Gotcha: `api.ts` is the SIM (workflow) consumer, NOT prod; prod public is `handleExecute`/`executeAgentCore`, consumed by the widget + external API._
- **RU6 — deletion / finalize.** Gated manifest per originating RU: reference-check (`find_referencing_symbols`) → delete → `npm run check` + suite green → commit. **Immediate hard-delete** (GitHub history is recovery). Infra decommission in scope (CI/CD, `.env.example`; the user does the Supabase cloud-side, like migrations). **Keeps:** `PublicExecutionEvent`, engine internals (`executeAgentLoop`/`executeWithCallbacks`), `shared-store-services`, the pool, the Worker, **`vfs-cleanup`** (a 3rd edge fn), **`invokeWorker`**. _Gotcha: `executeCore*`/`executeAgentCore` deleted ENTIRELY — confirm `handleExecute` + triggers switched to `invokeWorker` first. Runs ONLY post-merge (on this branch every ref-check would correctly STOP)._

## 5. Cross-RU integration seams (verified — watch these at build time)

- **`{ seq, event }` envelope** (RU4 publishes) ↔ RU5 serve emits `id: <seq>`. One source of truth for the live cursor + the durable resume cursor.
- **`maxDispatchDepth = 3`** everywhere (RU3 spec/plan/test, RU4, OVERVIEW). RU3 is the single source; RU4 consolidates legacy `=10` sites.
- **`invokeWorker`** (new, RU4) is the only BE→Worker entry; `handleExecute` + triggers use it; RU6 deletes `executeCore*` entirely.
- **Shared portable bundle-preparer module** (RU4): the `toolBuilder.ts` `PREPARERS` move into `packages/api`, used by Worker (RU4) + sim (RU3) — no Node/Deno duplication.
- **`McpPoolClient`/`McpInvoker`** (RU2 defines) injected as `RuntimeServices.mcpPool` (RU3) — reconcile the RU3 stub with the RU2 import.
- **Sim-state store symbol** (`useSimulationState.adoptSnapshot`) — RU3 must provide it; RU5 consumes.
- **Workflow-migration contingency** — RU3 migrates the workflow engine onto the core; RU5 assumes it (full rename, no legacy `node_*` retention). If RU3 lands without it, RU5 keeps a fallback.

## 6. Web tools + triggers (already in code; 4 integration decisions made)

- **Web (`openflow/web`/Tavily):** the provider (`packages/api/src/providers/web`) is **already Workers-clean** (no DB, no hop, in-process `fetch`). Decisions: **Tavily key = Worker binding, direct call**; the bundle-preparer becomes the **shared portable module**; RU3 adds web to the **`simulatedNoop` seam** + a `web` branch in `simulationServicesResolver` (else web tools vanish in sim or fire real billable calls).
- **Triggers (`backend/src/triggers`):** scheduler = **Google Cloud Tasks** (prod) / in-process timer (dev); tables `agent_triggers` + `trigger_runs` (at-most-once via Cloud Tasks + `UNIQUE(trigger_id, scheduled_for)`). **Orthogonal** to durable-resume (`pending_resumes`) — different transport/intent/tables. The fire path calls the shared executor seam, so the Worker cutover is transparent. Decision: pass an optional **`triggerRunId`** to `invokeWorker`; the **Worker records `trigger_runs.status` at terminal** (fire-and-forget at the BE) — correct under suspendable runs.

## 7. Misconceptions corrected this session (the big ones)

See `reference_codebase_architecture_facts.md` for the full ledger. Headlines: **agents ≠ graphs** (two engines: `executeAgentLoop` vs `executeWithCallbacks`); **`api.ts` is the sim-workflow consumer, not prod**; **prod is unified** via `executeAgentCore`/`appType`; **two Redis providers** (Upstash REST can't `SUBSCRIBE`); **persistence is at boundaries today, not per-step**; **the resume queue was dropped 2026-06-18**; **MCP connects per-call (no pool); OAuth already works**; **`buildAgentRuntimeGraph` returns an empty graph**; **rerank is dashboard-side, not ingestion**; **Forms/LS = metadata read-merge-write, no RPC**; **no `mcp_binding_id`**; **`ProviderCtx` is flat**; **`resolveChildConfig`/`ResolvedChildConfig`, no `AgentGraph`**; **scope `@daviddh`**; **`vfs-cleanup` is a 3rd edge fn**.

## 8. Process wisdom (how to work on this)

- **Verify against code before asserting.** My single biggest failure mode was repeating stale audit claims. Grep/read first.
- **Subagents must FLAG, not fabricate.** Every plan-generation/audit subagent was told to flag spec-vs-code contradictions rather than silently "fix" them — this caught real bugs (the invented `write_conversation_lead_score` RPC, the seq-envelope gap, the `vfs-cleanup` carve-out, the Queues-vs-cron staleness). Keep doing this.
- **Plan-generation pattern:** dispatch an **Opus** subagent to read the real files + draft the bite-sized TDD plan to disk; then **self-review against the spec + verify every flagged contradiction myself** before accepting. (Subagents always Opus, per user rule.)
- **Cross-document audits** (README-vs-each-RU, then RU-vs-RU on the shared contracts) found genuine contradictions late — worth running again after any big change.
- **Use `AskUserQuestion` for genuine decisions**, don't assume (the user explicitly wants this).
- **User rules:** never `git stash`; stage files explicitly (no `-a`/`-am`); migrations written-not-applied (user applies); never discard external changes; always add translations; document new `process.env.X` in `.env.example` same change; never disable ESLint / use `any`.

## 9. Where we stand + next step

**Done:** 6 specs + 6 plans (cross-reviewed, consistent), README architecture (legacy + new + design notes), memory, web/triggers integrated into RU3/RU4/RU6. **Not done:** any implementation.

**Next:** start building. **RU1 ∥ RU2 first** (independent, buildable against today's code). Use `superpowers:subagent-driven-development` (fresh agent per task, review between) or `executing-plans`. The RU3–RU6 plans carry cross-RU dependency flags + the web/triggers integration as notes — expand those into full TDD tasks when each RU is reached. RU6 runs only after everything else is merged + the user's end-to-end test passes (durable suspend/resume from RU4, all real SSE consumers from RU5).
