# RU4 — Cloudflare Worker + durable execution — design

**Date:** 2026-06-25
**Status:** Design approved; pending implementation plan.
**Part of:** Runtime-unification decomposition — sub-project **RU4** (`2026-06-23-runtime-unification-OVERVIEW.md`). North-star: `2026-06-19-runtime-unification-design.md` §10, §10.4, §11.5.
**Depends on:** RU3 (runtime core + `DispatchStrategy`/`DispatchPersistence` contracts), RU1 (`shared-store-services`, Workers-compatible), RU2 (`McpPoolClient`). Consumed by RU5 (SSE) and RU6 (deletion of the edge).
**Context:** no prod users, solo dev, `main` frozen ([[ru-unification-merge-strategy]]) — hard cutover is fine. Backend on Fly; production execution moves to **Cloudflare Workers**.

## 1. Intent

Production agent/workflow runs last **hours** (slow tools, long chains, human-input pauses) and must run on a **CPU-capped host** (Cloudflare Workers) that cannot hold a single hours-long invocation. RU4 makes every execution a **durable, resumable step-machine**: each execution checkpoints its state per step and spans **many** Worker invocations, suspending and resuming via Postgres. It runs the RU3 core in a new **`packages/worker`** Cloudflare Worker, replacing the Supabase Deno edge (`execute-agent` + `execute-tool`).

This generalizes what production already half-does (suspend the parent at child dispatch to `agent_stack_entries.parent_session_state`, resume via `continueExecutionId`) from a **dispatch-boundary** mechanism into a **per-step** one.

## 2. Scope

**In (two phases — one spec):**
- **4a — durable dispatch on the core (built + tested in Node first):** the durable step-machine — per-step execution checkpoint; suspend reasons (budget/input/dispatch); resume triggers (direct re-invoke primary + cron backstop); `DurableDispatchStrategy` + `ExecutionPersistence` over `agent_stack_entries`; re-introduced `pending_resumes` table + `claim_pending_resumes` RPC; idempotency keys; `maxDispatchDepth` default **3** (single variable, N-safe).
- **4b — Cloudflare host cutover:** `packages/worker` running the RU3 core; `wrangler.toml`; **Hyperdrive** in front of Postgres; fold in `execute-tool` (Play button); flip `edgeFunctionClient` → Worker; verify the RU3 core + RU1 package run Workers-clean.

