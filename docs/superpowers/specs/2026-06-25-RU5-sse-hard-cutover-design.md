# RU5 — SSE hard cutover — design

**Date:** 2026-06-25
**Status:** Design approved; pending implementation plan.
**Part of:** Runtime-unification decomposition — sub-project **RU5** (`2026-06-23-runtime-unification-OVERVIEW.md`). North-star: `2026-06-19-runtime-unification-design.md` §6.6.
**Depends on:** RU3 (sim emits `ExecutionEvent` + the superset union + emitter-completeness assertion), RU4 (prod emits `ExecutionEvent`). Consumed by RU6 (final deletions).
**Context:** no prod users, solo dev, `main` frozen ([[ru-unification-merge-strategy]]) — a breaking, alias-free hard cutover across all consumers is fine.

## 1. Intent

The real consumer map (the earlier draft mislabeled `api.ts` as "prod"):
- **Prod public SSE** (`handleExecute` → `executeAgentCore`; `node_visited`/`node_processed`/`done`) — consumed by **external API customers** and the **embedded widget** (`packages/widget`, its own *vendored* `PublicExecutionEvent`). This is the **public boundary**.
- **Sim — agent** (`agentSimulationApi.ts` → `simulateAgentHandler`; `AgentSimulationEvent` / `child_*`).
- **Sim — workflow** (`api.ts` `streamSimulation` → `simulateHandler`; legacy `node_*`). The FE wrongly *chooses* agent-vs-workflow today (two stream fns); that decision **moves server-side**.
- Inside prod, an **internal→public converter** (`executeTypes.ts` internal vs public shapes).

RU5 unifies the **internal** surface to **one superset `ExecutionEvent` + one serializer** (sim consumers + the runtime emitter), and **keeps a curated `PublicExecutionEvent` at the public boundary (decision B)** via **one `ExecutionEvent → PublicExecutionEvent` projection** at the BE serve step (§4b) — so the widget + external API stay a stable contract insulated from internal event churn. The per-runtime **internal→public converter is deleted** (that was divergence, not a boundary). Both runtimes already *emit* `ExecutionEvent` (RU3 sim — now both agent and workflow engines, RU4 prod), so RU5 = **the wire serializer + the one public projection + the consumer migrations + the deletions**, with a **single sim API + single prod API, BE-routed by execution type**.

## 2. Scope

