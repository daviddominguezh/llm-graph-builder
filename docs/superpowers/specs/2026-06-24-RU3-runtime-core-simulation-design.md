# RU3 — Runtime core + simulation driver — design

**Date:** 2026-06-24
**Status:** Design approved; pending implementation plan.
**Part of:** Runtime-unification decomposition — sub-project **RU3** (`2026-06-23-runtime-unification-OVERVIEW.md`). North-star: `2026-06-19-runtime-unification-design.md` §6, §9, §10, §12, §13.
**Depends on:** RU1 (`shared-store-services` → the ProviderCtx services resolver), RU2 (`McpPoolClient` → `RuntimeServices.mcpPool`). Consumed by RU4 (prod Worker) and RU5 (SSE cutover).
**Context:** no prod users, solo dev, `main` frozen — hard cutovers mid-branch are fine; the whole RU1–6 line is validated end-to-end before merge ([[ru-unification-merge-strategy]]).

## 1. Intent

Today the **inner** execution engines live in `packages/api`, but the **outer** orchestration — child dispatch, the `ChildResult` injection loop, event emission, await-input handling — is **duplicated** between simulation (`simulationOrchestrator.ts` for agents, `simulateHandler.ts` for workflows) and production (the Supabase edge handler). RU3 lifts that outer orchestration into **one core in `packages/api`**, parameterized by the runtime seams, and **migrates the simulation drivers onto it first** (the low-risk runtime: sync, ephemeral, no Worker, no durability). Production stays on the legacy edge orchestrator until RU4 — a **bounded two-cores window**.

