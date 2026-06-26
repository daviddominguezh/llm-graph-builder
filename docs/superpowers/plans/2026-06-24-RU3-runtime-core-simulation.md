# RU3 — Runtime core + simulation driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the outer orchestration (child dispatch, ChildResult injection, event emission, await-input handling) out of the two duplicated simulation drivers (`simulationOrchestrator.ts` for agents, `simulateHandler.ts` for workflows) into a single capability-parameterized core in `packages/api`. The core drives a **`StepMachine`** abstraction with **two adapters** — `AgentStepMachine` (wraps `executeAgentLoop`) and `WorkflowStepMachine` (wraps `executeWithCallbacks`) — and **selects the engine by execution type server-side** (mirroring prod `executeAgentCore`'s `appType` routing). Both sim endpoints migrate onto the core behind **one sim API** where the backend routes agent-vs-workflow (the FE stops choosing). The core emits a superset `ExecutionEvent` union bridged to today's sim-SSE shapes; production stays on the legacy edge orchestrator until RU4.

**Architecture:** `executeTurn` builds an env-discriminated `ProviderCtx`, **picks a `StepMachine` by execution type** (`'agent'` → `AgentStepMachine`, `'workflow'` → `WorkflowStepMachine`), and calls `advance()` until the machine reports a terminal, an awaiting-input, or a dispatch decision. On a dispatch decision (`AgentLoopResult.dispatchResult` for agents / `CallAgentOutput.dispatchResult` for workflows) it calls `childDispatch`, which runs the child through the injected `DispatchStrategy`, maps the child's termination to a `ChildResult`, and re-injects it into the parent. Because dispatch is `StepMachine`-level, an agent can dispatch a workflow and vice-versa (interchangeable). Only sim's `SyncRecurseStrategy` runs in RU3; prod's durable strategy is contract-only. All progress flows through an `ExecutionEvent` emitter (superset of all FE shapes); the backend sim handler converts those events to today's sim-SSE shapes via a throwaway bridge. Sim state is held authoritatively by the runtime: deep-frozen at the ctx boundary, deep-cloned on write, surfaced as display-only `simulation_state_patch` events plus a terminal `simulation_state_snapshot`.

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `noUncheckedIndexedAccess`), the api package's existing engines (`executeAgentLoop` → `AgentLoopResult`; `executeWithCallbacks` → `CallAgentOutput | null`), `DispatchSentinel`/`FinishSentinel`, Jest ESM (`unstable_mockModule`), Express SSE (backend bridge), Next.js 16 / React / shadcn (`AlertDialog`, `Popover`, `Badge`) + `next-intl` messages (`packages/web/messages/en.json`).

## Global Constraints

- Monorepo npm workspaces. ESM (`"type":"module"`, NodeNext). TS strict, `noUncheckedIndexedAccess`. **Never `any`. Never eslint-disable.**
- ESLint: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2 — split into helpers/files, never compress lines. (This core is large — decompose aggressively.)
- Tests: Jest ESM — `npm run test -w packages/<pkg> -- --testPathPattern=…`. Full gate: `npm run check`.
- Prettier: single quotes, 2-space indent, width 110, trailing comma es5; `@trivago/prettier-plugin-sort-imports` import sorting.
- **Always add translations** for any user-facing copy (the sim FE UX adds several — keys listed in Task 19).
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; stage files explicitly (never `git add -A` / `-am`).

---

## Decisions / spec-vs-code findings (READ BEFORE STARTING — these are NOT silent fixes)

These are verified against the real code. Where the spec assumes a shape the code does not have, this plan implements against the real code and flags it here.

1. **Two engines, two result shapes — wrap the loop / the workflow runner, not the inner executor.** The agent engine is `executeAgentLoop(config, callbacks, logger?) => Promise<AgentLoopResult>` (`packages/api/src/agentLoop/agentLoop.ts:204`). `AgentLoopResult` (`agentLoopTypes.ts:59`) = `{ finalText: string; steps: number; totalTokens: TokenLog; tokensLogs: ActionTokenUsage[]; toolCalls: AgentToolCallRecord[]; finishResult?: FinishSentinel; dispatchResult?: DispatchSentinel }`. The workflow engine is `executeWithCallbacks(options: ExecuteWithCallbacksOptions) => Promise<CallAgentOutput | null>` (`packages/api/src/index.ts:191`). `CallAgentOutput` (`core/types.ts:38`) = `{ message; tokensLogs: ActionTokenUsage[]; toolCalls; visitedNodes: string[]; parsedResults?; text?: string; debugMessages; structuredOutputs?; dispatchResult?: DispatchSentinel; finishResult?: FinishSentinel }`. **RU3 wraps each behind a `StepMachine` adapter (Task 11) — never `executeAgent` (the per-attempt executor).** FLAGGED: the spec's §4 phrasing "`executeAgent` yields a dispatch decision" is wrong; the dispatch decision lives on `AgentLoopResult.dispatchResult` / `CallAgentOutput.dispatchResult`.

2. **Prod routes by `appType` — RU3 mirrors it.** `executeFetcher.ts:159` `fetchAppType` reads `agents.app_type` (`'agent' | 'workflow'`, defaults `'workflow'`); `fetchGraphAndKeys` branches `appType === 'agent' ? buildAgentRuntimeGraph(...) : ensureGraphData(...)`, and `executeAgentCore` (`executeCore.ts:133`) returns `appType` in its output. **`executeTurn` selects the `StepMachine` by the same `'agent' | 'workflow'` discriminant, server-side** (Task 14). FLAGGED: prod's engine choice is currently expressed via *graph building* (`buildAgentRuntimeGraph` vs `ensureGraphData`) feeding a single runner, not via a `StepMachine` switch — RU3 introduces the `StepMachine` seam that RU4 will retrofit onto prod. RU3 only proves it on the two sim drivers.

3. **The FE already posts both sims to `/api/simulate`; the real "FE choice" is `streamAgentSimulation` vs `streamSimulation` + two backend handlers.** `useSimulationSend.ts:17` branches `if (deps.appType === 'agent' || isChildActive) sendAgentSim(...) else sendWorkflowSim(...)`. `sendAgentSim` → `streamAgentSimulation` (`agentSimulationApi.ts`, body has `appType:'agent'` + `composition`), `sendWorkflowSim` → `streamSimulation` (`api.ts`, body has `graph`/`currentNode`/preset fields). **Both already `fetch('/api/simulate')`** — but the backend exposes **two** handlers (`server.ts:151` `app.post('/simulate', handleSimulate)` + `:152` `app.post('/simulate-agent', handleSimulateAgent)`), and the Next.js `/api/simulate` proxy currently fans out by body shape. FLAGGED contradiction: the spec says "FE stops choosing between `streamAgentSimulation`/`streamSimulation`." The unification RU3 delivers is: **the BE decides agent-vs-workflow from `appType` in ONE handler**, and the FE collapses to **one** stream fn posting one body (carrying `appType`) (Task 20). The two backend endpoints are unified behind `handleSimulate` routing on `appType`; `/simulate-agent` becomes a thin alias until RU6.

4. **`ProviderCtx` is a flat interface, no `environment` field.** Real shape (`providers/provider.ts:39-53`): `{ orgId, tenantId, agentId, isChildAgent, logger, conversationId?, contextData?, oauthTokens, mcpServers, services }` — all `readonly`. It has `isChildAgent` (good — finish gating uses it) but no `dispatchDepth`/`environment`. **RU3 converts `ProviderCtx` to an env-discriminated union** (Task 9), consumed by every builtin + `buildSimulationProviderCtx` (`simulationProviderCtx.ts:35`). FLAGGED: breaking type change; Task 9 updates all construction sites.

5. **No `AgentGraph` type; the child seam is `ResolvedChildConfig` and it includes `skills`.** `resolveChildConfig(input: ResolveChildParams) => Promise<ResolvedChildConfig>` (`simulateChildResolver.ts:270`) with `DISPATCH_HANDLERS` keyed `invoke_agent`/`create_agent`/`invoke_workflow`. `ResolvedChildConfig` (`:9`) = `{ systemPrompt; context; modelId; maxSteps: number | null; mcpServers: McpServerConfig[]; skills: SkillDefinition[]; isChildAgent; task; agentId?; version? }`. **RU3 defines `RuntimeServices.resolveChildConfig` over this shape (including `skills`)** instead of the north-star's `loadChildAgentGraph: (agentId) => Promise<AgentGraph>`. FLAGGED — confirm with RU4 that prod uses the same resolver.

6. **Prod END-without-finish has no explicit `no_result` error today.** RU3 implements the full §6.4 mapping in `mapTerminationToChildResult` (Task 5) including the prod rows, but only the **simulation** rows are exercised by a running strategy in RU3; the prod `no_result`/`finished` rows are covered by pure-mapper unit tests, run for real in RU4. FLAGGED as forward-design.

7. **Workflow sim today does NOT re-inject after dispatch.** `simulateHandler.ts:200` only emits `child_dispatched` and stops (no parent resume). The agent sim (`simulationOrchestrator.ts:109` `continueParentAfterChild`) DOES re-inject (pushes a tool-result message, re-runs the parent). FLAGGED: migrating the workflow path onto `executeTurn` **adds** child re-injection to the workflow sim that did not exist before — this is a deliberate behavior gain (the spec §1 calls workflow "previously left on the legacy engine"), validated by RU3's own behavior tests (§9), not by parity with the old workflow handler.

8. **`rag` registers `search_rag`, not `search`.** `kv_store` registers `list_keys`/`get_values`/`search`/`update_value`. The `simulatedNoop` seam (Task 12) is keyed on the real names. FLAGGED.

9. **RU1/RU2 cross-deps (confirm names at impl time):** RU1 store services (`makeNoStoreBoundKvServices`/`makeNoStoreBoundRagServices` exist locally in backend today at `services/noStoreBoundServices.ts`). RU2 exports `createMcpPoolClient` + `McpInvoker` (`providers/mcp/poolClient.ts`). RU3 references these as existing. FLAGGED — verify exact import paths when RU1/RU2 land; until then Task 4 declares a local `McpInvoker` stub.

10. **Two distinct sim-SSE unions today.** Agent sim uses `AgentSimulationEvent` (`simulateAgentTypes.ts:111` — `step_started`/`step_processed`/`tool_executed`/`agent_response`/`error`/`simulation_complete`/`child_dispatched`/`child_finished`/`child_waiting`; NO sim-state events). Workflow sim uses a different shape in `simulate.ts` (`node_visited`/`node_processed`/`agent_response`/`child_dispatched`/`simulation_complete`/`error`). RU3's bridge (Task 16) maps `ExecutionEvent` → the **appropriate** union per engine and **temporarily extends both** with `simulation_state_patch`/`simulation_state_snapshot`. FLAGGED.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/api/src/events/types.ts` (create) | The superset `ExecutionEvent` union + `Tokens` type (§5/§6.6). |
| `packages/api/src/events/emitter.ts` (create) | `createEventEmitter()`: push events into an `AsyncIterable<ExecutionEvent>` buffer; `emit()` + `close()`. |
| `packages/api/src/events/__tests__/types.test.ts` (create) | Union admits each event shape. |
| `packages/api/src/events/__tests__/emitter.test.ts` (create) | Emitter buffering/ordering/close test. |
| `packages/api/src/events/__tests__/emitterCompleteness.test.ts` (create) | §5 assertion: every field each of the 3 RU5 consumers needs is constructible from the union. |
| `packages/api/src/runtime/types.ts` (create) | `RuntimeInput`/`RuntimeOutput` env unions, `ExecutionType`, `DeepReadonly`, `RuntimeBase`, depth/timeout consts. |
| `packages/api/src/runtime/childResult.ts` (create) | `ChildResult`, `ChildErrorCode`, `mapTerminationToChildResult()` (the §6.4 table). |
| `packages/api/src/runtime/__tests__/childResult.test.ts` (create) | Every mapping row incl. env-aware END-without-finish. |
| `packages/api/src/capabilities/dispatchPersistence.ts` (create) | `DispatchPersistence` + `DispatchHandle` contract. |
| `packages/api/src/capabilities/dispatchStrategy.ts` (create) | `DispatchStrategy`, `DispatchArgs`, `DispatchOutcome` contract. |
| `packages/api/src/capabilities/observability.ts` (create) | `Observability` + `RateLimiter` + `RunnerLogger` interfaces. |
| `packages/api/src/capabilities/index.ts` (create) | `RuntimeCapabilities` + `RuntimeServices` aggregate types + `ResolveChildInput`/`ResolvedChildConfig`. |
| `packages/api/src/capabilities/__tests__/contracts.test.ts` (create) | Stub-strategy contract test. |
| `packages/api/src/simulation/noopPersistence.ts` (create) | `noopPersistence` impl. |
| `packages/api/src/simulation/consoleCapabilities.ts` (create) | console `Observability`/`RunnerLogger`, `noopRateLimit`. |
| `packages/api/src/simulation/syncRecurseStrategy.ts` (create) | `SyncRecurseStrategy`: runs child inline → `completed`. |
| `packages/api/src/simulation/__tests__/*.test.ts` (create) | Sim caps + inline-recursion + depth-guard behavior. |
| `packages/api/src/runtime/jsonPointer.ts` (create) | `setByJsonPointer(obj, pointer, value)` (RFC 6901). |
| `packages/api/src/runtime/simStateStore.ts` (create) | `createSimStateStore()`: deep-freeze read, deep-clone write, patch list, snapshot. |
| `packages/api/src/runtime/simulatedNoop.ts` (create) | Shared `simulatedNoop(args, ctx)` returned by every builtin in sim. |
| `packages/api/src/runtime/childDispatch.ts` (create) | `childDispatch()`: run strategy, map termination, emit `child_*`, return `ChildResult`. |
| `packages/api/src/runtime/stepMachine.ts` (create) | `StepMachine` interface + `StepReport` union. |
| `packages/api/src/runtime/agentStepMachine.ts` (create) | `AgentStepMachine` wrapping `executeAgentLoop`. |
| `packages/api/src/runtime/workflowStepMachine.ts` (create) | `WorkflowStepMachine` wrapping `executeWithCallbacks`. |
| `packages/api/src/runtime/selectStepMachine.ts` (create) | `selectStepMachine(executionType, deps)` — the engine-by-type switch. |
| `packages/api/src/runtime/executeTurn.ts` (create) | `executeTurn()`: build ctx, select machine, drive advance/dispatch loop, emit events, return `RuntimeOutput`. |
| `packages/api/src/runtime/resolveChildConfig.ts` (create) | Adapter conforming the backend resolver to `RuntimeServices.resolveChildConfig`. |
| `packages/api/src/runtime/__tests__/*.test.ts` (create) | jsonPointer / simStateStore / childDispatch / stepMachine adapters / executeTurn. |
| `packages/api/src/providers/provider.ts` (modify) | `ProviderCtx` → env-discriminated union (`environment`, `dispatchDepth`, sim arm). |
| `packages/api/src/core/providerCtxFromContext.ts` (modify) | Produce the production arm of the union. |
| `packages/api/src/providers/{kv_store,rag,forms,lead_scoring,web}/buildTools.ts` (modify) | `if (ctx.environment === 'simulation') return simulatedNoop(...)` guard. |
| `packages/api/src/index.ts` (modify) | Re-export the new public types (`ExecutionEvent`, `ChildResult`, `RuntimeCapabilities`, `RuntimeServices`, `executeTurn`, `StepMachine`, sim impls). |
| `packages/backend/src/routes/simulationProviderCtx.ts` (modify) | Set `environment: 'simulation'` + sim arm when building ctx. |
| `packages/backend/src/runtime/simulationCapabilities.ts` (create) | Wire sim `RuntimeCapabilities` + `RuntimeServices`. |
| `packages/backend/src/runtime/executionEventBridge.ts` (create) | Throwaway `ExecutionEvent → AgentSimulationEvent | WorkflowSimEvent` mapper (per engine). |
| `packages/backend/src/runtime/__tests__/executionEventBridge.test.ts` (create) | Bridge maps every event the FE consumes (both engines). |
| `packages/backend/src/routes/simulationOrchestrator.ts` (modify) | `runSimulationOrchestration` becomes a thin agent driver over `executeTurn` + the bridge. |
| `packages/backend/src/routes/simulateHandler.ts` (modify) | Workflow `runSimulation` becomes a thin driver over `executeTurn` + the bridge. |
| `packages/backend/src/routes/simulateHandlerUnified.ts` (create) | One handler routing agent-vs-workflow by `appType`; `/simulate` + `/simulate-agent` delegate to it. |
| `packages/backend/src/server.ts` (modify) | Both routes delegate to the unified handler. |
| `packages/web/app/utils/jsonPointer.ts` (create) | FE `setByJsonPointer` for patch preview. |
| `packages/web/app/hooks/useSimulationState.ts` (modify) | `adoptSnapshot` + `resetSimulationState` + `simulationState` store. |
| `packages/web/app/hooks/useSimulationSend.ts` (modify) | Collapse the two stream fns into one (BE routes by `appType`). |
| `packages/web/app/hooks/simulationSendHelpers.ts` (modify) | Single `sendSim` builds one body carrying `appType`. |
| `packages/web/app/lib/simulationApi.ts` (create) | One `streamSimulation` posting `/api/simulate` (replaces the two). |
| `packages/web/app/components/panels/SimulationStatePanel.tsx` (create) | Sim-state panel (`JsonBlock` + reset button). |
| `packages/web/app/components/panels/TestingPresetsPopover.tsx` (create) | Testing-presets popover w/ `TenantPicker`. |
| `packages/web/app/components/panels/ResetSimulationDialog.tsx` (create) | Reset `AlertDialog`. |
| `packages/web/app/components/panels/TenantSwitchResetDialog.tsx` (create) | Tenant-switch reset `AlertDialog`. |
| `packages/web/app/components/McpSideEffectBadge.tsx` (create) | The "real side effects" badge. |
| `packages/web/messages/en.json` (modify) | The §8 / §12.5 translation keys. |