**Out:**
- **Concurrent-child** (parent doesn't sleep) and **N concurrent children** — deferred *stages 2–3*; the schema/interfaces accommodate them (§12), but RU4 implements only the current sleep-model durably.
- The **SSE consumer cutover** — RU5.
- **Deleting** the edge `execute-agent`/`execute-tool` Deno runtime — RU6 (after the Worker is proven live).

## 3. The durable step-machine

**A step is the resumable checkpoint.** The durable model is **engine-agnostic** — it drives RU3's `StepMachine` (engine chosen by execution type, server-side), and a *step* is whatever that engine reports: for an **agent** (`AgentStepMachine`) each LLM request is a step and each tool call (MCP or builtin) is a step; for a **workflow** (`WorkflowStepMachine`) each node is a step and each tool call is a step. The checkpoint/resume/`pending_resumes` machinery below is identical for both.

**The checkpoint is the per-step persistence — and it is the same write the dashboards need.** Today messages are persisted at execution *boundaries* (`persistMessagingPreExecution` up front, `persistMessagingPostExecution` at the end); the loop only fires per-step *callbacks* (`onStepProcessed`, `onToolExecuted`) for streaming, not DB writes. **RU4 moves persistence to per-step**: each step's output (assistant message, tool result, node output) is written the moment it completes, by hooking those existing callbacks. That per-step-written history + a small position marker (workflow: next node; agent: "awaiting LLM" vs "pending tool calls") **is** the resumable state — and it is exactly the per-step granularity the message/debug/cost dashboards (constraint 3) require. One mechanism, two purposes.

**Suspend reasons → resume triggers:**

| Suspend reason | Resume trigger |
|---|---|
| CPU/wall budget near-exhausted, work pending | **immediate self-re-invoke** (continue the *same* execution) |
| Waiting for human input | inbound user message → resume the active leaf |
| Dispatched a child (sleep) | child `finish`/final-node → autonomous re-invoke of the parent |
| *(stage 2, deferred)* waiting on a long async tool | tool completion |

Every **non-input** suspend writes a `pending_resumes(execution_id, reason, idempotency_key)` row and fires the trigger; the **input** case resumes when the message arrives. Resume loads the execution's persisted state and **continues from the next un-completed step** — completed steps are never re-run.

## 4. Execution tree + active-leaf routing

A conversation owns a **tree of executions** (`agent_stack_entries`: `execution_id`, `parent_execution_id`, `root_execution_id`, `parent_session_state jsonb`). The tree is **addressed by `execution_id`** and is already N-depth-safe (`root_execution_id` exists "for N-depth notification routing").

**Routing (the user-facing API never changes):** an inbound message for a conversation resolves to the **active leaf** — the deepest non-sleeping execution under the root — and resumes *that* `execution_id`. The user does not know they're talking to a child; the router does. In RU4 there is exactly one active leaf (sync sleep-model). Stage 2/3 generalize this to multiple addressable live executions + an "input source" per execution (§12) — same lookup, richer result.

## 5. Resume triggers

- **Human (the common case) — no queue.** The BE receives the user message, resolves the active-leaf `execution_id`, and re-invokes the Worker with `continueExecutionId`. The inbound message *is* the trigger.
- **Direct re-invoke (PRIMARY for continuation + child-finish).** The suspending Worker invocation writes the `pending_resumes` row, then fires a self-`fetch` via `ctx.waitUntil(...)` to resume immediately (low latency — a long agent checkpoints often and cannot eat a poll gap per segment). Child-finish works the same: the child's invocation, on `finish`, writes the parent's output + a `pending_resumes` row for the parent and fires its re-invoke.
- **Cron sweep (BACKSTOP ONLY — a sanity check, not the main path).** A **Cloudflare Cron Trigger** (`wrangler.toml [triggers] crons`, minute granularity) fires a scheduled Worker run that `claim_pending_resumes(N)` for rows **stale beyond ~60s** (i.e. a *dropped* direct re-invoke) and re-fires them. **This must be clearly labelled in code + comments as the dropped-trigger fallback, never the primary mechanism.** The staleness gate keeps it from racing healthy direct re-invokes; any double-fire is absorbed by the idempotency key. Effectively zero marginal cost (~43k near-empty invocations/month, within the Workers Paid quota the prod Worker already uses). The sweep *logic* is a portable function (Node-tested in 4a); only the trigger binding is CF (wired in 4b).

## 6. Execution persistence

`SupabaseDispatchPersistence` is really **execution persistence** — it does more than dispatch:
- **Per-step checkpoint:** write each step's output (agent message / tool result / workflow node output) on completion; advance the execution's position marker. A **tool step's result is persisted before the execution advances**, so a resume never re-fires a completed tool.
- **Dispatch ops** (the §10 `DispatchPersistence` interface): `beforeDispatch` (persist parent `parent_session_state`, create the child execution), `onChildFinish`/`onChildError` (write child outcome, enqueue parent `pending_resume`), `listPending` (**collection** — supports N pending children for stage 3, even though RU4 uses one).
- **Schema:** reuse `agent_stack_entries` for the tree/sleep state; **re-introduce** `pending_resumes` (`execution_id`, `reason`, `idempotency_key`, `status`, `last_attempt_at`, `created_at`) + the atomic `claim_pending_resumes(p_limit)` RPC (the pattern from the migration dropped 2026-06-18, now genuinely needed under the durable Worker model). Migration files are **written, not applied** (user applies).

## 7. `DurableDispatchStrategy`

Implements the §10.2 `DispatchStrategy` production arm: on dispatch, persist the parent (sleep) via `ExecutionPersistence.beforeDispatch`, return `{ kind: 'suspended', handle }`, and the invocation ends. The child becomes the active leaf. On child terminal, `onChildFinish` writes the `ChildResult` and enqueues the parent's `pending_resume`; the resume injects the child's output as the synthetic `invoke_agent` tool result **exactly as `SyncRecurseStrategy`'s `completed` branch does** — the child-result injection logic is shared (RU3), only suspend-vs-inline differs.

## 8. Idempotency

Every resume carries an **idempotency key** checked against persisted run state before continuing, so a redelivered/duplicated trigger (cron overlap, direct + backstop racing, Worker restart) never re-runs a turn or re-fires a tool. Layered with §6's tool-result-persisted-before-advancing: the only irreducible re-execution risk is a **tool step that crashed before its result was persisted** — the same "uncertain outcome" case as the RU2 pool, surfaced rather than silently retried.

## 9. `maxDispatchDepth`

A **single configurable variable, default 3** (parent → child → grandchild). This **overrides the earlier 10**. The tree schema (`root_execution_id`, `execution_id` addressing) is sound for **any N** — changing the constant changes the cap with no other code change; only memory/tokens/CPU bound the real ceiling, not the logic.

## 10. The Cloudflare Worker (4b)

```
packages/worker/
├── src/
│   ├── index.ts            ← fetch handler (new run | human resume | direct re-invoke) + scheduled handler (cron backstop)
│   ├── workerSupabase.ts   ← service-role client over the Hyperdrive binding
│   ├── runDurable.ts       ← wires RuntimeCapabilities (DurableDispatchStrategy, SupabaseDispatchPersistence, OTel, token-bucket, structured logger) + RuntimeServices and runs the RU3 core
│   └── singleTool.ts       ← folds in the former execute-tool (Play button) single-tool execution
└── wrangler.toml           ← bindings (Hyperdrive, master key, MCP base URL), [triggers] crons, limits
```

- Imports the **RU3 core** (`packages/api`) + the **RU1 factories** (`packages/shared-store-services`) — both Workers-compatible (pure JS/TS, no native addons; `re2js` not native `re2`; Web Crypto; supabase-js over **Hyperdrive** so stateless Workers don't exhaust Postgres connections). **4b verifies this compatibility before cutover.**
- `RuntimeServices.mcpPool` → the RU2 `McpPoolClient` calling the BE pool over `/internal/mcp/*` (the Worker holds no MCP connections — RU2 owns them).
- **Cutover:** flip `packages/backend/src/routes/execute/edgeFunctionClient.ts` from the edge URL to the Worker URL. The edge `execute-agent`/`execute-tool` Deno code is **left in place** (deletion is RU6, after the Worker is proven).

## 11. Phasing

- **4a (Node):** build `DurableDispatchStrategy`, `SupabaseDispatchPersistence`, `pending_resumes` + claim RPC, the per-step checkpoint, direct-reinvoke + sweep *logic*, idempotency — all runnable against Postgres from the **Node backend** (no Worker needed). The BE can drive a durable run end-to-end for tests. This isolates the hard durability logic from the host move.
- **4b (host):** `packages/worker`, `wrangler.toml`, Hyperdrive, the scheduled cron trigger, `execute-tool` fold-in, Workers-compat verification, and the `edgeFunctionClient` flip.

## 12. Future-proofing (stages 2–3, deferred but accommodated)

Cheap structural choices made now so concurrent execution is an **extension, not a rewrite**:
- **`listPending` returns a collection** → "one pending child" (RU4) and "N pending children" (stage 3) are the same shape.
- **Executions addressed by `execution_id` in a tree** (never "stack top") → any live execution is resumable/addressable.
- **"Input source" per execution** — *who* feeds its next message: **real user** (RU4's active leaf) vs **the parent** (stage 2, parent-as-user). RU4 only uses "real user"; naming the concept now makes stage 2 "add a source kind," not a re-architecture.

## 13. Tests

- **4a (Node, the bulk):** per-step checkpoint + resume-from-next-step (no completed-step re-run); each suspend reason → correct trigger; direct re-invoke fires; cron sweep claims only stale rows; idempotency-key dedupe (double trigger → one run); tool-result-persisted-before-advance (resume doesn't re-fire); `DurableDispatchStrategy` parity with `SyncRecurseStrategy`'s child-injection; active-leaf routing; depth cap at the configured N; a multi-invocation hours-style run simulated by forcing budget suspends.
- **4b:** Workers-compat smoke (core + RU1 import + run clean on the Workers runtime / Miniflare); Hyperdrive connectivity; the scheduled handler; `execute-tool` fold-in parity; the `edgeFunctionClient` flip.
- `npm run check` + suites green. The **user's end-to-end gate** (pre-merge) must exercise a real durable suspend/resume across Worker invocations (the path validated late, per [[ru-unification-merge-strategy]]).

## 14. Affected paths (selection)

- New: `packages/worker/**`, `packages/api/src/capabilities/{dispatchStrategy,dispatchPersistence}.ts` durable impls (or `packages/backend` if the impls live BE-side and the Worker imports them), `supabase/migrations/<ts>_reintroduce_pending_resumes.sql`, `supabase/migrations/<ts>_*` for any per-step columns.
- Edited: `packages/api` core (per-step persistence hooks on the loop callbacks; `maxDispatchDepth` → 3 single const), `routes/execute/executeCore*.ts` (durable path generalized / superseded by the Worker), `edgeFunctionClient.ts` (→ Worker URL), `routes/execute/executeCoreHelpers.ts`/`executePersistence.ts` (per-step writes).
- Deferred to RU6: deleting `supabase/functions/execute-agent/` + `execute-tool/`.

## 15. Risks / open questions

- **Per-step write volume.** Persisting every step (vs. batch-at-end) multiplies DB writes. Hyperdrive keeps them ~ms; acceptable, but watch p99 and Postgres tier sizing (a stated §10.4 requirement).
- **Workers compatibility of the RU3 core + RU1 package.** Asserted (pure JS, no native addons) but only *proven* in 4b — a stray Node API (`Buffer`, `crypto` Node form, `process`) would surface here. 4b's first task is a Workers smoke import.
- **Direct re-invoke from inside a Worker** (self-`fetch` via `waitUntil`) — confirm CF allows/within limits; the cron backstop covers any failure.
- **Hyperdrive vs. Supabase pooler** — Hyperdrive recommended (connection pooling + edge caching for stateless Workers); confirm it fronts the service-role path the durable writes need.
- **`maxChildRuntimeMs` (1h active) — RESOLVED: persisted per-execution accumulator.** Each execution carries `agent_executions.accumulated_active_ms` (keyed by `execution_id`), incremented by each invocation's active ms on suspend/checkpoint and checked on resume; exceeding `maxChildRuntimeMs` terminates *that* execution with `ChildResult` `timeout`. **Per-execution, NOT shared** — 5 sibling children each get their own independent 1h (not 1h split among them), independent of the parent. Lives on the same `agent_executions` row as `resume_marker`.
- **The two-phase boundary** — if 4b's Workers-compat surprises balloon, 4a still stands alone (durable execution proven in Node); 4b can iterate without blocking the durability logic.

## 16. Local development

Cloudflare's equivalent of `supabase functions serve` is **`wrangler dev`** — it runs the Worker on `localhost:8787` using **`workerd`** (the *same* runtime as production, via Miniflare), so local behavior matches prod (not a Node shim). Dev workflow:
- **Three side-by-side processes:** the web app, the Node BE (`npm run dev`), and `wrangler dev` in `packages/worker`.
- **Postgres/Hyperdrive:** give the Hyperdrive binding a **local connection string** in dev, so the Worker connects **directly** to local/dev Postgres (no Hyperdrive proxy locally); prod uses the real Hyperdrive binding. Hyperdrive is transparent — real in prod, a plain connection locally.
- **BE → Worker:** an env var points `edgeFunctionClient` at `http://localhost:8787` in dev (the deployed Worker URL in prod), so the local BE invokes the local Worker exactly as prod does.
- **MCP pool** stays on the BE (`/internal/mcp/*`) — the local Worker calls the local BE.
- **Cron backstop:** fire the `scheduled()` handler on demand via `wrangler dev`'s scheduled trigger (`--test-scheduled` / the local trigger endpoint), no waiting for a real cron tick.
- **Tests:** the same `workerd`/Miniflare runtime runs programmatically (`@cloudflare/vitest-pool-workers` or Miniflare) — this is the Task-14 Workers-compat smoke that proves the RU3 core + RU1 package import/run clean on the real runtime, not just Node.

## 17. Durable SSE delivery — publish + event log (Worker side)

A durable run spans many Worker invocations over hours, and the client's SSE connection drops/reconnects — so SSE is **two-tier**: a live pub/sub path (real-time chat UX) and a durable log (resume). RU4 owns the **producer** side:

- **Live path (real-time):** the Worker buffers `ExecutionEvent`s (esp. token deltas) and **flushes every ~50ms** to a BE endpoint **`POST /internal/events/publish`**, which publishes to **Redis Cloud pub/sub** (channel = `execution_id`) — reusing the existing `redisCompletionNotifier` (ioredis/TCP) pattern. **Not Upstash** (REST can't `SUBSCRIBE`; Redis Cloud is the documented pub/sub provider — `messaging/services/redis.ts`). The Worker holds **no** Redis connection; batching keeps the hop to ~20 flushes/s. (Escape hatch if lower latency is ever needed: Worker `connect()` TCP `PUBLISH` direct to Redis Cloud.)
- **Durable log (resume):** the per-step persistence (§6) **is** the event log — give each persisted event a monotonic **`seq`** per `execution_id`. **Persisted (durable):** completed LLM messages, **token usage** (counts/cost — this powers the FE cost dashboard today and must stay persisted), tool calls, tool results, node/child events, terminal. **Live-only (not persisted):** the **raw incremental text streaming deltas** (the typing animation) — on reconnect the client gets the *completed* message + its persisted token count, not a token-by-token replay. Pub/sub is fire-and-forget, so the Postgres log is the backstop that makes any lost live message recoverable.
- **No client exposure of the Worker:** the Worker never talks to the FE; it publishes to Redis (via the BE) and persists to Postgres. The BE remains the only client-facing SSE boundary (RU5 §-delivery).

## 18. Builtin tools on the Worker, web tools, and triggers

Three integrations the original RU4 draft didn't cover (the web-tools + triggers features postdate it):

- **`invokeWorker` — the single BE→Worker entry** (decision: new explicit invoker). RU4 introduces `invokeWorker(...)` as the one place the BE starts/resumes a Worker run (replacing the legacy `executeAgentCore`/`executeCore*` orchestration, which RU6 deletes **entirely**). **Both** `handleExecute` (the public API) and the **triggers fire path** call it. It accepts the run input + an optional **`triggerRunId`**.
- **Builtin tool bundle-preparers move to the Worker via ONE shared portable module** (decision: shared module). Today the per-host preparers (`toolBuilder.ts` `PREPARERS` that wire `ctx.services(...)` for kv/rag/forms/web/composition) are edge-only. RU4 extracts them into a **portable module** (in `packages/api`, alongside the RU1 factories) used by **both** the Worker (prod) and the sim driver (RU3) — no Node/Deno duplication, matching how RU1 unified the store services.
- **Web tools (`openflow/web`/Tavily) run in the Worker** (decision: Worker binding, direct call). The portable `providers/web` factory is already Workers-clean; RU4 adds **`TAVILY_API_KEY` as a Worker binding** (`wrangler.toml`) and a Worker-side `makeWebService({ apiKey: env.TAVILY_API_KEY })` (porting the Deno `webServices.ts`). The Worker calls Tavily **directly** (in-process `fetch`) — no `/internal/web` hop. The key now lives on Cloudflare as well as Fly.
- **Trigger outcome recorded by the Worker** (decision: pass `triggerRunId`). The trigger fire path becomes **fire-and-forget at the BE**: it `invokeWorker(input, { triggerRunId })` and returns (no `await`-to-completion, no connection hold). When the run reaches a **terminal** state (not a suspend), the Worker writes `trigger_runs.status` (`succeeded`/`failed` + error) for that `triggerRunId`; if no `triggerRunId` was passed (a normal API/message run), it does nothing. This keeps per-occurrence trigger run-history correct under durable/suspendable runs without a BE completion-subscription. The Cloud Tasks scheduler + `agent_triggers`/`trigger_runs` tables + at-most-once are otherwise untouched and orthogonal to the durable-resume (`pending_resumes`) machinery.