**Two engines, one core.** There are **two distinct execution engines**: the **agent loop** (`executeAgentLoop` — conversational LLM→tool→repeat; *not* graph-based) and the **workflow graph** (`executeWithCallbacks` — node/edge traversal; emits `node_visited`/`node_processed`). The core is **engine-agnostic**: it drives a **`StepMachine`** abstraction where a *step* is one LLM request (agent) or one node (workflow), plus tool calls. Two implementations — `AgentStepMachine` (wraps `executeAgentLoop`) and `WorkflowStepMachine` (wraps `executeWithCallbacks`) — and the core picks the engine **by execution type, server-side** (mirroring prod's `executeAgentCore`, which already routes by `appType`). The FE never chooses agent-vs-workflow. Child dispatch lets either engine invoke the other (interchangeable).

## 2. Scope

**In:**
- The core: `executeTurn` + `childDispatch` driving a **`StepMachine`** (`AgentStepMachine` wrapping `executeAgentLoop` + `WorkflowStepMachine` wrapping `executeWithCallbacks`), **engine chosen by type server-side**; `RuntimeCapabilities` (5 seams) + `RuntimeServices`; env-discriminated `ProviderCtx`; `ChildResult`; `DispatchStrategy`/`DispatchPersistence` **contracts**; `ExecutionEvent` emitter (superset).
- The **simulation drivers — both agent and workflow** — on the core, behind **one sim API** (the BE routes agent-vs-workflow, the FE does not): `SyncRecurseStrategy` + `NoopPersistence` + console/no-op caps; the `ExecutionEvent → today's sim-SSE` **temporary bridge**. (`simulateHandler`'s workflow path moves onto the core here — it was previously left on the legacy `node_*` engine.)
- Sim-state model (§9 north-star): sole-writer, deep-freeze, write-side clone, display-only patches + terminal snapshot.
- Per-tool simulation seam: shared `simulatedNoop`; MCP "real side-effects" badge.
- Sim FE UX: testing-presets popover, sim-state panel, reset / tenant-switch modals (+ translations).

**Out:**
- **Running** `DurableDispatchStrategy` / `SupabaseDispatchPersistence` — defined here, first executed in **RU4**.
- The **production** migration off the edge — **RU4**.
- The **SSE consumer cutover** (production API / sim panel / widget) + deleting the bridge — **RU5**.
- Bespoke per-tool simulation behavior (every builtin returns the shared no-op now; real per-tool sim deferred uniformly).
- Deleting the legacy sim/edge orchestrators — **RU6**.

## 3. The contract (north-star §6.3/§6.4/§10 — implemented here)

```ts
// 5 genuinely per-runtime seams — the driver injects these.
interface RuntimeCapabilities {
  persistence: DispatchPersistence;   // prod: durable (DB) | sim: no-op
  dispatch: DispatchStrategy;         // prod: durable suspend/resume | sim: sync recursion
  observability: Observability;       // prod: structured/OTel | sim: console
  rateLimit: RateLimiter;             // prod: per-tenant token-bucket | sim: no-op
  logger: RunnerLogger;               // prod: structured | sim: console
}

// Shared services — identical in both runtimes, wired once from config (NOT seams).
interface RuntimeServices {
  mcpPool: McpPoolClient;                                   // RU2 — BackendMcpPoolClient in both
  resolveChildConfig: (...) => Promise<ResolvedChildConfig>; // the real child seam (see below)
  supabase: SupabaseClient;                                 // service-role; only the env source differs
}
```

> **Corrected against the code:** the north-star named this seam `loadChildAgentGraph: (agentId) => Promise<AgentGraph>`, but **there is no `AgentGraph` type**. The real seam is `resolveChildConfig(...) => Promise<ResolvedChildConfig>` (`simulateChildResolver.ts`, `ResolvedChildConfig` at line 9), already used by the sim handler. RU3 ports that resolver into `RuntimeServices`. (RU4 confirms it covers the production child-load path.)

No `oauthResolver` seam (the RU2 pool owns MCP OAuth). No `DispatchNotifications` (durable resume replaces in-process callbacks). RU1's builtin store services stay on the existing `ProviderCtx` **services resolver closure** — they are providers, not `RuntimeServices`.

**`ChildResult`** (terminal envelope; suspension is a separate `DispatchOutcome`):

```ts
type ChildResult =
  | { status: 'finished'; result: string; outcome: 'success' | 'error' }
  | { status: 'awaiting_input'; partial: string }
  | { status: 'error'; code: ChildErrorCode; message: string };
```

The one env-aware mapping row: END-without-`finish` → **sim** `awaiting_input` (interactive pause), **prod** `finished` (has text) or `error: no_result`. `finish` exists only in child context.

## 4. Core structure — wrap, don't rewrite

Both engines (`executeAgentLoop`, `executeWithCallbacks`) stay; the core wraps them behind a `StepMachine` interface (`advance()` runs the next step; reports a step result, a dispatch decision, awaiting-input, or terminal). RU3 adds:

- **`StepMachine` + two adapters** — `AgentStepMachine` (a step = one `executeAgentLoop` LLM-request/tool-call; the dispatch decision surfaces on `AgentLoopResult.dispatchResult`) and `WorkflowStepMachine` (a step = one `executeWithCallbacks` node; dispatch surfaces on `CallAgentOutput.dispatchResult`). The core **selects the engine by execution type, server-side**.
- **`executeTurn`** — the per-turn entry: builds the env-discriminated `ProviderCtx`, **selects the `StepMachine` by type**, runs it, and drives the dispatch loop to completion (or suspension, in RU4). Returns `RuntimeOutput` (`{ events: AsyncIterable<ExecutionEvent>, finalResult }`).
- **`childDispatch`** — when the `StepMachine` **yields a dispatch decision**, `childDispatch` runs it through `RuntimeCapabilities.dispatch` (the `DispatchStrategy`), maps the child's termination to a `ChildResult`, **re-injects** it, and resumes the parent. Because dispatch is `StepMachine`-level, an agent can dispatch a workflow and vice-versa (interchangeable).

> **Corrected against the code:** the dispatch decision surfaces on **`AgentLoopResult` from `executeAgentLoop`** (not on `executeAgent`/`AgentExecutionResult`, which is the per-attempt executor). RU3 wraps the **loop**. The re-injection loop does not exist in `packages/api` today — it lives in the backend `simulationOrchestrator` and is ported in. The **child-result injection logic is shared** by both strategies; only what happens *between dispatch and result* differs (sim runs inline → `completed`; prod persists → `suspended`). This means RU3 exercises the bulk of the dispatch seam even though only the sync branch runs here.

`maxDispatchDepth = 3` (a single configurable variable, sound for any N — see RU4), `maxChildRuntimeMs = 1h` (active execution time).

## 5. `ExecutionEvent` emitter + temporary sim-SSE bridge

The core emits the **superset** `ExecutionEvent` union (§6.6) directly — per-node tokens, durations, reasoning, structured output, per-node non-fatal errors, `depth`, `child_dispatched`/`child_finished`, and the sim-state events (§6). During RU3, the **sim handler converts `ExecutionEvent` → today's sim-SSE shape** (a throwaway bridge); the FE/widget/production-API consumers are untouched until RU5's hard cutover.

> **Bridge must carry the two sim-state events.** Today's sim-SSE union (`simulateAgentTypes.ts`) has **no** `simulation_state_patch`/`simulation_state_snapshot`. Since the §8 sim-state panel ships in RU3, the throwaway bridge is **extended with exactly those two event types** (a trivial union addition) so the panel is functional in RU3 — *not* dropped to RU5. Everything else stays on the old shape until RU5's full cutover.

**Early-validation guard (de-risks the late-cutover tradeoff):** RU3 includes a test asserting the emitter produces **every field each of the three RU5 consumers will need** — even though nothing consumes them yet — so a missing superset field surfaces here, not in RU5.

## 6. Simulation state model (north-star §9)

- **Runtime is the sole writer.** Sim state is FE-owned but the runtime holds the single authoritative copy *during a run*.
- **Immutability discipline:** state is deep-`Object.freeze`d at the `ProviderCtx` boundary; writes go through a write-side **deep-clone** (never mutate the frozen object). Enforced with the `DeepReadonly` type + the no-`as` ESLint rule.
- **Display-only patches:** a sim-panel mutation applies to the runtime's authoritative copy and emits a **display-only** `simulation_state_patch` event; the FE renders it live but **never reconstructs authoritative state from patches**.
- **Terminal authoritative snapshot:** on run completion the runtime emits the full `simulation_state_snapshot`; the FE **replaces** its copy with it — the only thing that updates FE authoritative state, so a lost patch self-corrects.
- **Abort:** a stopped run emits **no** snapshot; the FE discards optimistic patches and keeps the last committed snapshot (the pre-run state) — never a half-mutated FE.
- **Test:** a tool attempting to mutate `ctx` state throws (proves the freeze).

## 7. Per-tool simulation seam + MCP badge (§13, §12.4)

- The seam ships now: `if (ctx.environment === 'simulation')` in each builtin → a **shared `simulatedNoop`** (no side-effect, no state write) for *every* builtin (forms/lead-scoring included). This makes tools visible to the LLM in sim (today forms/LS are silently absent) without per-tool behavior. Bespoke per-tool sim behavior is a deliberate, permanent extension point, deferred uniformly.
- **MCP "real side-effects" badge:** MCP tools fire real side effects even in sim (the pool always connects to the real server); the sim UI surfaces a badge so the user knows those calls are real, not simulated.

## 8. Simulation FE UX (distinct workstream within RU3)

Testing-presets popover, a sim-state panel (renders `simulation_state_patch` live + the terminal snapshot), reset and tenant-switch modals — all with translations. *(Self-contained enough to land as its own slice if the core/driver ships first; kept in RU3 per the OVERVIEW.)*

## 9. Validation

RU3's gate is its **own behavior tests** on the sim driver running on the new core — not a comparison against the legacy orchestrator (we go with the new behavior). Coverage: the dispatch loop + `ChildResult` mapping (all rows incl. `awaiting_input`/`no_result`), `maxDispatchDepth`, the sim-state freeze + patch/snapshot/abort semantics, the per-tool `simulatedNoop` seam, the MCP badge, and the emitter-completeness assertion (§5). `npm run check` + suites green. The bounded two-cores window (sim on new core, prod on legacy edge) carries no prod-user risk (no prod users, frozen `main`).

## 10. Affected paths (selection)

- New (api core): `packages/api/src/core/{executeTurn,childDispatch,dispatchStrategy,childResult}.ts`, `runtime/{capabilities,services}.ts`, `events/executionEvent.ts` (the superset union + emitter), `simulation/{syncRecurseStrategy,noopPersistence}.ts`.
- Edited: `agentExecutor.ts` (expose the dispatch-yield seam cleanly), `providers/provider.ts` (env discriminant on `ProviderCtx`), each builtin `buildTools.ts` (the `simulatedNoop` seam), `simulationProviderCtx.ts` / `simulationServicesResolver.ts` (construct caps/services for the core).
- Edited (backend sim handler): `simulationOrchestrator.ts` → thin driver over `executeTurn` + the `ExecutionEvent → sim-SSE` bridge.
- New/edited (web): sim-state panel, testing-presets popover, reset/tenant-switch modals, MCP badge + i18n.
- Deferred: durable strategy execution (RU4), SSE consumer cutover + bridge deletion (RU5), legacy-orchestrator deletion (RU6).

## 11. Risks / open questions

- **Two cores window** — bounded to RU3+RU4; no prod-user risk here (frozen main, no users). The only cost is solo dual-maintenance; mitigated by RU3's behavior tests.
- **Durable path is contract-only in RU3** — `DurableDispatchStrategy` is defined but first *run* in RU4; the shared child-result injection logic is what RU3 validates. A durability bug surfaces in RU4 (caught by the user's end-to-end gate before merge).
- **Sim-SSE bridge is throwaway** — built here, deleted in RU5. Accepted to keep RU3 decoupled from the 3-consumer cutover; the §5 completeness assertion buys early superset validation cheaply.
- **Freeze/clone discipline** — easy to get subtly wrong (one missed freeze → silent shared-state mutation); the `DeepReadonly` + no-`as` rule + the §6 mutation test are the guardrails.
- **`executeAgent` dispatch-yield seam** — the inner/outer boundary must be extracted cleanly so both strategies drive it uniformly; today's `dispatchResult` is the starting point but may need tightening.
- **Sim FE UX size** — the largest non-core chunk; can be split to its own slice if it threatens RU3's footprint.