---

### Task 1: `ExecutionEvent` superset union + `Tokens` type

**Files:**
- Create: `packages/api/src/events/types.ts`, `packages/api/src/runtime/childResult.ts` (type-only stub)
- Test: `packages/api/src/events/__tests__/types.test.ts`

**Interfaces:**
- `export type Tokens = { input: number; output: number; cached: number; costUSD?: number }`
- `export type ExecutionEvent = …` (full union below). The `child_finished` arm references `ChildResult` from `../runtime/childResult.js`; this task lands the `ChildResult`/`ChildErrorCode` **types** in `childResult.ts` (Task 5 appends the mapper).

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/events/__tests__/types.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent, Tokens } from '../types.js';

describe('ExecutionEvent union', () => {
  it('admits a node_exited event with tokens', () => {
    const tokens: Tokens = { input: 1, output: 2, cached: 0, costUSD: 0.01 };
    const ev: ExecutionEvent = { type: 'node_exited', nodeId: 'n1', depth: 0, text: 'hi', tokens };
    expect(ev.type).toBe('node_exited');
  });

  it('admits the simulation state events', () => {
    const patch: ExecutionEvent = { type: 'simulation_state_patch', tool: 't', path: '/a', value: 1 };
    const snap: ExecutionEvent = { type: 'simulation_state_snapshot', state: { a: 1 } };
    expect(patch.type).toBe('simulation_state_patch');
    expect(snap.type).toBe('simulation_state_snapshot');
  });

  it('admits child lifecycle events', () => {
    const fin: ExecutionEvent = {
      type: 'child_finished',
      childExecutionId: 'c1',
      depth: 1,
      result: { status: 'finished', result: 'done', outcome: 'success' },
    };
    expect(fin.type).toBe('child_finished');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/types`
Expected: FAIL — cannot find module `../types.js` (and `../runtime/childResult.js`).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/runtime/childResult.ts
export type ChildErrorCode =
  | 'max_depth_exceeded'
  | 'child_failed'
  | 'no_result'
  | 'timeout'
  | 'agent_not_published'
  | 'aborted';

export type ChildResult =
  | { status: 'finished'; result: string; outcome: 'success' | 'error' }
  | { status: 'awaiting_input'; partial: string }
  | { status: 'error'; code: ChildErrorCode; message: string };
```

```ts
// packages/api/src/events/types.ts
import type { ChildResult } from '../runtime/childResult.js';

export type Tokens = { input: number; output: number; cached: number; costUSD?: number };

export type ExecutionEvent =
  | { type: 'node_entered'; nodeId: string; depth: number }
  | {
      type: 'node_exited';
      nodeId: string;
      depth: number;
      text?: string;
      tokens?: Tokens;
      durationMs?: number;
      reasoning?: string;
      structuredOutput?: { nodeId: string; data: unknown };
    }
  | { type: 'assistant_message'; text: string; depth: number }
  | { type: 'tool_call'; toolName: string; toolCallId: string; args: unknown; depth: number; isMcp: boolean }
  | { type: 'tool_result'; toolCallId: string; result: unknown; depth: number }
  | { type: 'simulation_state_patch'; tool: string; path: string; value: unknown }
  | { type: 'simulation_state_snapshot'; state: Record<string, unknown> }
  | { type: 'child_dispatched'; childExecutionId: string; dispatchType: string; task: string; depth: number }
  | { type: 'child_suspended'; childExecutionId: string; depth: number }
  | { type: 'child_awaiting_input'; childExecutionId: string; partial: string; depth: number }
  | { type: 'child_finished'; childExecutionId: string; result: ChildResult; tokens?: Tokens; depth: number }
  | { type: 'node_error'; nodeId: string; message: string; depth: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'finished'; result: string; tokens?: Tokens; structuredOutputs?: Record<string, unknown[]> };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/events/types.ts packages/api/src/runtime/childResult.ts packages/api/src/events/__tests__/types.test.ts
git commit -m "feat(api): superset ExecutionEvent union + ChildResult type

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `ExecutionEvent` emitter (AsyncIterable buffer)

**Files:**
- Create: `packages/api/src/events/emitter.ts`
- Test: `packages/api/src/events/__tests__/emitter.test.ts`

**Interfaces:**
- `export interface EventEmitter { emit(ev: ExecutionEvent): void; close(): void; events: AsyncIterable<ExecutionEvent>; }`
- `export function createEventEmitter(): EventEmitter` — single-consumer push buffer: `emit` enqueues; `close` ends iteration; `events` yields in emission order, draining queued events then awaiting new ones.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/events/__tests__/emitter.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '../types.js';
import { createEventEmitter } from '../emitter.js';

async function collect(it: AsyncIterable<ExecutionEvent>): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe('createEventEmitter', () => {
  it('yields events in emission order then ends on close', async () => {
    const em = createEventEmitter();
    em.emit({ type: 'node_entered', nodeId: 'a', depth: 0 });
    em.emit({ type: 'assistant_message', text: 'hi', depth: 0 });
    em.close();
    const evs = await collect(em.events);
    expect(evs.map((e) => e.type)).toEqual(['node_entered', 'assistant_message']);
  });

  it('delivers events emitted after iteration starts', async () => {
    const em = createEventEmitter();
    const collected = collect(em.events);
    em.emit({ type: 'finished', result: 'done' });
    em.close();
    expect((await collected).map((e) => e.type)).toEqual(['finished']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/emitter`
Expected: FAIL — cannot find module `../emitter.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/events/emitter.ts
import type { ExecutionEvent } from './types.js';

export interface EventEmitter {
  emit(ev: ExecutionEvent): void;
  close(): void;
  events: AsyncIterable<ExecutionEvent>;
}

interface Waiter {
  resolve: (r: IteratorResult<ExecutionEvent>) => void;
}

export function createEventEmitter(): EventEmitter {
  const queue: ExecutionEvent[] = [];
  const waiters: Waiter[] = [];
  let closed = false;

  function emit(ev: ExecutionEvent): void {
    const waiter = waiters.shift();
    if (waiter !== undefined) {
      waiter.resolve({ value: ev, done: false });
      return;
    }
    queue.push(ev);
  }

  function close(): void {
    closed = true;
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      if (waiter !== undefined) waiter.resolve({ value: undefined, done: true });
    }
  }

  async function next(): Promise<IteratorResult<ExecutionEvent>> {
    const queued = queue.shift();
    if (queued !== undefined) return { value: queued, done: false };
    if (closed) return { value: undefined, done: true };
    return await new Promise<IteratorResult<ExecutionEvent>>((resolve) => {
      waiters.push({ resolve });
    });
  }

  const events: AsyncIterable<ExecutionEvent> = {
    [Symbol.asyncIterator]: () => ({ next }),
  };

  return { emit, close, events };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/emitter`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/events/emitter.ts packages/api/src/events/__tests__/emitter.test.ts
git commit -m "feat(api): single-consumer ExecutionEvent async emitter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Runtime types — `DeepReadonly`, `ExecutionType`, `RuntimeInput`/`RuntimeOutput`, depth/timeout consts

**Files:**
- Create: `packages/api/src/runtime/types.ts`
- Test: `packages/api/src/runtime/__tests__/types.test.ts`

**Interfaces:**
- `export type DeepReadonly<T>` (recursive readonly).
- `export type ExecutionType = 'agent' | 'workflow';` (mirrors prod `appType`).
- `export const MAX_DISPATCH_DEPTH = 3;` and `export const MAX_CHILD_RUNTIME_MS = 60 * 60 * 1000;`
- `export interface RuntimeBase { orgId; tenantId; userId; agentId; executionType: ExecutionType; selectedTools; mcpServers; dispatchDepth; maxDispatchDepth; maxChildRuntimeMs }`.
- `export type RuntimeInput` and `export type RuntimeOutput` (env unions; both carry `executionType`).

> NOTE: north-star §6.1 `RuntimeBase` includes `graph`/`storeBindings`/`message`; RU3's sim drivers keep passing those via the existing request bodies (`SimulateRequest`/`SimulateAgentRequest`) rather than a new `RuntimeInput` wire shape — `RuntimeInput`/`RuntimeOutput` are the canonical contract types only; full wiring lands RU4/RU5. FLAGGED.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/types.test.ts
import { describe, expect, it } from '@jest/globals';

import type { DeepReadonly, ExecutionType, RuntimeOutput } from '../types.js';
import { MAX_CHILD_RUNTIME_MS, MAX_DISPATCH_DEPTH } from '../types.js';

describe('runtime constants', () => {
  it('is the single configurable dispatch cap, default 3', () => {
    expect(MAX_DISPATCH_DEPTH).toBe(3);
    expect(MAX_CHILD_RUNTIME_MS).toBe(3600000);
  });
});

describe('DeepReadonly + RuntimeOutput', () => {
  it('compiles a frozen nested shape and a simulation output', () => {
    const ro: DeepReadonly<{ a: { b: number } }> = { a: { b: 1 } };
    const et: ExecutionType = 'agent';
    const out: RuntimeOutput = {
      environment: 'simulation',
      executionType: 'workflow',
      finalResult: 'done',
      events: (async function* () {})(),
    };
    expect(ro.a.b).toBe(1);
    expect(et).toBe('agent');
    expect(out.environment).toBe('simulation');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/types`
Expected: FAIL — cannot find module `../types.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/runtime/types.ts
import type { McpServerConfig } from '@daviddh/graph-types';

import type { ExecutionEvent } from '../events/types.js';

export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type ExecutionType = 'agent' | 'workflow';

export const MAX_DISPATCH_DEPTH = 3;
export const MAX_CHILD_RUNTIME_MS = 60 * 60 * 1000;

export interface ToolRef {
  providerId: string;
  toolName: string;
}

export interface RuntimeBase {
  orgId: string;
  tenantId: string;
  userId: string;
  agentId: string;
  executionType: ExecutionType;
  selectedTools: ToolRef[];
  mcpServers: McpServerConfig[];
  dispatchDepth: number;
  maxDispatchDepth: number;
  maxChildRuntimeMs: number;
}

export type RuntimeInput =
  | (RuntimeBase & { environment: 'production'; conversationId: string; executionId: string })
  | (RuntimeBase & {
      environment: 'simulation';
      simulationState: DeepReadonly<Record<string, unknown>>;
      simulationStateWritable: boolean;
    });

export interface RuntimeOutputBase {
  events: AsyncIterable<ExecutionEvent>;
  finalResult: string;
  executionType: ExecutionType;
}

export type RuntimeOutput =
  | (RuntimeOutputBase & { environment: 'production' })
  | (RuntimeOutputBase & { environment: 'simulation' });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/types.ts packages/api/src/runtime/__tests__/types.test.ts
git commit -m "feat(api): runtime types (DeepReadonly, ExecutionType, RuntimeInput/Output, consts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Capability + service contracts (interfaces only)

**Files:**
- Create: `packages/api/src/capabilities/dispatchPersistence.ts`, `dispatchStrategy.ts`, `observability.ts`, `index.ts`
- Test: `packages/api/src/capabilities/__tests__/contracts.test.ts`

**Interfaces:**
- `DispatchHandle`, `DispatchPersistence`, `DispatchArgs`, `DispatchOutcome`, `DispatchStrategy`, `Observability`, `RateLimiter`, `RunnerLogger`.
- `RuntimeCapabilities = { persistence; dispatch; observability; rateLimit; logger }`.
- `RuntimeServices = { mcpPool: McpInvoker; resolveChildConfig: (input: ResolveChildInput) => Promise<ResolvedChildConfig>; supabase: SupabaseLike }`.
- `ResolvedChildConfig` **includes `skills`** (verified against `simulateChildResolver.ts:9`). `SkillDefinition` is imported from graph-types if exported there; else typed as `{ name: string; description: string; content: string }`. FLAGGED — reconcile the `SkillDefinition` import at impl time.
- `RuntimeServices.supabase` is typed `SupabaseLike` (structural) because the api package cannot import the backend's `SupabaseClient`. FLAGGED: §6.3 says `supabase: SupabaseClient`; api types it structurally.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/capabilities/__tests__/contracts.test.ts
import { describe, expect, it } from '@jest/globals';

import type { DispatchOutcome, DispatchStrategy } from '../dispatchStrategy.js';

describe('DispatchStrategy contract', () => {
  it('a stub strategy returns a completed outcome', async () => {
    const strat: DispatchStrategy = {
      dispatch: async (args) => {
        const childResult = await args.runChild();
        const out: DispatchOutcome = { kind: 'completed', childResult };
        return out;
      },
    };
    const outcome = await strat.dispatch({
      dispatchDepth: 0,
      maxDispatchDepth: 10,
      runChild: async () => ({ status: 'finished', result: 'x', outcome: 'success' }),
    });
    expect(outcome.kind).toBe('completed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=capabilities/__tests__/contracts`
Expected: FAIL — cannot find module `../dispatchStrategy.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/capabilities/dispatchPersistence.ts
import type { ChildResult } from '../runtime/childResult.js';

export interface DispatchHandle {
  executionId: string;
  childExecutionId: string;
}

export interface DispatchPersistence {
  beforeDispatch(args: { executionId: string; parentSnapshot: unknown; childInput: unknown }): Promise<DispatchHandle>;
  onChildFinish(args: { handle: DispatchHandle; childResult: ChildResult }): Promise<void>;
  onChildError(args: { handle: DispatchHandle; error: unknown }): Promise<void>;
  listPending(executionId: string): Promise<DispatchHandle[]>;
}
```

```ts
// packages/api/src/capabilities/dispatchStrategy.ts
import type { ChildResult } from '../runtime/childResult.js';
import type { DispatchHandle } from './dispatchPersistence.js';

export interface DispatchArgs {
  dispatchDepth: number;
  maxDispatchDepth: number;
  runChild: () => Promise<ChildResult>;
}

export type DispatchOutcome =
  | { kind: 'completed'; childResult: ChildResult }
  | { kind: 'suspended'; handle: DispatchHandle };

export interface DispatchStrategy {
  dispatch(args: DispatchArgs): Promise<DispatchOutcome>;
}
```

```ts
// packages/api/src/capabilities/observability.ts
export interface Observability {
  event(name: string, data?: Record<string, unknown>): void;
}

export interface RateLimiter {
  acquire(tenantId: string): Promise<void>;
}

export interface RunnerLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}
```

```ts
// packages/api/src/capabilities/index.ts
import type { McpServerConfig } from '@daviddh/graph-types';

import type { DispatchPersistence } from './dispatchPersistence.js';
import type { DispatchStrategy } from './dispatchStrategy.js';
import type { Observability, RateLimiter, RunnerLogger } from './observability.js';

export type { DispatchHandle, DispatchPersistence } from './dispatchPersistence.js';
export type { DispatchArgs, DispatchOutcome, DispatchStrategy } from './dispatchStrategy.js';
export type { Observability, RateLimiter, RunnerLogger } from './observability.js';

// RU2 reconcile: replace this local stub with the import from providers/mcp/poolClient.js.
export interface McpInvoker {
  invoke(a: {
    agentId: string;
    tenantId: string;
    mcpBindingId: string;
    toolName: string;
    args: unknown;
  }): Promise<unknown>;
}

export type SupabaseLike = Record<string, unknown>;

export interface RuntimeCapabilities {
  persistence: DispatchPersistence;
  dispatch: DispatchStrategy;
  observability: Observability;
  rateLimit: RateLimiter;
  logger: RunnerLogger;
}

export interface ResolveChildInput {
  dispatchType: 'create_agent' | 'invoke_agent' | 'invoke_workflow';
  params: Record<string, unknown>;
  orgId: string;
}

export interface SkillDefinitionLike {
  name: string;
  description: string;
  content: string;
}

export interface ResolvedChildConfig {
  systemPrompt: string;
  context: string;
  modelId: string;
  maxSteps: number | null;
  mcpServers: McpServerConfig[];
  skills: SkillDefinitionLike[];
  isChildAgent: boolean;
  task: string;
  agentId?: string;
  version?: number;
}

export interface RuntimeServices {
  mcpPool: McpInvoker;
  resolveChildConfig: (input: ResolveChildInput) => Promise<ResolvedChildConfig>;
  supabase: SupabaseLike;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=capabilities/__tests__/contracts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/capabilities/dispatchPersistence.ts packages/api/src/capabilities/dispatchStrategy.ts packages/api/src/capabilities/observability.ts packages/api/src/capabilities/index.ts packages/api/src/capabilities/__tests__/contracts.test.ts
git commit -m "feat(api): RuntimeCapabilities + RuntimeServices + dispatch contracts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `mapTerminationToChildResult` — the §6.4 mapping table

**Files:**
- Modify: `packages/api/src/runtime/childResult.ts` (add the mapper; types landed in Task 1)
- Test: `packages/api/src/runtime/__tests__/childResult.test.ts`

**Interfaces:**
- Consumes: `FinishSentinel` from `../types/sentinels.js` (real shape `{ __sentinel: 'finish'; output: string; status: 'success' | 'error' }`).
- `export interface TerminationInput { environment: 'production' | 'simulation'; finishResult?: FinishSentinel; lastAssistantText: string; depthExceeded?: boolean; failure?: { kind: 'child_failed' | 'timeout' | 'agent_not_published' | 'aborted'; message: string } }`
- `export function mapTerminationToChildResult(input: TerminationInput): ChildResult`

The one env-aware row: END-without-`finish` → **sim** `awaiting_input`, **prod** `finished` (has text) or `error: no_result`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/childResult.test.ts
import { describe, expect, it } from '@jest/globals';

import { mapTerminationToChildResult } from '../childResult.js';

describe('mapTerminationToChildResult', () => {
  it('explicit finish success → finished/success', () => {
    expect(
      mapTerminationToChildResult({
        environment: 'simulation',
        finishResult: { __sentinel: 'finish', output: 'ok', status: 'success' },
        lastAssistantText: '',
      })
    ).toEqual({ status: 'finished', result: 'ok', outcome: 'success' });
  });

  it('explicit finish error → finished/error', () => {
    expect(
      mapTerminationToChildResult({
        environment: 'production',
        finishResult: { __sentinel: 'finish', output: 'bad', status: 'error' },
        lastAssistantText: '',
      })
    ).toEqual({ status: 'finished', result: 'bad', outcome: 'error' });
  });

  it('END-without-finish in simulation → awaiting_input with last text', () => {
    expect(mapTerminationToChildResult({ environment: 'simulation', lastAssistantText: 'hold on' })).toEqual({
      status: 'awaiting_input',
      partial: 'hold on',
    });
  });

  it('END-without-finish in production with text → finished/success', () => {
    expect(mapTerminationToChildResult({ environment: 'production', lastAssistantText: 'answer' })).toEqual({
      status: 'finished',
      result: 'answer',
      outcome: 'success',
    });
  });

  it('END-without-finish in production with no text → error/no_result', () => {
    const r = mapTerminationToChildResult({ environment: 'production', lastAssistantText: '' });
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.code).toBe('no_result');
  });

  it('depth exceeded → error/max_depth_exceeded', () => {
    const r = mapTerminationToChildResult({ environment: 'simulation', lastAssistantText: '', depthExceeded: true });
    if (r.status === 'error') expect(r.code).toBe('max_depth_exceeded');
  });

  it('explicit failure passes through its code', () => {
    const r = mapTerminationToChildResult({
      environment: 'simulation',
      lastAssistantText: '',
      failure: { kind: 'aborted', message: 'stopped' },
    });
    if (r.status === 'error') expect(r.code).toBe('aborted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/childResult`
Expected: FAIL — `mapTerminationToChildResult` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `childResult.ts`)

```ts
// packages/api/src/runtime/childResult.ts  (append below the Task 1 type defs)
import type { FinishSentinel } from '../types/sentinels.js';

export interface TerminationInput {
  environment: 'production' | 'simulation';
  finishResult?: FinishSentinel;
  lastAssistantText: string;
  depthExceeded?: boolean;
  failure?: { kind: 'child_failed' | 'timeout' | 'agent_not_published' | 'aborted'; message: string };
}

function fromFinish(finish: FinishSentinel): ChildResult {
  return { status: 'finished', result: finish.output, outcome: finish.status };
}

function fromEnd(environment: 'production' | 'simulation', text: string): ChildResult {
  if (environment === 'simulation') return { status: 'awaiting_input', partial: text };
  if (text.length > 0) return { status: 'finished', result: text, outcome: 'success' };
  return { status: 'error', code: 'no_result', message: 'Child ended without a result.' };
}

export function mapTerminationToChildResult(input: TerminationInput): ChildResult {
  if (input.depthExceeded === true) {
    return { status: 'error', code: 'max_depth_exceeded', message: 'Max dispatch depth exceeded.' };
  }
  if (input.failure !== undefined) {
    return { status: 'error', code: input.failure.kind, message: input.failure.message };
  }
  if (input.finishResult !== undefined) return fromFinish(input.finishResult);
  return fromEnd(input.environment, input.lastAssistantText);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/childResult`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/childResult.ts packages/api/src/runtime/__tests__/childResult.test.ts
git commit -m "feat(api): termination → ChildResult mapping (incl env-aware END-without-finish)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Sim capabilities — `noopPersistence`, console caps, `noopRateLimit`

**Files:**
- Create: `packages/api/src/simulation/noopPersistence.ts`, `consoleCapabilities.ts`
- Test: `packages/api/src/simulation/__tests__/consoleCapabilities.test.ts`

**Interfaces:** `noopPersistence: DispatchPersistence`, `noopRateLimit: RateLimiter`, `consoleObservability: Observability`, `consoleLogger: RunnerLogger`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/simulation/__tests__/consoleCapabilities.test.ts
import { describe, expect, it } from '@jest/globals';

import { noopPersistence } from '../noopPersistence.js';
import { noopRateLimit } from '../consoleCapabilities.js';

describe('sim caps', () => {
  it('noopPersistence.listPending returns empty', async () => {
    expect(await noopPersistence.listPending('x')).toEqual([]);
  });
  it('noopRateLimit.acquire resolves immediately', async () => {
    await expect(noopRateLimit.acquire('t1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=simulation/__tests__/consoleCapabilities`
Expected: FAIL — cannot find module `../noopPersistence.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/simulation/noopPersistence.ts
import type { DispatchHandle, DispatchPersistence } from '../capabilities/dispatchPersistence.js';

export const noopPersistence: DispatchPersistence = {
  beforeDispatch: async (): Promise<DispatchHandle> => ({ executionId: 'sim', childExecutionId: 'sim-child' }),
  onChildFinish: async (): Promise<void> => undefined,
  onChildError: async (): Promise<void> => undefined,
  listPending: async (): Promise<DispatchHandle[]> => [],
};
```

```ts
// packages/api/src/simulation/consoleCapabilities.ts
import type { Observability, RateLimiter, RunnerLogger } from '../capabilities/observability.js';

export const noopRateLimit: RateLimiter = {
  acquire: async (): Promise<void> => undefined,
};

export const consoleObservability: Observability = {
  event: (name, data) => {
    console.info(`[sim] ${name}`, data ?? {});
  },
};

export const consoleLogger: RunnerLogger = {
  info: (message, data) => console.info(message, data ?? {}),
  warn: (message, data) => console.warn(message, data ?? {}),
  error: (message, data) => console.error(message, data ?? {}),
};
```

> If the api ESLint config forbids raw `console`, route these through the existing `utils/logger.ts` proxy keeping the same `RunnerLogger`/`Observability` shape. FLAG and adapt.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=simulation/__tests__/consoleCapabilities`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/simulation/noopPersistence.ts packages/api/src/simulation/consoleCapabilities.ts packages/api/src/simulation/__tests__/consoleCapabilities.test.ts
git commit -m "feat(api): sim capabilities (noopPersistence, console observability/logger, noopRateLimit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: JSON Pointer setter (RFC 6901)

**Files:**
- Create: `packages/api/src/runtime/jsonPointer.ts`
- Test: `packages/api/src/runtime/__tests__/jsonPointer.test.ts`

**Interfaces:** `export function setByJsonPointer(target: Record<string, unknown>, pointer: string, value: unknown): Record<string, unknown>` — returns a NEW object with the value set at the pointer path (creates intermediate objects); does not mutate `target`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/jsonPointer.test.ts
import { describe, expect, it } from '@jest/globals';

import { setByJsonPointer } from '../jsonPointer.js';

describe('setByJsonPointer', () => {
  it('sets a nested path, creating intermediates, without mutating input', () => {
    const input = { a: { b: 1 } };
    const out = setByJsonPointer(input, '/forms/contact/email', 'a@b.com');
    expect(out).toEqual({ a: { b: 1 }, forms: { contact: { email: 'a@b.com' } } });
    expect(input).toEqual({ a: { b: 1 } });
  });

  it('decodes ~1 and ~0 escapes', () => {
    const out = setByJsonPointer({}, '/a~1b/c~0d', 1);
    expect(out).toEqual({ 'a/b': { 'c~d': 1 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/jsonPointer`
Expected: FAIL — cannot find module `../jsonPointer.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/runtime/jsonPointer.ts
function decodeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function tokens(pointer: string): string[] {
  if (pointer === '') return [];
  return pointer.split('/').slice(1).map(decodeToken);
}

export function setByJsonPointer(
  target: Record<string, unknown>,
  pointer: string,
  value: unknown
): Record<string, unknown> {
  const path = tokens(pointer);
  const root: Record<string, unknown> = { ...target };
  let cursor = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i] ?? '';
    const existing = cursor[key];
    const next: Record<string, unknown> =
      typeof existing === 'object' && existing !== null ? { ...(existing as Record<string, unknown>) } : {};
    cursor[key] = next;
    cursor = next;
  }
  const last = path[path.length - 1];
  if (last !== undefined) cursor[last] = value;
  return root;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/jsonPointer`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/jsonPointer.ts packages/api/src/runtime/__tests__/jsonPointer.test.ts
git commit -m "feat(api): RFC 6901 setByJsonPointer (immutable set)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Sim-state store — deep-freeze read, clone-on-write, patch/snapshot, abort

**Files:**
- Create: `packages/api/src/runtime/simStateStore.ts`
- Test: `packages/api/src/runtime/__tests__/simStateStore.test.ts`

**Interfaces:**
- `export interface SimStatePatch { tool: string; path: string; value: unknown }`
- `export interface SimStateStore { read(): DeepReadonly<Record<string, unknown>>; write(tool, path, value): SimStatePatch | null; snapshot(): Record<string, unknown>; patches(): SimStatePatch[] }`
- `export function createSimStateStore(initial, writable): SimStateStore` — `read()` deep-frozen; `write()` deep-clones value, applies via `setByJsonPointer`, records+returns a patch when `writable` else `null`.
- `export function deepFreeze<T>(value: T): T`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/simStateStore.test.ts
import { describe, expect, it } from '@jest/globals';

import { createSimStateStore, deepFreeze } from '../simStateStore.js';

describe('createSimStateStore', () => {
  it('read() returns a frozen view where mutation throws', () => {
    const store = createSimStateStore({ a: { b: 1 } }, true);
    const view = store.read() as { a: { b: number } };
    expect(() => {
      view.a.b = 2;
    }).toThrow();
  });

  it('write() applies, records a patch, and deep-clones the value', () => {
    const store = createSimStateStore({}, true);
    const value = { email: 'a@b.com' };
    const patch = store.write('set_form_fields', '/forms/contact', value);
    value.email = 'mutated';
    expect(patch).toEqual({ tool: 'set_form_fields', path: '/forms/contact', value: { email: 'a@b.com' } });
    expect(store.snapshot()).toEqual({ forms: { contact: { email: 'a@b.com' } } });
  });

  it('write() is a silent no-op when not writable', () => {
    const store = createSimStateStore({}, false);
    expect(store.write('t', '/x', 1)).toBeNull();
    expect(store.snapshot()).toEqual({});
    expect(store.patches()).toEqual([]);
  });

  it('deepFreeze recursively freezes', () => {
    const frozen = deepFreeze({ a: { b: [1] } });
    expect(Object.isFrozen(frozen.a)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/simStateStore`
Expected: FAIL — cannot find module `../simStateStore.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/runtime/simStateStore.ts
import type { DeepReadonly } from './types.js';
import { setByJsonPointer } from './jsonPointer.js';

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export interface SimStatePatch {
  tool: string;
  path: string;
  value: unknown;
}

export interface SimStateStore {
  read(): DeepReadonly<Record<string, unknown>>;
  write(tool: string, path: string, value: unknown): SimStatePatch | null;
  snapshot(): Record<string, unknown>;
  patches(): SimStatePatch[];
}

export function createSimStateStore(initial: Record<string, unknown>, writable: boolean): SimStateStore {
  let authoritative: Record<string, unknown> = structuredClone(initial);
  const recorded: SimStatePatch[] = [];

  function read(): DeepReadonly<Record<string, unknown>> {
    return deepFreeze(structuredClone(authoritative)) as DeepReadonly<Record<string, unknown>>;
  }

  function write(tool: string, path: string, value: unknown): SimStatePatch | null {
    if (!writable) return null;
    const cloned = structuredClone(value);
    authoritative = setByJsonPointer(authoritative, path, cloned);
    const patch: SimStatePatch = { tool, path, value: cloned };
    recorded.push(patch);
    return patch;
  }

  return {
    read,
    write,
    snapshot: () => structuredClone(authoritative),
    patches: () => recorded.slice(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/simStateStore`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/simStateStore.ts packages/api/src/runtime/__tests__/simStateStore.test.ts
git commit -m "feat(api): sim-state store (deep-freeze read, clone-on-write, patches, snapshot)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `ProviderCtx` → env-discriminated union + `simulatedNoop` + update consumers

**Files:**
- Modify: `packages/api/src/providers/provider.ts`
- Create: `packages/api/src/runtime/simulatedNoop.ts`
- Modify: `packages/api/src/core/providerCtxFromContext.ts`
- Modify: `packages/backend/src/routes/simulationProviderCtx.ts`
- Test: `packages/api/src/providers/__tests__/providerCtxEnv.test.ts`

**Interfaces:**
- `ProviderCtx` becomes `ProviderCtxBase & (ProductionCtxArm | SimulationCtxArm)`:
  - `ProviderCtxBase`: existing fields **minus** `conversationId`, plus `dispatchDepth: number`.
  - production arm: `{ environment: 'production'; conversationId?: string }`.
  - simulation arm: `{ environment: 'simulation'; simulationState: DeepReadonly<Record<string, unknown>>; writeSimulationState: (path: string, value: unknown) => void }`.
- `export async function simulatedNoop(args: unknown, ctx: ProviderCtx): Promise<{ simulated: true }>`.
- `providerCtxFromContext` returns the production arm; `buildSimulationProviderCtx` returns the simulation arm.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/providers/__tests__/providerCtxEnv.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ProviderCtx } from '../provider.js';
import { simulatedNoop } from '../../runtime/simulatedNoop.js';

function simCtx(): ProviderCtx {
  return {
    orgId: 'o',
    tenantId: 't',
    agentId: 'a',
    isChildAgent: false,
    dispatchDepth: 0,
    logger: { info() {}, warn() {}, error() {} } as never,
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: (() => undefined) as never,
    environment: 'simulation',
    simulationState: {},
    writeSimulationState: () => undefined,
  };
}

describe('ProviderCtx env discriminant', () => {
  it('narrows to the simulation arm and simulatedNoop returns the marker', async () => {
    const ctx = simCtx();
    if (ctx.environment === 'simulation') ctx.writeSimulationState('/x', 1);
    expect(await simulatedNoop({}, ctx)).toEqual({ simulated: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=providers/__tests__/providerCtxEnv`
Expected: FAIL — `environment`/`simulationState` not on `ProviderCtx`; `simulatedNoop` module missing.

- [ ] **Step 3: Write minimal implementation**

Replace the flat `ProviderCtx` interface (`provider.ts:39-53`) with the union:

```ts
// packages/api/src/providers/provider.ts  (replace the `export interface ProviderCtx { ... }` block)
import type { DeepReadonly } from '../runtime/types.js';

export interface ProviderCtxBase {
  readonly orgId: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly isChildAgent: boolean;
  readonly dispatchDepth: number;
  readonly logger: Logger;
  readonly contextData?: Readonly<Record<string, unknown>>;
  readonly oauthTokens: ReadonlyMap<string, OAuthTokenBundle>;
  readonly mcpServers: ReadonlyMap<string, McpServerConfig>;
  readonly services: ServicesResolver;
}

export type ProviderCtx =
  | (ProviderCtxBase & { readonly environment: 'production'; readonly conversationId?: string })
  | (ProviderCtxBase & {
      readonly environment: 'simulation';
      readonly simulationState: DeepReadonly<Record<string, unknown>>;
      readonly writeSimulationState: (path: string, value: unknown) => void;
    });
```

```ts
// packages/api/src/runtime/simulatedNoop.ts
import type { ProviderCtx } from '../providers/provider.js';

export async function simulatedNoop(_args: unknown, _ctx: ProviderCtx): Promise<{ simulated: true }> {
  return await Promise.resolve({ simulated: true });
}
```

Edit `providerCtxFromContext.ts` — add `environment: 'production'` and `dispatchDepth: context.dispatchDepth ?? 0` to the returned object. Edit `buildSimulationProviderCtx` (`simulationProviderCtx.ts:35`) — accept `dispatchDepth`/`simulationState`/`writeSimulationState` args (default `0`/`{}`/no-op) and set `environment: 'simulation'` + the sim arm; drop `conversationId` from the sim arm (and from `SimulationCtxArgs` if no caller needs it — it does not exist on the sim arm). Resolve all `ProviderCtx` construction sites (`grep -rn "buildSimulationProviderCtx(\|environment:" packages`).

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -w packages/api -- --testPathPattern=providers/__tests__/providerCtxEnv`
Then: `npm run typecheck -w packages/api && npm run typecheck -w packages/backend`
Expected: new test PASSES; builtin `buildTools.ts` typecheck breakage from the union is fixed in Task 12 — resolve all other ctx-construction breakage here.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/provider.ts packages/api/src/runtime/simulatedNoop.ts packages/api/src/core/providerCtxFromContext.ts packages/backend/src/routes/simulationProviderCtx.ts packages/api/src/providers/__tests__/providerCtxEnv.test.ts
git commit -m "feat(api): env-discriminated ProviderCtx union + simulatedNoop seam + ctx constructors

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `SyncRecurseStrategy` + depth guard

**Files:**
- Create: `packages/api/src/simulation/syncRecurseStrategy.ts`
- Test: `packages/api/src/simulation/__tests__/syncRecurseStrategy.test.ts`

**Interfaces:** `export const syncRecurseStrategy: DispatchStrategy` — runs `args.runChild()` inline → `{ kind: 'completed', childResult }`. If `args.dispatchDepth + 1 > args.maxDispatchDepth`, returns `{ kind: 'completed', childResult: { status:'error', code:'max_depth_exceeded', message } }` WITHOUT calling `runChild`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/simulation/__tests__/syncRecurseStrategy.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import { syncRecurseStrategy } from '../syncRecurseStrategy.js';

describe('syncRecurseStrategy', () => {
  it('runs the child inline and returns completed', async () => {
    const runChild = jest.fn(async () => ({ status: 'finished', result: 'x', outcome: 'success' as const }));
    const out = await syncRecurseStrategy.dispatch({ dispatchDepth: 0, maxDispatchDepth: 10, runChild });
    expect(out).toEqual({ kind: 'completed', childResult: { status: 'finished', result: 'x', outcome: 'success' } });
    expect(runChild).toHaveBeenCalledTimes(1);
  });

  it('short-circuits at max depth without running the child', async () => {
    const runChild = jest.fn(async () => ({ status: 'finished', result: 'x', outcome: 'success' as const }));
    const out = await syncRecurseStrategy.dispatch({ dispatchDepth: 10, maxDispatchDepth: 10, runChild });
    expect(out.kind).toBe('completed');
    if (out.kind === 'completed' && out.childResult.status === 'error') {
      expect(out.childResult.code).toBe('max_depth_exceeded');
    }
    expect(runChild).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=simulation/__tests__/syncRecurseStrategy`
Expected: FAIL — cannot find module `../syncRecurseStrategy.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/simulation/syncRecurseStrategy.ts
import type { DispatchArgs, DispatchOutcome, DispatchStrategy } from '../capabilities/dispatchStrategy.js';

export const syncRecurseStrategy: DispatchStrategy = {
  dispatch: async (args: DispatchArgs): Promise<DispatchOutcome> => {
    if (args.dispatchDepth + 1 > args.maxDispatchDepth) {
      return {
        kind: 'completed',
        childResult: { status: 'error', code: 'max_depth_exceeded', message: 'Max dispatch depth exceeded.' },
      };
    }
    const childResult = await args.runChild();
    return { kind: 'completed', childResult };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=simulation/__tests__/syncRecurseStrategy`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/simulation/syncRecurseStrategy.ts packages/api/src/simulation/__tests__/syncRecurseStrategy.test.ts
git commit -m "feat(api): SyncRecurseStrategy (inline child run + depth guard)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `childDispatch` — run strategy, map termination, emit child_* events

**Files:**
- Create: `packages/api/src/runtime/childDispatch.ts`
- Test: `packages/api/src/runtime/__tests__/childDispatch.test.ts`

**Interfaces:**
- `export interface ChildTermination { finishResult?: FinishSentinel; lastAssistantText: string }`
- `export interface ChildDispatchArgs { sentinel: DispatchSentinel; dispatchDepth; maxDispatchDepth; environment: 'production' | 'simulation'; strategy: DispatchStrategy; emitter: EventEmitter; childExecutionId: string; task: string; runChildToTermination: () => Promise<ChildTermination> }`
- `export async function childDispatch(args: ChildDispatchArgs): Promise<ChildResult>` — emits `child_dispatched`; the strategy's `runChild` runs `runChildToTermination()` then maps via `mapTerminationToChildResult`; on `completed` emits `child_awaiting_input` (for `awaiting_input`) else `child_finished`, returns the `ChildResult`; on `suspended` emits `child_suspended` and returns `{ status:'error', code:'child_failed', message }` (suspended branch is contract-only in RU3).

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/childDispatch.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '../../events/types.js';
import { createEventEmitter } from '../../events/emitter.js';
import { syncRecurseStrategy } from '../../simulation/syncRecurseStrategy.js';
import { childDispatch } from '../childDispatch.js';

async function drain(it: AsyncIterable<ExecutionEvent>): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('childDispatch', () => {
  it('emits child_dispatched then child_finished for a finishing child (sim)', async () => {
    const emitter = createEventEmitter();
    const result = await childDispatch({
      sentinel: { __sentinel: 'dispatch', type: 'invoke_agent', params: {} },
      dispatchDepth: 0,
      maxDispatchDepth: 10,
      environment: 'simulation',
      strategy: syncRecurseStrategy,
      emitter,
      childExecutionId: 'c1',
      task: 'do it',
      runChildToTermination: async () => ({
        finishResult: { __sentinel: 'finish', output: 'done', status: 'success' },
        lastAssistantText: '',
      }),
    });
    emitter.close();
    expect(result).toEqual({ status: 'finished', result: 'done', outcome: 'success' });
    expect((await drain(emitter.events)).map((e) => e.type)).toEqual(['child_dispatched', 'child_finished']);
  });

  it('emits child_awaiting_input for an END-without-finish child in sim', async () => {
    const emitter = createEventEmitter();
    const result = await childDispatch({
      sentinel: { __sentinel: 'dispatch', type: 'invoke_agent', params: {} },
      dispatchDepth: 0,
      maxDispatchDepth: 10,
      environment: 'simulation',
      strategy: syncRecurseStrategy,
      emitter,
      childExecutionId: 'c2',
      task: 'do it',
      runChildToTermination: async () => ({ lastAssistantText: 'hold on' }),
    });
    emitter.close();
    expect(result).toEqual({ status: 'awaiting_input', partial: 'hold on' });
    expect((await drain(emitter.events)).map((e) => e.type)).toEqual(['child_dispatched', 'child_awaiting_input']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/childDispatch`
Expected: FAIL — cannot find module `../childDispatch.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/runtime/childDispatch.ts
import type { DispatchStrategy } from '../capabilities/dispatchStrategy.js';
import type { EventEmitter } from '../events/emitter.js';
import type { DispatchSentinel, FinishSentinel } from '../types/sentinels.js';
import type { ChildResult } from './childResult.js';
import { mapTerminationToChildResult } from './childResult.js';

export interface ChildTermination {
  finishResult?: FinishSentinel;
  lastAssistantText: string;
}

export interface ChildDispatchArgs {
  sentinel: DispatchSentinel;
  dispatchDepth: number;
  maxDispatchDepth: number;
  environment: 'production' | 'simulation';
  strategy: DispatchStrategy;
  emitter: EventEmitter;
  childExecutionId: string;
  task: string;
  runChildToTermination: () => Promise<ChildTermination>;
}

function emitChildResult(args: ChildDispatchArgs, result: ChildResult): void {
  const depth = args.dispatchDepth + 1;
  if (result.status === 'awaiting_input') {
    args.emitter.emit({ type: 'child_awaiting_input', childExecutionId: args.childExecutionId, partial: result.partial, depth });
    return;
  }
  args.emitter.emit({ type: 'child_finished', childExecutionId: args.childExecutionId, result, depth });
}

export async function childDispatch(args: ChildDispatchArgs): Promise<ChildResult> {
  args.emitter.emit({
    type: 'child_dispatched',
    childExecutionId: args.childExecutionId,
    dispatchType: args.sentinel.type,
    task: args.task,
    depth: args.dispatchDepth + 1,
  });
  const runChild = async (): Promise<ChildResult> => {
    const term = await args.runChildToTermination();
    return mapTerminationToChildResult({
      environment: args.environment,
      finishResult: term.finishResult,
      lastAssistantText: term.lastAssistantText,
    });
  };
  const outcome = await args.strategy.dispatch({
    dispatchDepth: args.dispatchDepth,
    maxDispatchDepth: args.maxDispatchDepth,
    runChild,
  });
  if (outcome.kind === 'completed') {
    emitChildResult(args, outcome.childResult);
    return outcome.childResult;
  }
  args.emitter.emit({ type: 'child_suspended', childExecutionId: args.childExecutionId, depth: args.dispatchDepth + 1 });
  return { status: 'error', code: 'child_failed', message: 'Durable suspend not run in simulation.' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/childDispatch`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/childDispatch.ts packages/api/src/runtime/__tests__/childDispatch.test.ts
git commit -m "feat(api): childDispatch (strategy run + termination map + child_* events)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Per-tool `simulatedNoop` seam across builtins

**Files:**
- Modify: `packages/api/src/providers/{kv_store,rag,forms,lead_scoring,web}/buildTools.ts`
- Test: `packages/api/src/providers/__tests__/simulatedNoopSeam.test.ts`

**Interfaces:** each builtin tool's `execute` begins with `if (ctx.environment === 'simulation') return simulatedNoop(args, ctx);`. Real tool names (verified): kv_store `list_keys`/`get_values`/`search`/`update_value`; rag `search_rag`; forms `set_form_fields`/`get_form_field`; lead_scoring `set_lead_score`/`get_lead_score`; web `web_search`/`web_extract`/`web_crawl`/`web_map`. (Composition + calendar NOT touched — §13.)

> NOTE: web is NOT in spec §13's table but §7 scope says "every builtin"; web tools do real network egress, so they get the guard. FLAGGED: confirm intent (consistent with "every builtin no-ops in sim").

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/providers/__tests__/simulatedNoopSeam.test.ts
import { describe, expect, it } from '@jest/globals';

import { buildForms } from '../forms/buildTools.js'; // adjust to the real exported builder name
import type { ProviderCtx } from '../provider.js';

function simCtx(): ProviderCtx {
  return {
    orgId: 'o', tenantId: 't', agentId: 'a', isChildAgent: false, dispatchDepth: 0,
    logger: { info() {}, warn() {}, error() {} } as never,
    oauthTokens: new Map(), mcpServers: new Map(), services: (() => undefined) as never,
    environment: 'simulation', simulationState: {}, writeSimulationState: () => undefined,
  };
}

describe('forms tools no-op in simulation', () => {
  it('set_form_fields returns the simulated marker in sim env', async () => {
    const tools = await buildForms({ toolNames: ['set_form_fields'], ctx: simCtx() });
    const tool = tools.set_form_fields;
    expect(tool).toBeDefined();
    const out = await tool!.execute({ formId: 'contact', fields: {} }, {} as never);
    expect(out).toEqual({ simulated: true });
  });
});
```

> Adjust `buildForms` to the real exported builder. The `execute` closure already has `ctx`/`params` in scope; the guard closes over that `ctx`, not a second param.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=providers/__tests__/simulatedNoopSeam`
Expected: FAIL — `execute` still runs the production path.

- [ ] **Step 3: Write minimal implementation**

For each listed tool, insert the guard as the first statement of `execute` (expand terse one-expression `execute` to a block first — never compress):

```ts
// providers/forms/buildTools.ts — inside the set_form_fields tool object
import { simulatedNoop } from '../../runtime/simulatedNoop.js';
// ...
      execute: async (args: unknown) => {
        if (ctx.environment === 'simulation') return await simulatedNoop(args, ctx);
        return await executeSet(parseArgs(setInput, args), params);
      },
```

Repeat for: kv_store `list_keys`/`get_values`/`search`/`update_value`; rag `search_rag`; forms `set_form_fields`/`get_form_field`; lead_scoring `set_lead_score`/`get_lead_score`; web `web_search`/`web_extract`/`web_crawl`/`web_map`.

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -w packages/api -- --testPathPattern=providers/__tests__/simulatedNoopSeam`
Then: `npm run typecheck -w packages/api`
Expected: PASS; union-narrowing makes `ctx.simulationState` available only inside the guard.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/kv_store/buildTools.ts packages/api/src/providers/rag/buildTools.ts packages/api/src/providers/forms/buildTools.ts packages/api/src/providers/lead_scoring/buildTools.ts packages/api/src/providers/web/buildTools.ts packages/api/src/providers/__tests__/simulatedNoopSeam.test.ts
git commit -m "feat(api): per-tool simulatedNoop seam in every builtin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `resolveChildConfig` adapter (inject backend resolver as the seam)

**Files:**
- Create: `packages/api/src/runtime/resolveChildConfig.ts`
- Test: `packages/api/src/runtime/__tests__/resolveChildConfig.test.ts`

**Interfaces:** `export function makeResolveChildConfig(supabase: SupabaseLike, backendResolve: BackendResolve): (input: ResolveChildInput) => Promise<ResolvedChildConfig>`. DECISION: **inject, don't re-port the DB queries in RU3** (the backend keeps `simulateChildResolver.ts` until RU6; the real DB port lands in RU4 for the Worker). This task provides only the thin adapter conforming the existing backend resolver to the `RuntimeServices.resolveChildConfig` signature. FLAGGED.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/resolveChildConfig.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ResolvedChildConfig } from '../../capabilities/index.js';
import { makeResolveChildConfig } from '../resolveChildConfig.js';

describe('makeResolveChildConfig adapter', () => {
  it('forwards to the injected backend resolver', async () => {
    const stub: ResolvedChildConfig = {
      systemPrompt: 'sp', context: 'c', modelId: 'm', maxSteps: null, mcpServers: [], skills: [],
      isChildAgent: true, task: 'do it',
    };
    const resolve = makeResolveChildConfig({}, async () => stub);
    const out = await resolve({ dispatchType: 'invoke_agent', params: {}, orgId: 'o' });
    expect(out).toBe(stub);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/resolveChildConfig`
Expected: FAIL — cannot find module `../resolveChildConfig.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/runtime/resolveChildConfig.ts
import type { ResolveChildInput, ResolvedChildConfig, SupabaseLike } from '../capabilities/index.js';

export type BackendResolve = (supabase: SupabaseLike, input: ResolveChildInput) => Promise<ResolvedChildConfig>;

export function makeResolveChildConfig(
  supabase: SupabaseLike,
  backendResolve: BackendResolve
): (input: ResolveChildInput) => Promise<ResolvedChildConfig> {
  return async (input: ResolveChildInput): Promise<ResolvedChildConfig> => await backendResolve(supabase, input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/resolveChildConfig`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/resolveChildConfig.ts packages/api/src/runtime/__tests__/resolveChildConfig.test.ts
git commit -m "feat(api): resolveChildConfig adapter (inject backend resolver as RuntimeServices seam)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: `StepMachine` interface + `AgentStepMachine` + `WorkflowStepMachine` + engine-by-type selector

**Files:**
- Create: `packages/api/src/runtime/stepMachine.ts`, `agentStepMachine.ts`, `workflowStepMachine.ts`, `selectStepMachine.ts`
- Test: `packages/api/src/runtime/__tests__/stepMachine.test.ts`

**Interfaces:**
- `export type StepReport =`
  `| { kind: 'step'; assistantText?: string; nodeId?: string; tokens?: Tokens; reasoning?: string; durationMs?: number }`
  `| { kind: 'dispatch'; sentinel: DispatchSentinel }`
  `| { kind: 'awaiting_input'; partial: string }`
  `| { kind: 'terminal'; finalText: string; finishResult?: FinishSentinel };`
- `export interface StepMachine { advance(): Promise<StepReport>; injectChildResult(result: ChildResult): void; }`
  - `advance()` runs the next step (one LLM request/tool-call for agent; one node for workflow) and reports the outcome.
  - `injectChildResult` threads a resolved `ChildResult` back so the next `advance()` resumes the parent.
- `AgentStepMachine` wraps `executeAgentLoop` — it owns the loop config/callbacks; a single `advance()` runs the loop to its next decision and surfaces `dispatchResult` → `{ kind:'dispatch' }`, `finishResult`/`finalText` → `{ kind:'terminal' }`. On `injectChildResult`, it pushes the child's tool-result message into its message list (mirroring legacy `continueParentAfterChild`) before the next `advance()`.
- `WorkflowStepMachine` wraps `executeWithCallbacks` — `advance()` runs it to its next decision; `CallAgentOutput.dispatchResult` → `{ kind:'dispatch' }`, `CallAgentOutput.text`/`finishResult` → `{ kind:'terminal' }`; `null` output → `{ kind:'terminal'; finalText:'' }`. It forwards `onNodeVisited`/`onNodeProcessed` into the emitter (passed in via deps).
- `export function selectStepMachine(executionType: ExecutionType, deps: StepMachineDeps): StepMachine` — `'agent'` → `AgentStepMachine`, `'workflow'` → `WorkflowStepMachine`. `StepMachineDeps` carries the per-engine closures the driver provides (`runAgentLoop`/`runWorkflow`, the emitter, the message list), so the api core stays decoupled from the concrete model/graph plumbing the backend owns.

> **Decomposition (max-lines):** each machine + the selector is its own file. The machines hold the message-threading/resume logic that legacy `continueParentAfterChild` (`simulationOrchestrator.ts:109`) owned for agents — RU3 lifts it into `AgentStepMachine`. The workflow machine adds equivalent resume threading (workflow sim had none before — see Decision 7). FLAGGED: this is new workflow behavior, validated by this task's tests, not parity.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/stepMachine.test.ts
import { describe, expect, it } from '@jest/globals';

import { selectStepMachine } from '../selectStepMachine.js';

const baseDeps = {
  emitter: { emit() {}, close() {}, events: (async function* () {})() },
};

describe('selectStepMachine', () => {
  it('agent machine reports a dispatch then a terminal after injectChildResult', async () => {
    let phase = 0;
    const machine = selectStepMachine('agent', {
      ...baseDeps,
      runAgentLoop: async () => {
        phase += 1;
        if (phase === 1) {
          return {
            finalText: 'parent', steps: 1, totalTokens: { input: 0, output: 0, cached: 0 },
            tokensLogs: [], toolCalls: [], dispatchResult: { __sentinel: 'dispatch', type: 'invoke_agent', params: {} },
          };
        }
        return { finalText: 'parent done', steps: 1, totalTokens: { input: 0, output: 0, cached: 0 }, tokensLogs: [], toolCalls: [] };
      },
    } as never);
    const first = await machine.advance();
    expect(first.kind).toBe('dispatch');
    machine.injectChildResult({ status: 'finished', result: 'child', outcome: 'success' });
    const second = await machine.advance();
    expect(second.kind).toBe('terminal');
    if (second.kind === 'terminal') expect(second.finalText).toBe('parent done');
  });

  it('workflow machine maps a null output to a terminal', async () => {
    const machine = selectStepMachine('workflow', {
      ...baseDeps,
      runWorkflow: async () => null,
    } as never);
    const report = await machine.advance();
    expect(report.kind).toBe('terminal');
  });

  it('workflow machine surfaces a dispatch from CallAgentOutput.dispatchResult', async () => {
    const machine = selectStepMachine('workflow', {
      ...baseDeps,
      runWorkflow: async () => ({
        message: null, tokensLogs: [], toolCalls: [], visitedNodes: [], text: '',
        debugMessages: {}, dispatchResult: { __sentinel: 'dispatch', type: 'invoke_workflow', params: {} },
      }),
    } as never);
    const report = await machine.advance();
    expect(report.kind).toBe('dispatch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/stepMachine`
Expected: FAIL — cannot find module `../selectStepMachine.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/runtime/stepMachine.ts
import type { Tokens } from '../events/types.js';
import type { DispatchSentinel, FinishSentinel } from '../types/sentinels.js';
import type { ChildResult } from './childResult.js';

export type StepReport =
  | { kind: 'step'; assistantText?: string; nodeId?: string; tokens?: Tokens; reasoning?: string; durationMs?: number }
  | { kind: 'dispatch'; sentinel: DispatchSentinel }
  | { kind: 'awaiting_input'; partial: string }
  | { kind: 'terminal'; finalText: string; finishResult?: FinishSentinel };

export interface StepMachine {
  advance(): Promise<StepReport>;
  injectChildResult(result: ChildResult): void;
}
```

```ts
// packages/api/src/runtime/agentStepMachine.ts
import type { EventEmitter } from '../events/emitter.js';
import type { AgentLoopResult } from '../agentLoop/agentLoopTypes.js';
import type { ChildResult } from './childResult.js';
import type { StepMachine, StepReport } from './stepMachine.js';

export interface AgentMachineDeps {
  emitter: EventEmitter;
  runAgentLoop: () => Promise<AgentLoopResult>;
  onChildResult?: (result: ChildResult) => void;
}

function reportFromLoop(result: AgentLoopResult): StepReport {
  if (result.dispatchResult !== undefined) return { kind: 'dispatch', sentinel: result.dispatchResult };
  return { kind: 'terminal', finalText: result.finalText, finishResult: result.finishResult };
}

export function createAgentStepMachine(deps: AgentMachineDeps): StepMachine {
  let pending: ChildResult | null = null;
  return {
    advance: async (): Promise<StepReport> => {
      const result = await deps.runAgentLoop();
      if (result.finalText.length > 0) deps.emitter.emit({ type: 'assistant_message', text: result.finalText, depth: 0 });
      return reportFromLoop(result);
    },
    injectChildResult: (result: ChildResult): void => {
      pending = result;
      deps.onChildResult?.(result);
    },
  };
}
```

> NOTE: `runAgentLoop` is a deps closure built by the driver (Task 17) — it owns the message list, so `injectChildResult`'s pushed tool-result message is visible to the NEXT `runAgentLoop()` call (the driver re-reads its message array). `pending` is retained for the suspended/durable path in RU4. Keep each function ≤40 lines; split helpers if needed.

```ts
// packages/api/src/runtime/workflowStepMachine.ts
import type { CallAgentOutput } from '../core/types.js';
import type { EventEmitter } from '../events/emitter.js';
import type { ChildResult } from './childResult.js';
import type { StepMachine, StepReport } from './stepMachine.js';

export interface WorkflowMachineDeps {
  emitter: EventEmitter;
  runWorkflow: () => Promise<CallAgentOutput | null>;
  onChildResult?: (result: ChildResult) => void;
}

function reportFromOutput(output: CallAgentOutput | null): StepReport {
  if (output === null) return { kind: 'terminal', finalText: '' };
  if (output.dispatchResult !== undefined) return { kind: 'dispatch', sentinel: output.dispatchResult };
  return { kind: 'terminal', finalText: output.text ?? '', finishResult: output.finishResult };
}

export function createWorkflowStepMachine(deps: WorkflowMachineDeps): StepMachine {
  return {
    advance: async (): Promise<StepReport> => reportFromOutput(await deps.runWorkflow()),
    injectChildResult: (result: ChildResult): void => {
      deps.onChildResult?.(result);
    },
  };
}
```

```ts
// packages/api/src/runtime/selectStepMachine.ts
import type { ExecutionType } from './types.js';
import { createAgentStepMachine, type AgentMachineDeps } from './agentStepMachine.js';
import { createWorkflowStepMachine, type WorkflowMachineDeps } from './workflowStepMachine.js';
import type { StepMachine } from './stepMachine.js';

export type StepMachineDeps = (AgentMachineDeps & Partial<WorkflowMachineDeps>) | (WorkflowMachineDeps & Partial<AgentMachineDeps>);

export function selectStepMachine(executionType: ExecutionType, deps: StepMachineDeps): StepMachine {
  if (executionType === 'agent') return createAgentStepMachine(deps as AgentMachineDeps);
  return createWorkflowStepMachine(deps as WorkflowMachineDeps);
}
```

> The `as` casts at the selector boundary are a deliberate, narrow exception confined to the discriminated dispatch; the per-engine deps are validated by the machine's own typed factory. If the no-`as` rule rejects this, replace `StepMachineDeps` with a discriminated `{ executionType: 'agent'; ...AgentMachineDeps } | { executionType: 'workflow'; ...WorkflowMachineDeps }` and switch on it. FLAG and pick the cleaner shape at impl time.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/stepMachine`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/stepMachine.ts packages/api/src/runtime/agentStepMachine.ts packages/api/src/runtime/workflowStepMachine.ts packages/api/src/runtime/selectStepMachine.ts packages/api/src/runtime/__tests__/stepMachine.test.ts
git commit -m "feat(api): StepMachine interface + AgentStepMachine + WorkflowStepMachine + engine selector

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: `executeTurn` — select machine by type, drive advance/dispatch loop, emit events

**Files:**
- Create: `packages/api/src/runtime/executeTurn.ts`
- Test: `packages/api/src/runtime/__tests__/executeTurn.test.ts`

**Interfaces:**
- `export interface ExecuteTurnArgs { environment: 'production' | 'simulation'; executionType: ExecutionType; dispatchDepth: number; maxDispatchDepth: number; capabilities: RuntimeCapabilities; services: RuntimeServices; simStore?: SimStateStore; machine: StepMachine; runChildToTermination: (config: ResolvedChildConfig) => Promise<ChildTermination>; }`
- `export async function executeTurn(args: ExecuteTurnArgs): Promise<RuntimeOutput>` — loops `machine.advance()`:
  - `terminal` → emit sim snapshot (if `simStore`) + `finished`, return.
  - `awaiting_input` → emit nothing extra; finalize as `finished` with the partial.
  - `dispatch` → resolve child config via `services.resolveChildConfig`, call `childDispatch` (engine-agnostic), `machine.injectChildResult(childResult)`, continue the loop.
  - Guards on `maxDispatchDepth` via the strategy (Task 10).
- Returns `{ environment, executionType, events, finalResult }`.

> `runChildToTermination(config)` is supplied by the driver and runs the CHILD `StepMachine` (which may be the other engine) to its termination — that is where agent↔workflow interchangeability is realized. `executeTurn` orchestrates the sequence + events; per-engine model/graph plumbing stays in the driver closures (Task 17/18). Keep `executeTurn` ≤40 lines by extracting `driveDispatch`/`emitTerminal` helpers. FLAGGED: pragmatic split; RU4 may pull more in.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/executeTurn.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '../../events/types.js';
import { createEventEmitter } from '../../events/emitter.js';
import { noopPersistence } from '../../simulation/noopPersistence.js';
import { consoleLogger, consoleObservability, noopRateLimit } from '../../simulation/consoleCapabilities.js';
import { syncRecurseStrategy } from '../../simulation/syncRecurseStrategy.js';
import type { StepMachine, StepReport } from '../stepMachine.js';
import { executeTurn } from '../executeTurn.js';

const caps = { persistence: noopPersistence, dispatch: syncRecurseStrategy, observability: consoleObservability, rateLimit: noopRateLimit, logger: consoleLogger };
const services = {
  mcpPool: { invoke: async () => ({}) },
  resolveChildConfig: async () => ({ systemPrompt: 's', context: 'c', modelId: 'm', maxSteps: null, mcpServers: [], skills: [], isChildAgent: true, task: 't' }),
  supabase: {},
};

async function drain(it: AsyncIterable<ExecutionEvent>): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

function scriptedMachine(reports: StepReport[]): StepMachine {
  let i = 0;
  return { advance: async () => reports[i++]!, injectChildResult: () => undefined };
}

describe('executeTurn', () => {
  it('emits finished for a single terminal turn', async () => {
    const out = await executeTurn({
      environment: 'simulation', executionType: 'agent', dispatchDepth: 0, maxDispatchDepth: 10,
      capabilities: caps as never, services: services as never,
      machine: scriptedMachine([{ kind: 'terminal', finalText: 'hello' }]),
      runChildToTermination: async () => ({ lastAssistantText: '' }),
    });
    expect(out.finalResult).toBe('hello');
    expect((await drain(out.events)).map((e) => e.type)).toContain('finished');
  });

  it('drives one child dispatch (agent dispatching a workflow child) then terminates', async () => {
    const out = await executeTurn({
      environment: 'simulation', executionType: 'agent', dispatchDepth: 0, maxDispatchDepth: 10,
      capabilities: caps as never, services: services as never,
      machine: scriptedMachine([
        { kind: 'dispatch', sentinel: { __sentinel: 'dispatch', type: 'invoke_workflow', params: {} } },
        { kind: 'terminal', finalText: 'parent done' },
      ]),
      runChildToTermination: async () => ({ finishResult: { __sentinel: 'finish', output: 'child', status: 'success' }, lastAssistantText: '' }),
    });
    const types = (await drain(out.events)).map((e) => e.type);
    expect(types).toContain('child_dispatched');
    expect(types).toContain('child_finished');
    expect(types).toContain('finished');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/executeTurn`
Expected: FAIL — cannot find module `../executeTurn.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/runtime/executeTurn.ts
import type { ResolvedChildConfig, RuntimeCapabilities, RuntimeServices } from '../capabilities/index.js';
import { createEventEmitter, type EventEmitter } from '../events/emitter.js';
import type { ChildTermination } from './childDispatch.js';
import { childDispatch } from './childDispatch.js';
import type { SimStateStore } from './simStateStore.js';
import type { StepMachine, StepReport } from './stepMachine.js';
import type { ExecutionType, RuntimeOutput } from './types.js';

export interface ExecuteTurnArgs {
  environment: 'production' | 'simulation';
  executionType: ExecutionType;
  dispatchDepth: number;
  maxDispatchDepth: number;
  capabilities: RuntimeCapabilities;
  services: RuntimeServices;
  simStore?: SimStateStore;
  machine: StepMachine;
  runChildToTermination: (config: ResolvedChildConfig) => Promise<ChildTermination>;
}

async function handleDispatch(args: ExecuteTurnArgs, emitter: EventEmitter, report: Extract<StepReport, { kind: 'dispatch' }>): Promise<void> {
  const config = await args.services.resolveChildConfig({ dispatchType: report.sentinel.type, params: report.sentinel.params, orgId: '' });
  const childResult = await childDispatch({
    sentinel: report.sentinel,
    dispatchDepth: args.dispatchDepth,
    maxDispatchDepth: args.maxDispatchDepth,
    environment: args.environment,
    strategy: args.capabilities.dispatch,
    emitter,
    childExecutionId: `child-${String(args.dispatchDepth + 1)}`,
    task: config.task,
    runChildToTermination: async () => await args.runChildToTermination(config),
  });
  args.machine.injectChildResult(childResult);
}

function emitTerminal(args: ExecuteTurnArgs, emitter: EventEmitter, text: string): void {
  if (args.simStore !== undefined) emitter.emit({ type: 'simulation_state_snapshot', state: args.simStore.snapshot() });
  emitter.emit({ type: 'finished', result: text });
}

async function driveLoop(args: ExecuteTurnArgs, emitter: EventEmitter): Promise<string> {
  for (;;) {
    const report = await args.machine.advance();
    if (report.kind === 'dispatch') {
      await handleDispatch(args, emitter, report);
      continue;
    }
    if (report.kind === 'awaiting_input') return report.partial;
    if (report.kind === 'terminal') return report.finalText;
  }
}

export async function executeTurn(args: ExecuteTurnArgs): Promise<RuntimeOutput> {
  const emitter = createEventEmitter();
  const finalResult = await driveLoop(args, emitter);
  emitTerminal(args, emitter, finalResult);
  emitter.close();
  return { environment: args.environment, executionType: args.executionType, events: emitter.events, finalResult };
}
```

> `report.kind === 'step'` simply continues the loop (no early return) — the emitter already received per-step events from the machine. Keep `max-depth` ≤2 by using the early-`continue`/`return` style above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/executeTurn`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/executeTurn.ts packages/api/src/runtime/__tests__/executeTurn.test.ts
git commit -m "feat(api): executeTurn (select engine by type, drive dispatch loop, emit ExecutionEvents)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Public barrel exports + emitter-completeness assertion test

**Files:**
- Modify: `packages/api/src/index.ts`
- Test: `packages/api/src/events/__tests__/emitterCompleteness.test.ts`

**Interfaces:** barrel re-exports of the new public surface (`ExecutionEvent`, `Tokens`, `ChildResult`, `ChildErrorCode`, `mapTerminationToChildResult`, `RuntimeCapabilities`, `RuntimeServices`, `ResolveChildInput`, `ResolvedChildConfig`, `DispatchStrategy`/`DispatchOutcome`/`DispatchArgs`/`DispatchPersistence`/`DispatchHandle`, `Observability`/`RateLimiter`/`RunnerLogger`, `McpInvoker`, `SupabaseLike`, `executeTurn`, `childDispatch`, `StepMachine`/`StepReport`/`selectStepMachine`, `createEventEmitter`, `createSimStateStore`/`deepFreeze`/`SimStateStore`/`SimStatePatch`, `setByJsonPointer`, `simulatedNoop`, `syncRecurseStrategy`, `noopPersistence`, `consoleObservability`/`consoleLogger`/`noopRateLimit`, `makeResolveChildConfig`, `MAX_DISPATCH_DEPTH`/`MAX_CHILD_RUNTIME_MS`, `RuntimeInput`/`RuntimeOutput`/`DeepReadonly`/`ExecutionType`/`ToolRef`). The completeness test asserts the superset covers each of the 3 RU5 consumers' field needs (§5).

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/events/__tests__/emitterCompleteness.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '../types.js';

describe('ExecutionEvent superset completeness (RU5 consumer guard)', () => {
  it('production API: text, toolCall, tokenUsage, structuredOutput, nodeError, done', () => {
    const text: ExecutionEvent = { type: 'assistant_message', text: 'x', depth: 0 };
    const toolCall: ExecutionEvent = { type: 'tool_call', toolName: 't', toolCallId: 'i', args: {}, depth: 0, isMcp: false };
    const tokenUsage: ExecutionEvent = { type: 'node_exited', nodeId: 'n', depth: 0, tokens: { input: 0, output: 0, cached: 0 } };
    const structured: ExecutionEvent = { type: 'node_exited', nodeId: 'n', depth: 0, structuredOutput: { nodeId: 'n', data: {} } };
    const nodeError: ExecutionEvent = { type: 'node_error', nodeId: 'n', message: 'm', depth: 0 };
    const done: ExecutionEvent = { type: 'finished', result: 'r', tokens: { input: 0, output: 0, cached: 0 }, structuredOutputs: {} };
    expect([text, toolCall, tokenUsage, structured, nodeError, done].length).toBe(6);
  });

  it('simulation panel: step(reasoning), tool_result, child_*, snapshot/patch', () => {
    const step: ExecutionEvent = { type: 'node_exited', nodeId: 'n', depth: 0, reasoning: 'why', durationMs: 5 };
    const toolResult: ExecutionEvent = { type: 'tool_result', toolCallId: 'i', result: {}, depth: 0 };
    const awaiting: ExecutionEvent = { type: 'child_awaiting_input', childExecutionId: 'c', partial: 'p', depth: 1 };
    const dispatched: ExecutionEvent = { type: 'child_dispatched', childExecutionId: 'c', dispatchType: 'invoke_agent', task: 't', depth: 1 };
    const patch: ExecutionEvent = { type: 'simulation_state_patch', tool: 't', path: '/a', value: 1 };
    const snapshot: ExecutionEvent = { type: 'simulation_state_snapshot', state: {} };
    expect([step, toolResult, awaiting, dispatched, patch, snapshot].length).toBe(6);
  });

  it('widget: text + done', () => {
    const text: ExecutionEvent = { type: 'assistant_message', text: 'x', depth: 0 };
    const done: ExecutionEvent = { type: 'finished', result: 'r' };
    expect([text, done].length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (or compile-fails)**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/emitterCompleteness`
Expected: PASS if the Task 1 union is complete; if any consumer field has no home a TS compile error FAILS the run — that failure IS the §5 guard. Add the missing field to `events/types.ts` and re-run.

- [ ] **Step 3: Add the barrel exports** (respecting `@trivago` import sort)

```ts
export type { ExecutionEvent, Tokens } from './events/types.js';
export { createEventEmitter } from './events/emitter.js';
export type { ChildResult, ChildErrorCode, TerminationInput } from './runtime/childResult.js';
export { mapTerminationToChildResult } from './runtime/childResult.js';
export type {
  RuntimeCapabilities, RuntimeServices, ResolveChildInput, ResolvedChildConfig, McpInvoker, SupabaseLike,
  DispatchStrategy, DispatchOutcome, DispatchArgs, DispatchPersistence, DispatchHandle,
  Observability, RateLimiter, RunnerLogger,
} from './capabilities/index.js';
export { executeTurn } from './runtime/executeTurn.js';
export { childDispatch } from './runtime/childDispatch.js';
export { selectStepMachine } from './runtime/selectStepMachine.js';
export type { StepMachine, StepReport } from './runtime/stepMachine.js';
export { createSimStateStore, deepFreeze } from './runtime/simStateStore.js';
export type { SimStateStore, SimStatePatch } from './runtime/simStateStore.js';
export { setByJsonPointer } from './runtime/jsonPointer.js';
export { simulatedNoop } from './runtime/simulatedNoop.js';
export { syncRecurseStrategy } from './simulation/syncRecurseStrategy.js';
export { noopPersistence } from './simulation/noopPersistence.js';
export { consoleObservability, consoleLogger, noopRateLimit } from './simulation/consoleCapabilities.js';
export { makeResolveChildConfig } from './runtime/resolveChildConfig.js';
export { MAX_DISPATCH_DEPTH, MAX_CHILD_RUNTIME_MS } from './runtime/types.js';
export type { RuntimeInput, RuntimeOutput, DeepReadonly, ExecutionType, ToolRef } from './runtime/types.js';
```

- [ ] **Step 4: Run typecheck + the completeness test**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/emitterCompleteness && npm run typecheck -w packages/api`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/index.ts packages/api/src/events/__tests__/emitterCompleteness.test.ts
git commit -m "feat(api): public barrel exports + emitter-completeness assertion (RU5 superset guard)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Sim capabilities wiring + `ExecutionEvent → sim-SSE` bridge (both engines)

**Files:**
- Create: `packages/backend/src/runtime/simulationCapabilities.ts`, `executionEventBridge.ts`
- Test: `packages/backend/src/runtime/__tests__/executionEventBridge.test.ts`

**Interfaces:**
- `buildSimulationCapabilities(): RuntimeCapabilities` = `{ persistence: noopPersistence, dispatch: syncRecurseStrategy, observability: consoleObservability, rateLimit: noopRateLimit, logger: consoleLogger }`.
- `buildSimulationRuntimeServices(supabase, mcpPool): RuntimeServices` — wires `makeResolveChildConfig(supabase, ...)` to the existing backend `resolveChildConfig`.
- `executionEventToSim(ev: ExecutionEvent, executionType: ExecutionType): AgentSimulationEvent | WorkflowSimEvent | null` — maps the superset to today's **per-engine** sim shape (agent → `AgentSimulationEvent`; workflow → the `simulate.ts` union). Mapping highlights:
  - `assistant_message` → agent `agent_response` (or `step_processed`) / workflow `agent_response`.
  - `tool_call`/`tool_result` → agent `tool_executed`.
  - `node_exited` → agent `step_processed` / workflow `node_processed`.
  - `node_entered` → workflow `node_visited` (agent → `null`).
  - `child_dispatched` → `child_dispatched` (both, carrying `dispatchType`/`task`).
  - `child_finished` → agent `child_finished` (`{ depth, output, status, tokens }`); workflow has no `child_finished` today → forward as a synthesized `child_dispatched`-paired event or `null` (workflow sim previously stopped at dispatch — see Decision 7; emit the new `child_finished` shape, temporarily extending the workflow union).
  - `child_awaiting_input` → agent `child_waiting` (`{ depth, text: partial }`).
  - `finished` → `simulation_complete` (both).
  - `error` → `{ type: 'error', message }` (both).
  - `simulation_state_patch`/`simulation_state_snapshot` → **forwarded 1:1** (both — temporary union extension).
  - `child_suspended` → `null` (durable-only; surfaces post-RU5).

> **The bridge FORWARDS `simulation_state_patch`/`simulation_state_snapshot`** (do NOT drop them). Today neither sim-SSE union has them, so this task **temporarily extends both** (`simulateAgentTypes.ts` AND the `simulate.ts` workflow union) with exactly those two members, mapped 1:1. Task 18's panel consumes them off the SSE stream, validating the §6 runtime→FE sim-state model end-to-end. Both members + the whole bridge are deleted at RU5's full cutover.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/runtime/__tests__/executionEventBridge.test.ts
import { describe, expect, it } from '@jest/globals';

import { executionEventToSim } from '../executionEventBridge.js';

describe('executionEventToSim (agent)', () => {
  it('maps child_awaiting_input → child_waiting', () => {
    expect(executionEventToSim({ type: 'child_awaiting_input', childExecutionId: 'c', partial: 'p', depth: 1 }, 'agent')).toEqual({
      type: 'child_waiting', depth: 1, text: 'p',
    });
  });

  it('maps child_finished → child_finished (sim shape)', () => {
    const out = executionEventToSim(
      { type: 'child_finished', childExecutionId: 'c', depth: 1, result: { status: 'finished', result: 'done', outcome: 'success' }, tokens: { input: 1, output: 2, cached: 0 } },
      'agent'
    );
    expect(out).toEqual({ type: 'child_finished', depth: 1, output: 'done', status: 'success', tokens: { input: 1, output: 2, cached: 0 } });
  });

  it('maps finished → simulation_complete', () => {
    expect(executionEventToSim({ type: 'finished', result: 'x' }, 'agent')).toEqual({ type: 'simulation_complete' });
  });

  it('forwards simulation_state_snapshot (temporary bridge extension)', () => {
    expect(executionEventToSim({ type: 'simulation_state_snapshot', state: { a: 1 } }, 'agent')).toEqual({
      type: 'simulation_state_snapshot', state: { a: 1 },
    });
  });

  it('forwards simulation_state_patch (temporary bridge extension)', () => {
    expect(executionEventToSim({ type: 'simulation_state_patch', tool: 't', path: '/a', value: 1 }, 'agent')).toEqual({
      type: 'simulation_state_patch', tool: 't', path: '/a', value: 1,
    });
  });
});

describe('executionEventToSim (workflow)', () => {
  it('maps node_entered → node_visited', () => {
    expect(executionEventToSim({ type: 'node_entered', nodeId: 'n1', depth: 0 }, 'workflow')).toEqual({ type: 'node_visited', nodeId: 'n1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=runtime/__tests__/executionEventBridge`
Expected: FAIL — cannot find module `../executionEventBridge.js`.

- [ ] **Step 3: Write minimal implementation** (decompose into `bridgeAgent.ts`/`bridgeWorkflow.ts` helpers to respect max-lines)

```ts
// packages/backend/src/runtime/executionEventBridge.ts
import type { ExecutionEvent, ExecutionType } from '@daviddh/llm-graph-runner';

import type { AgentSimulationEvent } from '../routes/simulateAgentTypes.js';
import type { WorkflowSimEvent } from '../routes/simulate.js';
import { agentEventToSim } from './bridgeAgent.js';
import { workflowEventToSim } from './bridgeWorkflow.js';

export function executionEventToSim(
  ev: ExecutionEvent,
  executionType: ExecutionType
): AgentSimulationEvent | WorkflowSimEvent | null {
  return executionType === 'agent' ? agentEventToSim(ev) : workflowEventToSim(ev);
}
```

```ts
// packages/backend/src/runtime/bridgeAgent.ts
import type { ExecutionEvent } from '@daviddh/llm-graph-runner';

import type { AgentSimulationEvent } from '../routes/simulateAgentTypes.js';

function childFinishedToSim(ev: Extract<ExecutionEvent, { type: 'child_finished' }>): AgentSimulationEvent {
  const r = ev.result;
  const output = r.status === 'finished' ? r.result : '';
  const status = r.status === 'finished' ? r.outcome : 'error';
  return { type: 'child_finished', depth: ev.depth, output, status, tokens: ev.tokens ?? { input: 0, output: 0, cached: 0 } };
}

export function agentEventToSim(ev: ExecutionEvent): AgentSimulationEvent | null {
  switch (ev.type) {
    case 'child_awaiting_input':
      return { type: 'child_waiting', depth: ev.depth, text: ev.partial };
    case 'child_dispatched':
      return null; // emitted directly by driver with parent metadata the bridge lacks
    case 'child_finished':
      return childFinishedToSim(ev);
    case 'finished':
      return { type: 'simulation_complete' };
    case 'error':
      return { type: 'error', message: ev.message };
    case 'simulation_state_patch':
      return { type: 'simulation_state_patch', tool: ev.tool, path: ev.path, value: ev.value };
    case 'simulation_state_snapshot':
      return { type: 'simulation_state_snapshot', state: ev.state };
    default:
      return null;
  }
}
```

```ts
// packages/backend/src/runtime/bridgeWorkflow.ts
import type { ExecutionEvent } from '@daviddh/llm-graph-runner';

import type { WorkflowSimEvent } from '../routes/simulate.js';

export function workflowEventToSim(ev: ExecutionEvent): WorkflowSimEvent | null {
  switch (ev.type) {
    case 'node_entered':
      return { type: 'node_visited', nodeId: ev.nodeId };
    case 'finished':
      return { type: 'simulation_complete' };
    case 'error':
      return { type: 'error', message: ev.message };
    case 'simulation_state_patch':
      return { type: 'simulation_state_patch', tool: ev.tool, path: ev.path, value: ev.value };
    case 'simulation_state_snapshot':
      return { type: 'simulation_state_snapshot', state: ev.state };
    default:
      return null;
  }
}
```

```ts
// packages/backend/src/runtime/simulationCapabilities.ts
import {
  consoleLogger, consoleObservability, makeResolveChildConfig, noopPersistence, noopRateLimit, syncRecurseStrategy,
  type McpInvoker, type RuntimeCapabilities, type RuntimeServices, type SupabaseLike,
} from '@daviddh/llm-graph-runner';

import { resolveChildConfig } from '../routes/simulateChildResolver.js';

export function buildSimulationCapabilities(): RuntimeCapabilities {
  return { persistence: noopPersistence, dispatch: syncRecurseStrategy, observability: consoleObservability, rateLimit: noopRateLimit, logger: consoleLogger };
}

export function buildSimulationRuntimeServices(supabase: SupabaseLike, mcpPool: McpInvoker): RuntimeServices {
  return {
    mcpPool,
    supabase,
    resolveChildConfig: makeResolveChildConfig(supabase, async (sb, input) =>
      await resolveChildConfig({ supabase: sb as never, dispatchType: input.dispatchType, params: input.params, orgId: input.orgId })
    ),
  };
}
```

> Add the two sim-state members to BOTH `AgentSimulationEvent` (`simulateAgentTypes.ts`) and the workflow `WorkflowSimEvent` union (`simulate.ts`), plus a `child_finished` member to the workflow union (new behavior — Decision 7). Export `WorkflowSimEvent` from `simulate.ts` if not already. Temporary; removed at RU5.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=runtime/__tests__/executionEventBridge && npm run typecheck -w packages/backend`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/runtime/simulationCapabilities.ts packages/backend/src/runtime/executionEventBridge.ts packages/backend/src/runtime/bridgeAgent.ts packages/backend/src/runtime/bridgeWorkflow.ts packages/backend/src/runtime/__tests__/executionEventBridge.test.ts
git commit -m "feat(backend): sim capabilities wiring + throwaway ExecutionEvent→sim-SSE bridge (both engines)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Migrate BOTH sim handlers onto `executeTurn` behind ONE sim handler (BE routes by type)

**Files:**
- Modify: `packages/backend/src/routes/simulationOrchestrator.ts` (agent `runLoop`/`runChildLoop` closures over `executeAgentLoop`)
- Modify: `packages/backend/src/routes/simulateHandler.ts` (workflow `runWorkflow` closure over `executeWithCallbacks`)
- Create: `packages/backend/src/routes/simulateHandlerUnified.ts` (the one handler routing by `appType`)
- Create: `packages/backend/src/routes/simulationDriverHelpers.ts` (shared `buildTurnArgs`/`selectStepMachine` deps/`toResult`)
- Modify: `packages/backend/src/server.ts` (`/simulate` + `/simulate-agent` both delegate to the unified handler)
- Test: `packages/backend/src/routes/__tests__/simulateHandlerUnified.test.ts`

**Interfaces:**
- `handleSimulateUnified(req, res)` — parses the body, derives `executionType` from `appType` in the body (`'agent'` when `body.appType === 'agent'` OR a child is active; else `'workflow'`), builds the engine-specific `StepMachine` deps (agent closures wrap `executeAgentLoop`+`buildLoopConfig`; workflow closures wrap `executeWithCallbacks`+`buildContextWithRegistry`), constructs the sim-state store from `body.simulationState`/`simulationStateWritable`, runs `executeTurn({ executionType, machine: selectStepMachine(executionType, deps), runChildToTermination, ... })`, iterates `output.events`, bridges each via `executionEventToSim(ev, executionType)`, and writes non-null events through the appropriate SSE writer (`writeAgentSSE` / `writeSSE`). `child_dispatched` is emitted directly by the driver (carrying parent metadata) as today.
- `/simulate` and `/simulate-agent` (`server.ts:151-152`) both call `handleSimulateUnified`; the old `handleSimulate`/`handleSimulateAgent` become thin shims (or are inlined). This is the server-side agent-vs-workflow routing the spec demands.

> **The child's engine may differ from the parent's** (agent dispatching a workflow / vice-versa). `runChildToTermination(config)` builds a CHILD `StepMachine` via `selectStepMachine(childExecutionType, childDeps)` and runs it to termination — `childExecutionType` comes from the dispatch type (`invoke_workflow` → `'workflow'`; `invoke_agent`/`create_agent` → `'agent'`). This realizes §1/§4 interchangeability. Decompose aggressively to respect max-lines (each closure builder + the driver loop is its own helper).
>
> The legacy agent `continueParentAfterChild` message-threading moves into the agent `runChildToTermination`/`injectChildResult` closures; the workflow path GAINS re-injection it never had (Decision 7).

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/__tests__/simulateHandlerUnified.test.ts
import { describe, expect, it, jest } from '@jest/globals';

// Override the engine runners with stubs so no real LLM is called.
jest.unstable_mockModule('@daviddh/llm-graph-runner', async () => {
  const actual = await import('@daviddh/llm-graph-runner');
  return { ...actual };
});

const { runUnifiedSimulation } = await import('../simulateHandlerUnified.js');

function fakeRes(): { events: string[]; write: (s: string) => void; flush?: () => void; end: () => void } {
  const events: string[] = [];
  return {
    events,
    write: (s: string) => {
      const m = /"type":"([^"]+)"/.exec(s);
      if (m) events.push(m[1]!);
    },
    end: () => undefined,
  };
}

describe('runUnifiedSimulation', () => {
  it('routes a workflow body through the workflow engine and completes', async () => {
    const res = fakeRes();
    await runUnifiedSimulation(
      { body: { tenantID: 't', orgId: 'o', graph: { mcpServers: [] }, messages: [], currentNode: 'start', simulationState: {}, simulationStateWritable: true }, supabase: {} as never },
      res as never,
      { runWorkflowOverride: async () => null } // test seam: inject a null-output workflow run
    );
    expect(res.events).toContain('simulation_complete');
  });
});
```

> The `runWorkflowOverride`/`runAgentLoopOverride` test seam is test-only — wire it as an optional 3rd arg that, when present, replaces the real `executeWithCallbacks`/`executeAgentLoop` closure. If `buildLoopConfig`/`buildContextWithRegistry` call a real model, this seam is what keeps the test offline.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=routes/__tests__/simulateHandlerUnified`
Expected: FAIL — module/handler missing.

- [ ] **Step 3: Write minimal implementation** (decompose across `simulateHandlerUnified.ts` + `simulationDriverHelpers.ts`)

```ts
// packages/backend/src/routes/simulateHandlerUnified.ts  (sketch — keep each fn ≤40 lines)
import { createSimStateStore, executeTurn, selectStepMachine, type ExecutionType } from '@daviddh/llm-graph-runner';

import { buildSimulationCapabilities, buildSimulationRuntimeServices } from '../runtime/simulationCapabilities.js';
import { executionEventToSim } from '../runtime/executionEventBridge.js';
import { buildAgentMachineDeps, buildWorkflowMachineDeps, buildRunChildToTermination, writeSimEvent } from './simulationDriverHelpers.js';

export interface UnifiedConfig { body: Record<string, unknown>; supabase: unknown; }
export interface UnifiedOverrides { runWorkflowOverride?: () => Promise<unknown>; runAgentLoopOverride?: () => Promise<unknown>; }

function pickExecutionType(body: Record<string, unknown>): ExecutionType {
  return body.appType === 'agent' ? 'agent' : 'workflow';
}

export async function runUnifiedSimulation(config: UnifiedConfig, res: unknown, overrides: UnifiedOverrides = {}): Promise<void> {
  const executionType = pickExecutionType(config.body);
  const simStore = createSimStateStore(/* body.simulationState */ {}, /* writable */ true);
  const deps = executionType === 'agent'
    ? buildAgentMachineDeps(config, simStore, overrides)
    : buildWorkflowMachineDeps(config, simStore, overrides);
  const output = await executeTurn({
    environment: 'simulation', executionType, dispatchDepth: 0, maxDispatchDepth: 10,
    capabilities: buildSimulationCapabilities(),
    services: buildSimulationRuntimeServices(config.supabase as never, deps.mcpPool),
    simStore,
    machine: selectStepMachine(executionType, deps.machineDeps),
    runChildToTermination: buildRunChildToTermination(config, deps),
  });
  for await (const ev of output.events) writeSimEvent(res, ev, executionType);
}
```

`buildAgentMachineDeps` wraps `buildLoopConfig`+`executeAgentLoop` (reusing today's `simulationOrchestrator` helpers); `buildWorkflowMachineDeps` wraps `buildContextWithRegistry`+`executeWithCallbacks` (reusing today's `simulateHandler` helpers, forwarding `onNodeVisited`/`onNodeProcessed` into the emitter). `writeSimEvent` runs `executionEventToSim(ev, executionType)` and writes non-null via `writeAgentSSE`/`writeSSE`. The HTTP entrypoints (`handleSimulate`, `handleSimulateAgent`) set SSE headers, call `runUnifiedSimulation`, and end the response.

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -w packages/backend -- --testPathPattern="routes/__tests__/simulateHandlerUnified|routes/__tests__/simulateHandler|routes/__tests__/simulationOrchestrator" && npm run typecheck -w packages/backend`
Expected: PASS / clean. (Pre-existing `simulateHandler.test.ts`/`simulationOrchestrator.test.ts` may need re-pointing at the unified path.)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/simulateHandlerUnified.ts packages/backend/src/routes/simulationDriverHelpers.ts packages/backend/src/routes/simulateHandler.ts packages/backend/src/routes/simulationOrchestrator.ts packages/backend/src/server.ts packages/backend/src/routes/__tests__/simulateHandlerUnified.test.ts
git commit -m "feat(backend): drive BOTH sims through executeTurn behind one handler (BE routes by appType)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: FE sim-state store hook + `setByJsonPointer` + JSON panel + MCP badge + dialogs

**Files:**
- Create: `packages/web/app/utils/jsonPointer.ts`
- Modify: `packages/web/app/hooks/useSimulationState.ts`
- Create: `packages/web/app/components/panels/SimulationStatePanel.tsx`, `TestingPresetsPopover.tsx`, `ResetSimulationDialog.tsx`, `TenantSwitchResetDialog.tsx`, `packages/web/app/components/McpSideEffectBadge.tsx`
- Test: `packages/web/app/utils/__tests__/jsonPointer.test.ts`, `packages/web/app/components/__tests__/McpSideEffectBadge.test.tsx`

> **Data source:** the panel consumes the **runtime-emitted** `simulation_state_patch`/`simulation_state_snapshot` events the bridge forwards over SSE (Task 17) — not FE-side optimistic-local patches. The FE sim-stream parser must recognize those two types; `useSimulationState` applies a `simulation_state_patch` display-only via `setByJsonPointer`, and **replaces** its copy on `simulation_state_snapshot` via `adoptSnapshot` (the only authoritative update, per §6). This validates §6's runtime-as-sole-writer model.

**Interfaces:**
- `setByJsonPointer(obj, pointer, value)` (FE copy of Task 7 logic; web cannot import the api internal path).
- `useSimulationState` gains `simulationState: Record<string, unknown>`, `adoptSnapshot(snapshot)`, `resetSimulationState()`.
- `SimulationStatePanel` renders `simulationState` via `JsonBlock` (from `JsonDisplay.tsx`) + empty-state + a reset footer button.
- `McpSideEffectBadge` — shadcn `<Badge>` warning tone + `aria-label` + tooltip, rendered where `providerType === 'mcp'`.
- `ResetSimulationDialog` / `TenantSwitchResetDialog` — shadcn `AlertDialog` using §8 keys.
- `TestingPresetsPopover` — wraps the existing `TestingPresetsSection` in a `Popover`, replacing the tenant text input with `TenantPicker`; a tenant change while `simulationState` is non-empty OR sim messages exist opens `TenantSwitchResetDialog`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/web/app/utils/__tests__/jsonPointer.test.ts
import { describe, expect, it } from '@jest/globals';

import { setByJsonPointer } from '../jsonPointer';

describe('setByJsonPointer (FE)', () => {
  it('sets a nested path without mutating input', () => {
    const input = { a: 1 };
    const out = setByJsonPointer(input, '/forms/email', 'x');
    expect(out).toEqual({ a: 1, forms: { email: 'x' } });
    expect(input).toEqual({ a: 1 });
  });
});
```

```tsx
// packages/web/app/components/__tests__/McpSideEffectBadge.test.tsx
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { McpSideEffectBadge } from '../McpSideEffectBadge';
import messages from '../../../messages/en.json';

describe('McpSideEffectBadge', () => {
  it('renders the localized label with an aria-label', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <McpSideEffectBadge />
      </NextIntlClientProvider>
    );
    expect(screen.getByLabelText(messages.simulation.mcpBadge.tooltip)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPattern="utils/__tests__/jsonPointer|McpSideEffectBadge"`
Expected: FAIL — modules / `simulation.mcpBadge.*` keys missing (add keys in Task 20 first if lint blocks).

- [ ] **Step 3: Write minimal implementation**

Create `packages/web/app/utils/jsonPointer.ts` (identical RFC-6901 setter as Task 7, no `.js` extension). Add to `useSimulationState.ts`:

```ts
const [simulationState, setSimulationState] = useState<Record<string, unknown>>({});
const adoptSnapshot = useCallback((snapshot: Record<string, unknown>) => setSimulationState(snapshot), []);
const resetSimulationState = useCallback(() => setSimulationState({}), []);
```

Expose `simulationState`/`adoptSnapshot`/`resetSimulationState`. Create `SimulationStatePanel.tsx`, `McpSideEffectBadge.tsx`, `ResetSimulationDialog.tsx`, `TenantSwitchResetDialog.tsx`, `TestingPresetsPopover.tsx`:

```tsx
// packages/web/app/components/McpSideEffectBadge.tsx
'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function McpSideEffectBadge(): React.JSX.Element {
  const t = useTranslations();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="border-amber-500 text-amber-600" aria-label={t('simulation.mcpBadge.tooltip')}>
          {t('simulation.mcpBadge.label')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t('simulation.mcpBadge.tooltip')}</TooltipContent>
    </Tooltip>
  );
}
```

(Adjust `JsonBlock`/`TestingPresetsSection`/`TenantPicker` imports to real exports. Wire `McpSideEffectBadge` into the tool picker + tool-call cards where `providerType === 'mcp'`. Run `npx shadcn@latest add badge tooltip popover alert-dialog` for any not already present.)

- [ ] **Step 4: Run tests + lint**

Run: `npm run test -w packages/web -- --testPathPattern="utils/__tests__/jsonPointer|McpSideEffectBadge" && npm run lint -w packages/web`
Expected: PASS / clean (translation keys land in Task 20 — do Task 20 first or add keys now if lint flags them).

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/utils/jsonPointer.ts packages/web/app/hooks/useSimulationState.ts packages/web/app/components/panels/SimulationStatePanel.tsx packages/web/app/components/panels/TestingPresetsPopover.tsx packages/web/app/components/panels/ResetSimulationDialog.tsx packages/web/app/components/panels/TenantSwitchResetDialog.tsx packages/web/app/components/McpSideEffectBadge.tsx packages/web/app/utils/__tests__/jsonPointer.test.ts packages/web/app/components/__tests__/McpSideEffectBadge.test.tsx
git commit -m "feat(web): sim-state panel + jsonPointer + reset/tenant-switch dialogs + MCP badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Collapse the two FE sim stream fns into one (BE routes by `appType`) + translations + toolbar

**Files:**
- Create: `packages/web/app/lib/simulationApi.ts` (one `streamSimulation` posting `/api/simulate`)
- Modify: `packages/web/app/hooks/useSimulationSend.ts`, `packages/web/app/hooks/simulationSendHelpers.ts`
- Modify: `packages/web/messages/en.json`
- Modify: the simulation toolbar component (`grep -rn "TestingPresetsSection\|toolbar" packages/web/app/components`) to mount the testing-presets + sim-state icon buttons
- Test: `packages/web/app/__tests__/simulationMessages.test.ts`, `packages/web/app/hooks/__tests__/useSimulationSend.test.ts`

**Interfaces:**
- **One** `streamSimulation(params, callbacks, signal)` in `simulationApi.ts` posting `/api/simulate` with a body that always carries `appType` (`'agent' | 'workflow'`) plus the union of fields both engines need (the BE ignores irrelevant fields per `appType`). This **deletes** the FE's agent-vs-workflow choice: `useSimulationSend` no longer branches on `appType`/`isChildActive` to pick a fn — it builds one body (setting `appType` from `deps.appType`/child-active) and calls the single `streamSimulation`. `streamAgentSimulation`/`streamSimulation` in `api.ts`/`agentSimulationApi.ts` are removed (or re-export the unified fn) — FLAGGED: the BE (Task 18) now routes by `appType`, so the FE only needs to *report* the type, not choose the endpoint.
- §8 translation keys under a `simulation` namespace.
- Toolbar renders the testing-presets icon (opens `TestingPresetsPopover`) + the sim-state icon (opens `SimulationStatePanel`).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/web/app/__tests__/simulationMessages.test.ts
import { describe, expect, it } from '@jest/globals';

import messages from '../../messages/en.json';

const REQUIRED = [
  'resetState.title', 'resetState.description', 'resetState.confirm', 'resetState.cancel',
  'tenantSwitchReset.title', 'tenantSwitchReset.description', 'tenantSwitchReset.confirm', 'tenantSwitchReset.cancel',
  'toolbar.testingPresetsLabel', 'toolbar.simulationStateLabel', 'toolbar.openPanel',
  'statePanel.empty', 'statePanel.resetButton',
  'mcpBadge.label', 'mcpBadge.tooltip',
];

describe('simulation translation keys', () => {
  it('all §8 keys exist', () => {
    const sim = (messages as Record<string, Record<string, unknown>>).simulation;
    for (const path of REQUIRED) {
      const [group, key] = path.split('.');
      expect((sim[group] as Record<string, unknown>)[key]).toBeDefined();
    }
  });
});
```

```ts
// packages/web/app/hooks/__tests__/useSimulationSend.test.ts
// Assert the hook calls ONE streamSimulation with appType set, for both agent and workflow deps.
// (Mock simulationApi.streamSimulation; assert it's called once with body.appType === expected.)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPattern="simulationMessages|useSimulationSend"`
Expected: FAIL — keys missing / hook still branches into two fns.

- [ ] **Step 3: Write minimal implementation**

Add the `simulation` namespace to `en.json`:

```json
"simulation": {
  "resetState": { "title": "Reset simulation state?", "description": "This clears the current simulation state and conversation. This cannot be undone.", "confirm": "Reset", "cancel": "Cancel" },
  "tenantSwitchReset": { "title": "Switch tenant and reset?", "description": "Changing the tenant resets the simulation state and conversation. This cannot be undone.", "confirm": "Switch and reset", "cancel": "Cancel" },
  "toolbar": { "testingPresetsLabel": "Testing presets", "simulationStateLabel": "Simulation state", "openPanel": "Open panel" },
  "statePanel": { "empty": "No simulation state yet.", "resetButton": "Reset simulation" },
  "mcpBadge": { "label": "Real", "tooltip": "MCP tools run for real in simulation — this call has real side effects." }
}
```

Create `simulationApi.ts` with one `streamSimulation` (posts `/api/simulate`, reuses `readSseStream`). Refactor `useSimulationSend.ts` to build one body (`appType` from `deps.appType` or child-active) and call the single fn; collapse `sendAgentSim`/`sendWorkflowSim` in `simulationSendHelpers.ts` into one `sendSim`. Wire the toolbar icon buttons (using `toolbar.*` labels as `aria-label`/tooltip).

- [ ] **Step 4: Run tests + lint**

Run: `npm run test -w packages/web -- --testPathPattern="simulationMessages|useSimulationSend|jsonPointer|McpSideEffectBadge" && npm run lint -w packages/web`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/simulationApi.ts packages/web/app/hooks/useSimulationSend.ts packages/web/app/hooks/simulationSendHelpers.ts packages/web/messages/en.json packages/web/app/__tests__/simulationMessages.test.ts packages/web/app/hooks/__tests__/useSimulationSend.test.ts
git commit -m "feat(web): one sim stream fn (BE routes by appType) + sim i18n + toolbar buttons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Full gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full check**

Run: `npm run check`
Expected: format clean, lint clean (no `eslint-disable`, no `any`), `tsc -b` clean across all packages.

- [ ] **Step 2: Run all touched suites**

Run: `npm run test -w packages/api && npm run test -w packages/backend -- --testPathPattern="runtime|simulateHandlerUnified|simulationOrchestrator|simulateHandler" && npm run test -w packages/web -- --testPathPattern="jsonPointer|McpSideEffectBadge|simulationMessages|useSimulationSend"`
Expected: all green.

- [ ] **Step 3: Commit any formatting fixups**

```bash
git add -p
git commit -m "chore: RU3 full-gate formatting/lint fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (spec section → task)

| Spec section | Task(s) |
|---|---|
| §1 two engines, one core; engine chosen by type server-side; child dispatch interchangeable | 14, 15, 18 |
| §2 In-scope: core `executeTurn` + `childDispatch` driving a `StepMachine` (Agent + Workflow adapters) | 11, 14, 15 |
| §2 sim drivers — BOTH agent and workflow — on the core behind one sim API (BE routes by type) | 17, 18, 20 |
| §2/§3/§6.3 `RuntimeCapabilities` (5 seams) + `RuntimeServices` | 4 |
| §3/§6.4 `ChildResult` envelope + env-aware termination mapping | 1, 5 |
| §3 `DispatchStrategy`/`DispatchPersistence` contracts | 4 |
| §3 sim impls (SyncRecurse + Noop + console/no-op caps) | 6, 10 |
| §3/§6.2 env-discriminated `ProviderCtx` | 9 |
| §4 `StepMachine` interface + AgentStepMachine (`executeAgentLoop`) + WorkflowStepMachine (`executeWithCallbacks`) | 14 |
| §4 `executeTurn` selects engine by type + drives dispatch loop; `childDispatch` re-injects | 11, 15 |
| §5 superset `ExecutionEvent` emitter + bridge + completeness assertion | 1, 2, 16, 17 |
| §6 sim-state model (deep-freeze, clone-write, `DeepReadonly`, patch/snapshot, abort, mutation-throws test) | 3, 7, 8 |
| §6 sim-state JSON-Pointer write | 7 |
| §7/§13 per-tool `simulatedNoop` seam in every builtin | 9, 12 |
| §7/§12.4 MCP "real side-effects" badge | 19 |
| §8 testing-presets popover, sim-state panel, reset/tenant-switch modals, i18n; collapse two FE stream fns into one | 19, 20 |
| §9 validation: behavior tests on the new core (both engines) | 5, 8, 10, 11, 14, 15, 16, 17, 18 |
| §10 child-result injection shared; only sim's sync strategy runs | 10, 11, 15 |
| §11 the throwaway bridge carries the two sim-state events | 17, 19 |
| RU3 child seam (north-star `loadChildAgentGraph` → real `resolveChildConfig`) | 4, 13 |
| Full gate (`npm run check`) | 21 |

**Out of scope (correctly deferred, per spec §2/§10/§11):** running `DurableDispatchStrategy`/`SupabaseDispatchPersistence` (contracts only — Task 4); prod edge migration / retrofitting the `StepMachine` seam onto prod (RU4); SSE consumer cutover + bridge deletion (RU5); legacy orchestrator deletion (RU6); bespoke per-tool sim behavior (every builtin no-ops uniformly).

**Spec requirements I could NOT cleanly map (FLAGGED, not silently fixed):**
1. **§4 "`executeAgent` yields a dispatch decision"** — false against code. The dispatch decision is on `AgentLoopResult.dispatchResult` (agent) and `CallAgentOutput.dispatchResult` (workflow). RU3 wraps the loop / the workflow runner behind a `StepMachine`, never the per-attempt `executeAgent` (Decision 1; Task 14).
2. **"FE stops choosing between `streamAgentSimulation`/`streamSimulation`" vs. reality** — the FE *already* posts both to `/api/simulate`; the real choice is which body/stream fn + which of the TWO backend handlers (`/simulate`, `/simulate-agent`). RU3's unification = BE routes agent-vs-workflow from `appType` in ONE handler (Task 18) and the FE collapses to ONE stream fn carrying `appType` (Task 20) (Decision 3).
3. **Prod engine choice is via graph-building, not a `StepMachine` switch** — `fetchGraphAndKeys` branches `appType === 'agent' ? buildAgentRuntimeGraph : ensureGraphData` feeding a single runner. RU3 introduces the `StepMachine` seam and proves it on the two sims; retrofitting prod is RU4 (Decision 2).
4. **Workflow sim gains child re-injection it never had** — `simulateHandler.ts` only emitted `child_dispatched` and stopped. Migrating onto `executeTurn` adds parent-resume to the workflow sim (a deliberate behavior gain, not parity) (Decision 7; Tasks 14, 17, 18).
5. **North-star `loadChildAgentGraph`/`AgentGraph`** — no such type; real seam is `resolveChildConfig`/`ResolvedChildConfig` (includes `skills`). Mapped to `RuntimeServices.resolveChildConfig`, injected not re-ported in RU3 (Decisions 5; Tasks 4, 13).
6. **§6.4 prod `no_result`/`finished` rows** — forward-design; only the pure mapper is unit-tested in RU3, exercised by a running strategy in RU4 (Decision 6; Task 5).
7. **`RuntimeServices.supabase: SupabaseClient`** — api can't import the backend type; typed structurally as `SupabaseLike` (Task 4).
8. **Two sim-SSE unions + the two sim-state members** — the throwaway bridge temporarily extends BOTH `AgentSimulationEvent` and the workflow union with `simulation_state_patch`/`simulation_state_snapshot` (and the workflow union with `child_finished`), all removed at RU5 (Decision 10; Tasks 17, 19).
