# RU Migration — Open Issues & Follow-ups

**As of 2026-07-01.** Branch `feat/migration`. RU1 ∥ RU2 ∥ RU3 are **implemented, reviewed, and green** (api 614 / backend 815+4skip / web 157 / shared-store-services 47 tests; typecheck 0; lint 0 across api/backend/web). The branch is **NOT merged** — per the RU strategy it merges only after RU1–6 are done + the user's end-to-end test passes.

**Context / framing:** by design, RU1–3 deliver *foundations proven in simulation only* — production still runs the legacy Deno/edge path. The headline payoffs (durable hours-long runs, one SSE vocabulary, no duplicated code) are owned by **RU4 (durable + Worker host)**, **RU5 (SSE hard cutover)**, **RU6 (dead-code deletion)**. So most items below are *deferred-by-design*, not defects. The two that need attention now are the **P1 validation gap** and deciding when the **MCP pool** goes live.

Detailed source: `.superpowers/sdd/ru3-task-21-gate-report.md` and the RU3 section of `.superpowers/sdd/progress.md`.

---

## 🔴 P1 — Validate before starting RU4

### ISSUE-1: FE composition model mismatch (inline single-stream vs multi-stream)
- **What:** RU3's sim runs child-agent dispatch **inline on a single stream** (`syncRecurseStrategy` runs the child inside `executeTurn`; bridged `child_finished` currently drains *after* the turn returns). The current FE (`useSimulationSend.ts:144`, `compositionMachine`, `useAutoResumeParent`) assumes the **multi-stream** model: parent *stops* at dispatch and the FE opens a *fresh* stream on `child_finished`. Against a single inline stream this implies **double child execution + double resume + content misrouted** to the child level.
- **Why it's not auto-caught:** every unit test is green — it's a streaming-model mismatch that only shows in a live child-dispatch simulation.
- **Important nuance:** RU4's *production* dispatch is **suspend/resume** (parent suspends at dispatch), which actually *aligns* with the current multi-stream FE. So ISSUE-1 is largely an artifact of using the *inline* sim strategy behind a FE built for suspend/resume. RU5 rewrites the FE/SSE path entirely (deletes the bridge, cuts FE to `ExecutionEvent`), so the *proper* fix lives there — **do NOT hand-fix the FE now (throwaway work).**
- **Action (before RU4):** run an **end-to-end child-agent-dispatch simulation** to diagnose:
  - Core produces correct *results*, only FE *renders* wrong → core validated, proceed to RU4, log FE reconciliation for RU5. If the bridge emits `child_finished` at the wrong position, the cheap fix is **backend/bridge-side** (stream events live instead of batching at end-of-turn), not an FE rewrite.
  - Core is *semantically* wrong (wrong result / double exec / corrupted state) → fix the core in `packages/api` **before** RU4 (RU4 retrofits this exact core onto prod).
- **Owner/when:** validate now; FE reconciliation → RU5. Core fix (if needed) → now.

---

## 🟡 Decide: when does the MCP pool go live?

### ISSUE-2: RU2 MCP pool is built but dormant (no live borrow)
- **What:** RU2's pool + routes + `McpPoolClient` exist and are tested, but nothing borrows from it on a live path. The T21 gate found the sim driver passes a **throwing `mcpPoolStub`** (`simulationDriverHelpers.ts:86`); real MCP in sim still runs (and reconnects) via the engine's per-call path. So RU2's headline benefit (warm connection reuse) is currently **zero and unexercised against real traffic**.
- **Context:** RU2's plan deferred seam-injection to "RU3/RU4." RU3 half-did it — T17 built `simulationCapabilities` *with* the real pool by identity, but T18's driver then used the throwing stub instead.
- **Decision needed:** wire the pool live in **sim now** (prove it earlier) **or** treat it as **RU4's job** (RU4 hosts the runtime core in the Worker and wires real services). Either is defensible; RU4 is the natural home.
- **Owner/when:** RU4 (default) or a small sim-wiring task now.

---

## 🟠 P2 — Backend cleanups (before merge, not blocking RU4)

### ISSUE-3: `mcpPoolStub` throws on invoke
- **Where:** `packages/backend/src/routes/simulationDriverHelpers.ts:86`.
- **Fix:** make it a safe no-op returning an empty result (latent landmine if the driver ever calls `services.mcpPool` on the sim path). Superseded if ISSUE-2 wires the real pool.