**In:**
- `executionEventSse.ts` — the single `ExecutionEvent → SSE` serializer (replaces every current internal writer/adapter).
- **Decision B — public boundary:** keep a curated `PublicExecutionEvent`; add **one `ExecutionEvent → PublicExecutionEvent` projection** at the BE serve step (§4b). The widget + external API keep the stable public shape (the widget is **not** rewritten to `ExecutionEvent`).
- **Single sim API + single prod API, BE-routed by execution type** — the FE stops choosing agent-vs-workflow (today's `streamAgentSimulation` vs `streamSimulation` collapse to one call).
- Migrate the **internal** consumers to `ExecutionEvent`: the sim-agent path **and** the sim-workflow path (`simulateHandler`'s workflow engine moves onto the unified core per RU3, emitting `ExecutionEvent`).
- Delete the legacy shapes + the internal→public converter + the **RU3 throwaway bridge** (`executionEventToSim` + the temporary sim-state event extension in `simulateAgentTypes.ts`).

**Out:**
- The runtime **emitter** — built in RU3/RU4; RU5 only serializes + consumes it.
- An **automated per-consumer verification harness** — explicitly dropped (manual verification — §7).
- The final dead-code deletion of the legacy orchestrators / edge runtime — RU6 (RU5 deletes only the SSE-shape/writer code it directly replaces).

## 3. Three vocabularies → one

RU5 uses RU3's superset `ExecutionEvent` union as the **single** vocabulary. It is the union of every event + field the three current emitters produce, so the cutover **loses no features** — per-node tokens, durations, reasoning, structured output, per-node (non-fatal) errors, `child_dispatched`/`child_finished`/`child_awaiting_input`, the sim-state events (`simulation_state_patch`/`simulation_state_snapshot`), `execution_complete`/terminal, top-level `error`, and the `depth` needed for nested rendering. The old per-shape type strings (`text`, `toolCall`, `tokenUsage`, `nodeError`, `child_waiting`, `node_processed`, …) are **replaced**, not aliased.

## 4. The serializer

`executionEventSse.ts` — one function, the only place `ExecutionEvent` is written to the wire:
- Format: `data: <JSON.stringify(event)>\n\n`, where the JSON carries the discriminating `type` field (matches the existing `SSE_DATA_PREFIX = 'data: '` + `JSON.parse` parse in `api.ts`, so the parse side is uniform).
- Used by both runtimes' HTTP handlers (the prod Worker/BE response stream and the sim handler) — no per-**runtime** adapter. The **only** internal/public boundary is the deliberate **public projection** (decision B): at the public edge the BE first maps `ExecutionEvent → PublicExecutionEvent`, then serializes that; internal consumers serialize `ExecutionEvent` directly.

## 4b. Durable SSE delivery — BE serve + FE (two-tier)

Under RU4's durable model a run spans many Worker invocations over hours and the client connection drops/reconnects, so prod SSE is **not** a piped Worker stream — the BE serves from a live pub/sub + a durable log. (Sim is in-process, so it serializes directly to its response; this section is the **prod** path.)

- **The BE stays the only client-facing SSE boundary** — the Worker URL is never exposed. The FE consumes SSE exactly as today (`fetch` + `ReadableStream`, `data:` lines — `api.ts`, the widget's `sseReader.ts`); **nothing changes on the wire FE-side**, only the BE's *source* of events.
- **Serve:** on the FE's `POST`, the BE handler (any instance — **no sticky routing**, Redis fan-out makes every instance equivalent) authenticates, resolves the active-leaf `execution_id`, **subscribes to Redis Cloud channel `execution_id`** (RU4 §17), triggers the Worker, and writes each event as **`id: <seq>\ndata: <JSON>\n\n`** to the held response until the turn suspends/terminates.
- **Resume (manual — `fetch`, not `EventSource`):** the FE tracks the last `seq`; on reconnect it sends it (header/query), the BE **replays the gap from the Postgres event log** (RU4 §17), then re-subscribes to Redis for live. Token deltas are best-effort (not persisted); the completed message is recovered from the log.
- The serializer (§4) reads from the **Redis subscription / log**, not a live Worker pipe.

### 4b.1 Liveness + failover (long runs, BE-instance death)

A run can last 30+ minutes for a single answer. The execution lives in the **Worker + Postgres, independent of any BE instance** — the SSE connection only *attaches* to its event stream.

- **Trigger vs attach:** a user *message* triggers/resumes the durable Worker run; an SSE *(re)connect* only attaches to that run's stream — it never re-runs the agent.
- **Long-run liveness:** continuous events keep the connection warm; for quiet gaps (a slow tool) the BE sends **SSE heartbeat comments** (`: ping\n\n`, ~15–30s) so LBs/proxies don't idle-kill it. A single 30-min HTTP connection is still fragile, so resumption is the safety net, not the exception.
- **BE-instance failure = non-event for correctness:** the Worker keeps running and keeps publishing to Redis + persisting to Postgres. The FE's dropped connection **reconnects with its last `seq`**, lands on **any healthy instance** (no sticky routing), which **replays the gap from the Postgres log** then re-subscribes to Redis. Events published to Redis *during* the crash window (no subscriber → lost from Redis, fire-and-forget) are **recovered from Postgres** — **no durable event is lost**. The only casualty is the live typing animation of the one mid-stream message, which is re-rendered **complete** from the log.

## 5. Consumer migrations (full rename, no aliases)

**Internal consumers → `ExecutionEvent` (full rename, no aliases):**
- **Sim — agent** (`agentSimulationApi.ts` + `sseSimComposition.ts` + `compositionMachine.ts` + `useSimulationSend.ts`): consume `ExecutionEvent` directly; the **sim-state events become first-class** (no longer via the RU3 bridge's temporary extension). `child_waiting` → `child_awaiting_input`, etc.
- **Sim — workflow** (`simulateHandler` + `api.ts` `streamSimulation`): the **workflow engine moves onto the unified core (RU3)**, emitting `ExecutionEvent`; `api.ts`'s legacy `node_*` parsing is replaced. **The two FE sim stream fns collapse into one** call to the single sim API, and **the BE routes agent-vs-workflow by type** (the FE no longer decides — mirroring prod's `executeAgentCore`).

**Public boundary (decision B) — NOT rewritten to `ExecutionEvent`:**
- **Widget** (`packages/widget/src/ui/useChatStream.ts`) + external API **keep their curated/vendored `PublicExecutionEvent`**. The BE serve step (§4b) projects `ExecutionEvent → PublicExecutionEvent`, so the widget is **untouched on the wire** — only the BE's projection is new. This is decision B: a stable public contract, not internal-event exposure.

## 6. Deletions

- The **internal** SSE event types in `routes/execute/executeTypes.ts` and the **internal→public converter** (`executeHelpers`). **Keep `PublicExecutionEvent`** (decision B) — it's now produced by the `ExecutionEvent → PublicExecutionEvent` **projection** at the serve step instead of the deleted converter (relocate it to the projection module; the widget's vendored copy stays its source of truth).
- The sim `AgentSimulationEvent` union + `routes/simulateAgentSse.ts` writer.
- The **RU3 throwaway bridge**: `executionEventToSim` (and its test) + the two temporary `simulation_state_patch`/`simulation_state_snapshot` members RU3 added to `AgentSimulationEvent`.
- Any per-runtime `ssePublicAdapter`/`sseSimulationAdapter` scaffolding (north-star §6.6 says these are never built; if any crept in, delete).

## 7. Verification (manual — no harness)

Per decision, RU5 ships **no automated per-consumer render harness**. The author verifies each consumer manually (tokens, durations, structured output, per-node errors, `child_awaiting_input`, sim-state, `depth`) against the three live surfaces and fixes regressions as found. The **RU3 emitter-completeness assertion stays** — it's a cheap emitter-side unit test (the emitter produces every field), distinct from a consumer harness, and it catches a *missing* superset field at the source. The hard cutover has no fallback, so this manual pass is the safety step before RU6 deletes anything further.

## 8. Tests

- **Serializer unit tests:** every `ExecutionEvent` variant serializes to a well-formed `data: …\n\n` line; round-trips through the consumers' `JSON.parse`.
- **Consumer parse tests** (light, not a full render harness): each consumer's reducer maps each `ExecutionEvent` type to its UI state without throwing/falling through (replacing the deleted per-shape parse tests).
- The RU3 emitter-completeness assertion is retained.
- `npm run check` + suites green. Manual cross-consumer verification (§7) before RU6.

## 9. Affected paths (selection)

- New: `packages/*/…/executionEventSse.ts` (single serializer — lives where both runtimes' handlers can import it; likely `packages/api` events or a shared module).
- Edited: `web/app/lib/api.ts`, `web/app/lib/sseSimComposition.ts`, `web/app/hooks/compositionMachine.ts`, `web/app/hooks/useSimulationSend.ts`, `packages/widget/src/ui/useChatStream.ts`, the prod + sim HTTP handlers (emit via the serializer).
- Deleted: `routes/execute/executeTypes.ts` SSE shapes + the internal→public converter, `routes/simulateAgentSse.ts`, `AgentSimulationEvent`, the RU3 `executionEventToSim` bridge + its temporary sim-state members + test.

## 10. Risks / open questions

- **Hard cutover, no fallback + no automated harness** — a missed consumer mapping silently drops a feature until manual verification catches it. Mitigated by the retained emitter-completeness assertion (source-side) + the manual pass; acceptable given no prod users.
- **Widget coupling** — least-explored consumer; confirm it's on the same SSE stream/shape and not a separate transport before the rename.
- **Serializer location** — must be importable by both the Worker (RU4) and the sim BE handler without pulling Node-only or Workers-only deps; place it in a neutral package (api events module).
- **Ordering vs RU6** — RU5 deletes only the SSE shapes/writers it replaces; the broader orchestrator/edge deletion stays in RU6 so RU5 remains a focused, reviewable cutover.