### ISSUE-4: Dead code left behind the cutover
- `packages/backend/src/routes/simulateAgentHandler.ts` — no longer imported by `server.ts`.
- `simulationOrchestrator.runSimulationOrchestration` (+ `handleDispatch`/`runChild` recursion) — now dead; only `buildLoopConfig`/`buildLoopCallbacks` are reused.
- **Fix:** remove, or annotate as retained-for-RU5/RU6. (RU6 is the formal dead-code-deletion pass — safe to leave annotated until then.)

### ISSUE-5: Bridged SSE events don't flush incrementally
- **Where:** `writeBridged` uses raw `res.write` with no `flush` (unlike `writeSSE`/`writeAgentSSE`).
- **Impact:** state/child events won't stream incrementally (harmless today given end-of-turn batching + imminent `res.end()`, but inconsistent — and relevant if ISSUE-1's live-streaming fix lands).

### ISSUE-6: Shallow tests on the unified handler (load-bearing)
- **What:** `simulateHandlerUnified.test.ts` only asserts workflow *routing* + `simulation_complete` + agent zod-*rejection*. No test exercises the agent happy path, live content streaming, `child_dispatched`/`child_finished` ordering, or state snapshot/patch forwarding.
- **Fix:** add coverage for the parts most likely to regress (ideally alongside the ISSUE-1 E2E work).

---

## 🔵 RU4-scoped (fix when the durable path lands — currently sim-masked)

### ISSUE-7: `childExecutionId` collision on sequential same-turn dispatches
- **Where:** `packages/api/src/runtime/executeTurn.ts:40` — `childIdFor` returns `child-${dispatchDepth+1}`, constant for the whole `executeTurn` call.
- **Impact:** if a parent dispatches N children sequentially in one turn, all N share one id → breaks `dispatched↔finished` correlation. **Masked in sim** (identity comes from the rich `child_dispatched` callback; the placeholder never reaches the FE). Fix when RU4 plumbs real child execution IDs (or add a per-dispatch counter suffix).

### ISSUE-8: `orgId: ''` placeholder in the runtime
- **Where:** `packages/api/src/runtime/executeTurn.ts:64` — hardcoded `''`.
- **Impact:** masked in sim (overridden by `buildSimServices.resolveChildConfig` with the real `body.orgId`). RU4 must plumb the real `orgId` through the runtime itself.

---

## 🟣 RU5-scoped (the SSE cutover resolves these)

- The whole **throwaway bridge** (`executionEventBridge.ts` + the temporary `simulation_state_patch/snapshot` + workflow `child_finished` union extensions) is deleted by RU5. **ISSUE-1's proper FE reconciliation lives here.**
- **T8 carry-forward:** `SimStatePatch.value` shares a reference with internal sim-state (`patches()` copies the array but not each `patch.value`, so a consumer mutating `patches()[i].value` could corrupt live state; `read()`/`snapshot()` are safe). Relevant to whatever consumes patches under the new SSE model. (`packages/api/src/runtime/simStateStore.ts`.)

---

## ⚪ Deferred FE (product / data-availability decision)

### ISSUE-9: Two T19 components built but unmounted
- `TestingPresetsPopover` (needs tenant/preset data) and `McpSideEffectBadge` (needs per-tool `providerType`) were built in RU3-T19 but are not mounted anywhere — the required data isn't available at the panel level.
- **Action:** find the right host + data source, or defer to a later UI pass. Not blocking.

---

## Minor review carry-forwards (non-blocking, note-only)

- **T9:** `dispatchDepth` shipped optional (brief said required) — tighten once all construction sites thread depth. `conversationId` left in `ProviderCtxBase` (structurally present on the sim arm too; should be prod-arm-only). `buildCatalogProviderCtx` (`packages/backend/src/routes/agents/getRegistry.ts`) is a real prod ctx that doesn't set `environment:'production'` (sound via the optional default, but explicit is better).
- **T15:** no exhaustiveness `never`-guard on the `step` fall-through in `executeTurn`; the `simStore` snapshot branch + child `error`/`awaiting_input` re-inject paths are untested.
- **T4:** `SupabaseLike = Record<string, unknown>` is loose — narrow to the actual methods (`from`/`rpc`) once known.
- **T2:** emit-after-close guard is untested (behavior correct by inspection; branch cov 91.66%); `packages/api/package.json` `engines.node >=18` is inaccurate now that the code uses `Promise.withResolvers` (Node 22+).

---

## TL;DR next steps
1. **Run the E2E child-agent-dispatch simulation** (diagnoses ISSUE-1; validates the core before RU4).
2. Based on the result: proceed to RU4 (log FE reconciliation for RU5) **or** fix the core first.
3. Decide ISSUE-2 (pool live in sim now vs RU4).
4. P2 cleanups (ISSUE-3/4/5/6) any time before merge; ideally fold ISSUE-6 tests into the E2E work.
