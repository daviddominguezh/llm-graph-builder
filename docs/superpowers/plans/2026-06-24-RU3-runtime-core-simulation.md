# RU3 — Runtime core + simulation driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the outer agent orchestration (child dispatch, ChildResult injection, event emission, await-input handling) out of the duplicated `simulationOrchestrator.ts` into a single capability-parameterized core in `packages/api` (`executeTurn` + `childDispatch` wrapping the existing `callAgentStep`/`executeAgentLoop`), then migrate the simulation driver onto it (sync recursion, no-op persistence, console caps), emitting a superset `ExecutionEvent` union bridged to today's sim-SSE shape — while production stays on the legacy edge orchestrator until RU4.

**Architecture:** `executeTurn` builds an env-discriminated `ProviderCtx`, runs the existing inner loop, and inspects the loop's `dispatchResult` (`DispatchSentinel`). On a dispatch decision it calls `childDispatch`, which runs the child through the injected `DispatchStrategy`, maps the child's termination to a `ChildResult`, and re-injects it into the parent (shared injection logic; only sim's `SyncRecurseStrategy` runs here, prod's durable strategy is contract-only). All progress flows through an `ExecutionEvent` emitter (superset of all three FE shapes); the backend sim handler converts those events to today's sim-SSE shape via a throwaway bridge. Sim state is held authoritatively by the runtime: deep-frozen at the ctx boundary, deep-cloned on write, surfaced as display-only `simulation_state_patch` events plus a terminal `simulation_state_snapshot`.

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `noUncheckedIndexedAccess`), the api package's existing pipeline (`callAgentStep`, `executeAgentLoop`, `DispatchSentinel`/`FinishSentinel`), Jest ESM (`unstable_mockModule`), Express SSE (backend bridge), Next.js 16 / React / shadcn (`AlertDialog`, `Popover`, `Badge`) + `next-intl` messages (`packages/web/messages/en.json`).

## Global Constraints

- Monorepo npm workspaces. ESM (`"type":"module"`, NodeNext). TS strict, `noUncheckedIndexedAccess`. **Never `any`. Never eslint-disable.**
- ESLint: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2 — split into helpers/files, never compress lines. (This core is large — decompose aggressively.)
- Tests: Jest ESM — `npm run test -w packages/<pkg> -- --testPathPattern=…`. Full gate: `npm run check`.
- Prettier: single quotes, 2-space indent, width 110, trailing comma es5; `@trivago/prettier-plugin-sort-imports` import sorting.
- **Always add translations** for any user-facing copy (the sim FE UX adds several — keys listed in Task 17).
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; stage files explicitly (never `git add -A` / `-am`).

---

## Decisions / spec-vs-code findings (READ BEFORE STARTING — these are NOT silent fixes)

These are verified against the real code. Where the spec assumes a shape the code does not have, this plan implements against the real code and flags it here.

1. **`executeAgent` does NOT yield a dispatch decision.** The spec (§4) says "`executeAgent` yields a dispatch decision (today's `parentResult.dispatchResult`)". In reality `executeAgent` (`core/agentExecutor.ts`) is the *attempt* executor; the dispatch decision is surfaced one layer up: `callAgentStep` / `executeAgentFlowRecursive` returns a `CallAgentOutput` whose optional `dispatchResult?: DispatchSentinel` and `finishResult?: FinishSentinel` carry the decision, and `executeAgentLoop` returns an `AgentLoopResult` with the same two optional fields. **RU3 wraps `executeAgentLoop` (the loop), not `executeAgent` (the attempt).** `executeTurn` inspects `loopResult.dispatchResult` / `loopResult.finishResult`. No re-injection loop exists today (the legacy backend `simulationOrchestrator.runSimulationOrchestration` owns it); RU3 ports that loop into `packages/api`.

2. **`ProviderCtx` is a flat interface, not a discriminated union, and has no `environment` field.** Real shape (`providers/provider.ts:39-53`): `{ orgId, tenantId, agentId, isChildAgent, logger, conversationId?, contextData?, oauthTokens, mcpServers, services }`. It already has `isChildAgent` (good — finish gating uses it). It does NOT have `dispatchDepth` (north-star §6.2 adds it). **RU3 converts `ProviderCtx` to the env-discriminated union** by adding a shared base plus `environment: 'production' | 'simulation'` arms (Task 9). This is a breaking type change consumed by every builtin + `providerCtxFromContext` + `buildSimulationProviderCtx`; Task 9 updates all of them.

3. **No `AgentGraph` type exists; the child seam is `ResolvedChildConfig`, not `loadChildAgentGraph`.** The spec's `RuntimeServices.loadChildAgentGraph: (agentId) => Promise<AgentGraph>` does not match reality. graph-types exports no `AgentGraph`. The real child-resolution seam is `resolveChildConfig(input): Promise<ResolvedChildConfig>` (`simulateChildResolver.ts`), where `ResolvedChildConfig = { systemPrompt, context, modelId, maxSteps, mcpServers, skills, isChildAgent, task, agentId?, version? }`. **RU3 defines `RuntimeServices.resolveChildConfig: (input: ResolveChildInput) => Promise<ResolvedChildConfig>`** (the port of `simulateChildResolver.ts`) instead of `loadChildAgentGraph`. FLAGGED — confirm with RU4 author that prod uses the same resolver.

4. **`rag` registers `search_rag`, not `search`.** Spec §13's coverage table says `rag.search`; the real tool name is `search_rag` (`providers/rag/buildTools.ts`). `kv_store` registers `list_keys`/`get_values`/`search`/`update_value`. The `simulatedNoop` seam (Task 12) is keyed on the real names. FLAGGED.

5. **Prod END-without-finish has no explicit "no_result error" path today.** Real prod (`executeCoreChildFinish.ts:persistCoreResult`) persists `output.text ?? ''` and returns `undefined` (parent not resumed) — there is no `{ status:'error', code:'no_result' }` envelope today. The spec's `ChildResult` mapping is a *forward design* for RU4. RU3 implements the full mapping table in `mapTerminationToChildResult` (Task 5) including the prod rows, but only the **simulation** rows are exercised by a running strategy in RU3 (the prod `no_result`/`finished` rows are covered by unit tests of the pure mapper, run in RU4). FLAGGED as forward-design.

6. **RU1/RU2 cross-deps (confirm names at impl time):** RU1 exports `makeKvStoreService(supabase, storeId)`, `makeRagStoreService(supabase, storeId, client)`, `makeLeadScoringDbService(supabase, conversationId)`, `makeNoStoreBoundKvServices()`, `makeNoStoreBoundRagServices()` from `@daviddh/shared-store-services` (today the backend still has local `makeNoStoreBound*`). RU2 exports `createMcpPoolClient(opts): McpInvoker` and the `McpInvoker` interface from `@daviddh/llm-graph-runner` (`providers/mcp/poolClient.ts`). RU3 references these as existing. FLAGGED — verify exact import paths when RU1/RU2 land.

7. **`simulateHandler.ts` has two sim paths.** The orchestrator path (`simulationOrchestrator.ts`, agent sim) and a separate legacy `buildContextWithRegistry` path in `simulateHandler.ts` (workflow/no-store sim). RU3 migrates the **agent orchestrator path** onto `executeTurn` (Task 16). The workflow path stays legacy until RU6.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/api/src/events/types.ts` (create) | The superset `ExecutionEvent` union + `Tokens` type (§6.6). |
| `packages/api/src/events/emitter.ts` (create) | `createEventEmitter()`: push events into an `AsyncIterable<ExecutionEvent>` buffer; `emit()` + `close()`. |
| `packages/api/src/events/__tests__/emitter.test.ts` (create) | Emitter buffering/ordering/close test. |
| `packages/api/src/events/__tests__/emitterCompleteness.test.ts` (create) | §5 assertion: every field each of the 3 RU5 consumers needs is constructible from the union. |
| `packages/api/src/runtime/types.ts` (create) | `RuntimeInput`/`RuntimeOutput` env unions, `DeepReadonly`, `RuntimeBase`, depth/timeout consts. |
| `packages/api/src/runtime/childResult.ts` (create) | `ChildResult`, `ChildErrorCode`, `mapTerminationToChildResult()` (the §6.4 table). |
| `packages/api/src/runtime/__tests__/childResult.test.ts` (create) | Every mapping row incl. env-aware END-without-finish. |
| `packages/api/src/capabilities/dispatchPersistence.ts` (create) | `DispatchPersistence` + `DispatchHandle` contract. |
| `packages/api/src/capabilities/dispatchStrategy.ts` (create) | `DispatchStrategy`, `DispatchArgs`, `DispatchOutcome` contract + shared `injectChildResultIntoParent`. |
| `packages/api/src/capabilities/observability.ts` (create) | `Observability` + `RateLimiter` interfaces. |
| `packages/api/src/capabilities/index.ts` (create) | `RuntimeCapabilities` + `RuntimeServices` aggregate types. |
| `packages/api/src/simulation/noopPersistence.ts` (create) | `NoopPersistence` impl. |
| `packages/api/src/simulation/consoleCapabilities.ts` (create) | console `Observability`/`RunnerLogger`, `NoopRateLimit`. |
| `packages/api/src/simulation/syncRecurseStrategy.ts` (create) | `SyncRecurseStrategy`: runs child inline → `completed`. |
| `packages/api/src/simulation/__tests__/syncRecurseStrategy.test.ts` (create) | Inline-recursion + depth-guard behavior. |
| `packages/api/src/runtime/simStateStore.ts` (create) | `createSimStateStore()`: deep-freeze read copy, deep-clone write, JSON-Pointer set, patch list, snapshot. |
| `packages/api/src/runtime/__tests__/simStateStore.test.ts` (create) | Freeze-throws, write-clone, patch/snapshot, abort-keeps-last. |
| `packages/api/src/runtime/jsonPointer.ts` (create) | `setByJsonPointer(obj, pointer, value)` (RFC 6901). |
| `packages/api/src/runtime/simulatedNoop.ts` (create) | Shared `simulatedNoop(args, ctx)` returned by every builtin in sim. |
| `packages/api/src/runtime/childDispatch.ts` (create) | `childDispatch()`: run strategy, map termination, emit `child_*`, re-inject. |
| `packages/api/src/runtime/executeTurn.ts` (create) | `executeTurn()`: build ctx, run loop, drive dispatch loop, emit events, return `RuntimeOutput`. |
| `packages/api/src/runtime/__tests__/executeTurn.test.ts` (create) | Single-turn + one-dispatch + depth-cap integration. |
| `packages/api/src/runtime/resolveChildConfig.ts` (create) | Port of backend `simulateChildResolver.ts` into api (the `RuntimeServices.resolveChildConfig` seam). |
| `packages/api/src/providers/provider.ts` (modify) | `ProviderCtx` → env-discriminated union (`environment`, `dispatchDepth`, sim arms). |
| `packages/api/src/core/providerCtxFromContext.ts` (modify) | Produce the production arm of the union. |
| `packages/api/src/providers/{kv_store,rag,forms,lead_scoring,web}/buildTools.ts` (modify) | `if (ctx.environment === 'simulation') return simulatedNoop(args, ctx)` guard. |
| `packages/api/src/index.ts` (modify) | Re-export the new public types (`ExecutionEvent`, `ChildResult`, `RuntimeCapabilities`, `RuntimeServices`, `executeTurn`, sim impls). |
| `packages/backend/src/routes/simulationProviderCtx.ts` (modify) | Set `environment: 'simulation'` + sim arm when building ctx. |
| `packages/backend/src/runtime/simulationCapabilities.ts` (create) | Wire sim `RuntimeCapabilities` + `RuntimeServices` for the driver. |
| `packages/backend/src/runtime/executionEventBridge.ts` (create) | Throwaway `ExecutionEvent → AgentSimulationEvent` mapper. |
| `packages/backend/src/runtime/__tests__/executionEventBridge.test.ts` (create) | Bridge maps every event the FE consumes. |
| `packages/backend/src/routes/simulationOrchestrator.ts` (modify) | `runSimulationOrchestration` becomes a thin driver over `executeTurn` + the bridge. |
| `packages/web/app/utils/jsonPointer.ts` (create) | FE `setByJsonPointer` for optimistic patch preview. |
| `packages/web/app/hooks/useSimulationState.ts` (modify) | `adoptSnapshot` + `resetSimulationState` + `simulationState` store. |
| `packages/web/app/components/panels/SimulationStatePanel.tsx` (create) | Sim-state panel (`JsonBlock` + reset button). |
| `packages/web/app/components/panels/TestingPresetsPopover.tsx` (create) | Testing-presets popover w/ `TenantPicker`. |
| `packages/web/app/components/panels/ResetSimulationDialog.tsx` (create) | Reset `AlertDialog`. |
| `packages/web/app/components/panels/TenantSwitchResetDialog.tsx` (create) | Tenant-switch reset `AlertDialog`. |
| `packages/web/app/components/McpSideEffectBadge.tsx` (create) | The "real side effects" badge. |
| `packages/web/messages/en.json` (modify) | The §12.5 translation keys. |

---

### Task 1: `ExecutionEvent` superset union + `Tokens` type

**Files:**
- Create: `packages/api/src/events/types.ts`
- Test: `packages/api/src/events/__tests__/types.test.ts`

**Interfaces:**
- Consumes: `ChildResult` is referenced as a forward import from `../runtime/childResult.js` — but to avoid a cycle, Task 1 inlines a local `ChildResultRef` shape and Task 5 replaces it. (Actually: define `ExecutionEvent` to import `ChildResult` from `../runtime/childResult.js`; Task 5 lands first if dispatched out of order — so here we define `ChildResult` co-located is wrong; instead this task imports the type lazily. To keep tasks independently testable, Task 1 declares `child_finished` with `result: ChildResult` and we add `childResult.ts` as a stub in this task.)
- Produces: `export type Tokens = { input: number; output: number; cached: number; costUSD?: number }` and `export type ExecutionEvent = …` (full union below).

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

First create the `ChildResult` stub it imports (this is the real file Task 5 will flesh out — Task 5 only adds the mapper, the type lands here so the union compiles):

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

Then the events union:

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
  | { type: 'child_dispatched'; childExecutionId: string; depth: number }
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
- Consumes: `ExecutionEvent` from `../events/types.js` (Task 1).
- Produces:
  - `export interface EventEmitter { emit(ev: ExecutionEvent): void; close(): void; events: AsyncIterable<ExecutionEvent>; }`
  - `export function createEventEmitter(): EventEmitter` — a single-consumer push buffer: `emit` enqueues; `close` ends iteration; `events` yields in emission order, draining queued events then awaiting new ones.

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

### Task 3: Runtime types — `DeepReadonly`, `RuntimeInput`/`RuntimeOutput`, depth/timeout consts

**Files:**
- Create: `packages/api/src/runtime/types.ts`
- Test: `packages/api/src/runtime/__tests__/types.test.ts`

**Interfaces:**
- Consumes: `ExecutionEvent` from `../events/types.js` (Task 1).
- Produces:
  - `export type DeepReadonly<T>` (recursive readonly).
  - `export const MAX_DISPATCH_DEPTH = 10;` and `export const MAX_CHILD_RUNTIME_MS = 60 * 60 * 1000;`
  - `export interface RuntimeBase { orgId; tenantId; userId; agentId; selectedTools; mcpServers; dispatchDepth; maxDispatchDepth; maxChildRuntimeMs }` (kept minimal — only fields RU3's sim driver actually threads; prod-only `executionId`/`conversationId` go on the production arm).
  - `export type RuntimeInput` and `export type RuntimeOutput` (the env unions from §6.1/§6.5).

> NOTE: The north-star §6.1 `RuntimeBase` includes `graph`/`storeBindings`/`message`; RU3's sim driver continues to pass those through the existing `SimulateAgentRequest` body rather than a new `RuntimeInput` (the migration in Task 16 keeps the request shape). So `RuntimeInput`/`RuntimeOutput` here are defined as the canonical contract types but the sim driver passes its existing body — they are not yet the wire shape. FLAGGED: full `RuntimeInput` wiring lands in RU4/RU5.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/types.test.ts
import { describe, expect, it } from '@jest/globals';

import type { DeepReadonly, RuntimeOutput } from '../types.js';
import { MAX_CHILD_RUNTIME_MS, MAX_DISPATCH_DEPTH } from '../types.js';

describe('runtime constants', () => {
  it('match both runtimes today', () => {
    expect(MAX_DISPATCH_DEPTH).toBe(10);
    expect(MAX_CHILD_RUNTIME_MS).toBe(3600000);
  });
});

describe('DeepReadonly + RuntimeOutput', () => {
  it('compiles a frozen nested shape and a simulation output', () => {
    const ro: DeepReadonly<{ a: { b: number } }> = { a: { b: 1 } };
    const out: RuntimeOutput = {
      environment: 'simulation',
      finalResult: 'done',
      events: (async function* () {})(),
    };
    expect(ro.a.b).toBe(1);
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

export const MAX_DISPATCH_DEPTH = 10;
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
git commit -m "feat(api): runtime types (DeepReadonly, RuntimeInput/Output, depth/timeout consts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Capability + service contracts (interfaces only)

**Files:**
- Create: `packages/api/src/capabilities/dispatchPersistence.ts`
- Create: `packages/api/src/capabilities/dispatchStrategy.ts`
- Create: `packages/api/src/capabilities/observability.ts`
- Create: `packages/api/src/capabilities/index.ts`
- Test: `packages/api/src/capabilities/__tests__/contracts.test.ts`

**Interfaces:**
- Consumes: `ChildResult` (Task 1), `ResolvedChildConfig` + `ResolveChildInput` (forward — declared minimally here; replaced by the Task 15 port import). `McpInvoker` from RU2 (`providers/mcp/poolClient.js`), `SupabaseClient` from the backend's `operationHelpers` — but the api package cannot import the backend, so `RuntimeServices.supabase` is typed as `unknown`-bounded `SupabaseLike` to avoid a cross-package dep. FLAGGED: §6.3 says `supabase: SupabaseClient`; api types it structurally.
- Produces:
  - `export interface DispatchHandle { executionId: string; childExecutionId: string }`
  - `export interface DispatchPersistence { beforeDispatch(a): Promise<DispatchHandle>; onChildFinish(a): Promise<void>; onChildError(a): Promise<void>; listPending(executionId: string): Promise<DispatchHandle[]> }`
  - `export interface DispatchArgs { dispatchDepth; maxDispatchDepth; runChild: () => Promise<ChildResult> }`
  - `export type DispatchOutcome = { kind: 'completed'; childResult: ChildResult } | { kind: 'suspended'; handle: DispatchHandle }`
  - `export interface DispatchStrategy { dispatch(args: DispatchArgs): Promise<DispatchOutcome> }`
  - `export interface Observability { event(name: string, data?: Record<string, unknown>): void }`
  - `export interface RateLimiter { acquire(tenantId: string): Promise<void> }`
  - `export interface RunnerLogger { info; warn; error }` (re-export shape of existing `Logger`).
  - `export interface RuntimeCapabilities { persistence; dispatch; observability; rateLimit; logger }`
  - `export interface RuntimeServices { mcpPool: McpInvoker; resolveChildConfig: (input: ResolveChildInput) => Promise<ResolvedChildConfig>; supabase: SupabaseLike }`

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
  beforeDispatch(args: {
    executionId: string;
    parentSnapshot: unknown;
    childInput: unknown;
  }): Promise<DispatchHandle>;
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
import type { McpInvoker } from '../providers/mcp/poolClient.js';
import type { DispatchPersistence } from './dispatchPersistence.js';
import type { DispatchStrategy } from './dispatchStrategy.js';
import type { Observability, RateLimiter, RunnerLogger } from './observability.js';

export type { DispatchHandle, DispatchPersistence } from './dispatchPersistence.js';
export type { DispatchArgs, DispatchOutcome, DispatchStrategy } from './dispatchStrategy.js';
export type { Observability, RateLimiter, RunnerLogger } from './observability.js';

export interface RuntimeCapabilities {
  persistence: DispatchPersistence;
  dispatch: DispatchStrategy;
  observability: Observability;
  rateLimit: RateLimiter;
  logger: RunnerLogger;
}

export type SupabaseLike = Record<string, unknown>;

export interface ResolveChildInput {
  dispatchType: 'create_agent' | 'invoke_agent' | 'invoke_workflow';
  params: Record<string, unknown>;
  orgId: string;
}

export interface ResolvedChildConfig {
  systemPrompt: string;
  context: string;
  modelId: string;
  maxSteps: number | null;
  mcpServers: import('@daviddh/graph-types').McpServerConfig[];
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

> If RU2's `McpInvoker` import path is not yet present, temporarily declare `import type { McpInvoker } from '../providers/mcp/poolClient.js';` will fail to resolve — in that case stub `export interface McpInvoker { invoke(a: { agentId: string; tenantId: string; mcpBindingId: string; toolName: string; args: unknown }): Promise<unknown> }` locally and FLAG to reconcile with RU2.

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
- Modify: `packages/api/src/runtime/childResult.ts` (add the mapper; the types landed in Task 1)
- Test: `packages/api/src/runtime/__tests__/childResult.test.ts`

**Interfaces:**
- Consumes: `FinishSentinel` from `../types/sentinels.js` (real shape: `{ __sentinel: 'finish'; output: string; status: 'success' | 'error' }`).
- Produces:
  - `export interface TerminationInput { environment: 'production' | 'simulation'; finishResult?: FinishSentinel; lastAssistantText: string; depthExceeded?: boolean; failure?: { kind: 'child_failed' | 'timeout' | 'agent_not_published' | 'aborted'; message: string } }`
  - `export function mapTerminationToChildResult(input: TerminationInput): ChildResult`

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
    expect(
      mapTerminationToChildResult({ environment: 'simulation', lastAssistantText: 'hold on' })
    ).toEqual({ status: 'awaiting_input', partial: 'hold on' });
  });

  it('END-without-finish in production with text → finished/success', () => {
    expect(
      mapTerminationToChildResult({ environment: 'production', lastAssistantText: 'answer' })
    ).toEqual({ status: 'finished', result: 'answer', outcome: 'success' });
  });

  it('END-without-finish in production with no text → error/no_result', () => {
    const r = mapTerminationToChildResult({ environment: 'production', lastAssistantText: '' });
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.code).toBe('no_result');
  });

  it('depth exceeded → error/max_depth_exceeded', () => {
    const r = mapTerminationToChildResult({
      environment: 'simulation',
      lastAssistantText: '',
      depthExceeded: true,
    });
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
Expected: FAIL — `mapTerminationToChildResult` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `childResult.ts`)

```ts
// packages/api/src/runtime/childResult.ts  (append below the type defs from Task 1)
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

### Task 6: Sim capabilities — `NoopPersistence`, console caps, `NoopRateLimit`

**Files:**
- Create: `packages/api/src/simulation/noopPersistence.ts`
- Create: `packages/api/src/simulation/consoleCapabilities.ts`
- Test: `packages/api/src/simulation/__tests__/consoleCapabilities.test.ts`

**Interfaces:**
- Consumes: `DispatchPersistence`, `Observability`, `RateLimiter`, `RunnerLogger` (Task 4).
- Produces:
  - `export const noopPersistence: DispatchPersistence`
  - `export const noopRateLimit: RateLimiter`
  - `export const consoleObservability: Observability`
  - `export const consoleLogger: RunnerLogger`

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
    // eslint config allows console in sim caps; keep structured shape.
    console.info(`[sim] ${name}`, data ?? {});
  },
};

export const consoleLogger: RunnerLogger = {
  info: (message, data) => console.info(message, data ?? {}),
  warn: (message, data) => console.warn(message, data ?? {}),
  error: (message, data) => console.error(message, data ?? {}),
};
```

> If the api ESLint config forbids `console`, route these through the existing `utils/logger.ts` proxy logger instead of raw `console`, keeping the same `RunnerLogger`/`Observability` shape. FLAG and adapt.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=simulation/__tests__/consoleCapabilities`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/simulation/noopPersistence.ts packages/api/src/simulation/consoleCapabilities.ts packages/api/src/simulation/__tests__/consoleCapabilities.test.ts
git commit -m "feat(api): sim capabilities (NoopPersistence, console observability/logger, NoopRateLimit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: JSON Pointer setter (RFC 6901)

**Files:**
- Create: `packages/api/src/runtime/jsonPointer.ts`
- Test: `packages/api/src/runtime/__tests__/jsonPointer.test.ts`

**Interfaces:**
- Produces: `export function setByJsonPointer(target: Record<string, unknown>, pointer: string, value: unknown): Record<string, unknown>` — returns a NEW object with the value set at the pointer path (creates intermediate objects); does not mutate `target`.

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
  return pointer
    .split('/')
    .slice(1)
    .map(decodeToken);
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
- Consumes: `setByJsonPointer` (Task 7), `DeepReadonly` (Task 3), `ExecutionEvent` (Task 1).
- Produces:
  - `export interface SimStatePatch { tool: string; path: string; value: unknown }`
  - `export interface SimStateStore { read(): DeepReadonly<Record<string, unknown>>; write(tool: string, path: string, value: unknown): SimStatePatch | null; snapshot(): Record<string, unknown>; patches(): SimStatePatch[] }`
  - `export function createSimStateStore(initial: Record<string, unknown>, writable: boolean): SimStateStore` — `read()` returns a deep-frozen view; `write()` deep-clones value, applies via `setByJsonPointer` to the authoritative copy, records a patch and returns it when `writable`, or returns `null` (no-op) when not writable.
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

export function createSimStateStore(
  initial: Record<string, unknown>,
  writable: boolean
): SimStateStore {
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
- Consumes: existing `ProviderCtx` fields; `SimStateStore` (Task 8); `DeepReadonly` (Task 3).
- Produces:
  - `ProviderCtx` becomes `ProviderCtxBase & (ProductionCtxArm | SimulationCtxArm)`:
    - `ProviderCtxBase`: existing fields **minus** `conversationId` plus `dispatchDepth: number`.
    - production arm: `{ environment: 'production'; conversationId?: string }`.
    - simulation arm: `{ environment: 'simulation'; simulationState: DeepReadonly<Record<string, unknown>>; writeSimulationState: (path: string, value: unknown) => void }`.
  - `export async function simulatedNoop(args: unknown, ctx: ProviderCtx): Promise<{ simulated: true }>` (logs nothing; returns a stable no-op marker).
  - `providerCtxFromContext` returns the production arm (`environment: 'production'`, `dispatchDepth: context.dispatchDepth ?? 0`).
  - `buildSimulationProviderCtx` returns the simulation arm.

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
    if (ctx.environment === 'simulation') {
      ctx.writeSimulationState('/x', 1);
    }
    expect(await simulatedNoop({}, ctx)).toEqual({ simulated: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=providers/__tests__/providerCtxEnv`
Expected: FAIL — `environment`/`simulationState` not on `ProviderCtx`; `simulatedNoop` module missing.

- [ ] **Step 3: Write minimal implementation**

Edit `provider.ts`: replace the flat `ProviderCtx` interface with the union:

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

Create `simulatedNoop.ts`:

```ts
// packages/api/src/runtime/simulatedNoop.ts
import type { ProviderCtx } from '../providers/provider.js';

export async function simulatedNoop(_args: unknown, _ctx: ProviderCtx): Promise<{ simulated: true }> {
  return await Promise.resolve({ simulated: true });
}
```

Edit `providerCtxFromContext.ts` — add to the returned object:

```ts
// in providerCtxFromContext(): add these fields to the returned ProviderCtx
    environment: 'production',
    dispatchDepth: context.dispatchDepth ?? 0,
```

(remove the bare `conversationId` line only if TS complains; the production arm keeps it optional.)

Edit `simulationProviderCtx.ts` `buildSimulationProviderCtx` — add to the returned object and accept the store:

```ts
// add params: simulationState: DeepReadonly<Record<string, unknown>>; writeSimulationState: (p, v) => void; dispatchDepth: number
// and in the returned object:
    environment: 'simulation',
    dispatchDepth: args.dispatchDepth ?? 0,
    simulationState: args.simulationState ?? {},
    writeSimulationState: args.writeSimulationState ?? (() => undefined),
```

(Drop `conversationId` from the simulation arm — it does not exist there. If existing call sites pass it, remove those args.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=providers/__tests__/providerCtxEnv`
Then: `npm run typecheck -w packages/api` (expect new errors in builtin `buildTools.ts` that read `ctx.conversationId` unconditionally — fixed in Task 12) and `npm run typecheck -w packages/backend`.
Expected: the new test PASSES; resolve any non-builtin typecheck breakage from the union change here (e.g. add `dispatchDepth`/`environment` at every `ProviderCtx` construction site found via `grep -rn "environment:" packages` and `buildSimulationProviderCtx(`).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/provider.ts packages/api/src/runtime/simulatedNoop.ts packages/api/src/core/providerCtxFromContext.ts packages/backend/src/routes/simulationProviderCtx.ts packages/api/src/providers/__tests__/providerCtxEnv.test.ts
git commit -m "feat(api): env-discriminated ProviderCtx union + simulatedNoop seam + ctx constructors

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `SyncRecurseStrategy` + shared child-result injection

**Files:**
- Create: `packages/api/src/simulation/syncRecurseStrategy.ts`
- Test: `packages/api/src/simulation/__tests__/syncRecurseStrategy.test.ts`

**Interfaces:**
- Consumes: `DispatchStrategy`, `DispatchArgs`, `DispatchOutcome` (Task 4); `ChildResult` (Task 1).
- Produces: `export const syncRecurseStrategy: DispatchStrategy` — runs `args.runChild()` inline and returns `{ kind: 'completed', childResult }`. If `args.dispatchDepth + 1 > args.maxDispatchDepth`, it returns `{ kind: 'completed', childResult: { status:'error', code:'max_depth_exceeded', message } }` WITHOUT calling `runChild`.

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

### Task 11: `childDispatch` — run strategy, map termination, emit child_* events, re-inject

**Files:**
- Create: `packages/api/src/runtime/childDispatch.ts`
- Test: `packages/api/src/runtime/__tests__/childDispatch.test.ts`

**Interfaces:**
- Consumes: `DispatchStrategy` (Task 4), `mapTerminationToChildResult` (Task 5), `ChildResult` (Task 1), `EventEmitter` (Task 2), `DispatchSentinel` (`types/sentinels.js`).
- Produces:
  - `export interface ChildDispatchArgs { sentinel: DispatchSentinel; dispatchDepth: number; maxDispatchDepth: number; environment: 'production' | 'simulation'; strategy: DispatchStrategy; emitter: EventEmitter; runChildToTermination: () => Promise<{ finishResult?: FinishSentinel; lastAssistantText: string }>; childExecutionId: string; }`
  - `export async function childDispatch(args: ChildDispatchArgs): Promise<ChildResult>` — emits `child_dispatched`; calls `strategy.dispatch({ ..., runChild })` where `runChild` runs `runChildToTermination()` then maps via `mapTerminationToChildResult`; on `completed` emits the env-appropriate event (`child_awaiting_input` for `awaiting_input`, else `child_finished`) and returns the `ChildResult`; on `suspended` emits `child_suspended` and returns a sentinel error `{ status:'error', code:'child_failed', message:'suspended (durable path not run in sim)' }` (the suspended branch is contract-only in RU3).

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
      runChildToTermination: async () => ({
        finishResult: { __sentinel: 'finish', output: 'done', status: 'success' },
        lastAssistantText: '',
      }),
    });
    emitter.close();
    expect(result).toEqual({ status: 'finished', result: 'done', outcome: 'success' });
    const types = (await drain(emitter.events)).map((e) => e.type);
    expect(types).toEqual(['child_dispatched', 'child_finished']);
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
      runChildToTermination: async () => ({ lastAssistantText: 'hold on' }),
    });
    emitter.close();
    expect(result).toEqual({ status: 'awaiting_input', partial: 'hold on' });
    const types = (await drain(emitter.events)).map((e) => e.type);
    expect(types).toEqual(['child_dispatched', 'child_awaiting_input']);
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
  runChildToTermination: () => Promise<ChildTermination>;
}

function emitChildResult(args: ChildDispatchArgs, result: ChildResult): void {
  const depth = args.dispatchDepth + 1;
  if (result.status === 'awaiting_input') {
    args.emitter.emit({
      type: 'child_awaiting_input',
      childExecutionId: args.childExecutionId,
      partial: result.partial,
      depth,
    });
    return;
  }
  args.emitter.emit({ type: 'child_finished', childExecutionId: args.childExecutionId, result, depth });
}

export async function childDispatch(args: ChildDispatchArgs): Promise<ChildResult> {
  args.emitter.emit({
    type: 'child_dispatched',
    childExecutionId: args.childExecutionId,
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
  args.emitter.emit({
    type: 'child_suspended',
    childExecutionId: args.childExecutionId,
    depth: args.dispatchDepth + 1,
  });
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
- Modify: `packages/api/src/providers/kv_store/buildTools.ts`
- Modify: `packages/api/src/providers/rag/buildTools.ts`
- Modify: `packages/api/src/providers/forms/buildTools.ts`
- Modify: `packages/api/src/providers/lead_scoring/buildTools.ts`
- Modify: `packages/api/src/providers/web/buildTools.ts`
- Test: `packages/api/src/providers/__tests__/simulatedNoopSeam.test.ts`

**Interfaces:**
- Consumes: `simulatedNoop` (Task 9), env-discriminated `ProviderCtx` (Task 9).
- Produces: each builtin tool's `execute` begins with `if (ctx.environment === 'simulation') return simulatedNoop(args, ctx);`. Real tool names (verified): kv_store `list_keys`/`get_values`/`search`/`update_value`; rag `search_rag`; forms `set_form_fields`/`get_form_field`; lead_scoring `set_lead_score`/`get_lead_score`; web `web_search`/`web_extract`/`web_crawl`/`web_map`. (Composition + calendar are NOT touched — §13.)

> NOTE: web is NOT in spec §13's table but §7 scope says "every builtin (forms/lead-scoring included)" and §13 says "every side-effecting builtin"; web search/extract/crawl/map perform real network egress, so they get the guard. FLAGGED: web is an addition beyond §13's explicit table — confirm intent (it is consistent with "every builtin no-ops in sim", §2/§7).

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

> Adjust `buildForms` to whatever the file actually exports (the provider's `buildTools`). If the tool's `execute` signature is `(args) => ...` (no ctx param, as seen in real code), the guard must close over `ctx` from the surrounding `buildTools(args)` scope, NOT a second param. Inspect the real `execute` closure: it already has `ctx`/`params` in scope.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=providers/__tests__/simulatedNoopSeam`
Expected: FAIL — `execute` still runs the production path (returns form result, not `{ simulated: true }`).

- [ ] **Step 3: Write minimal implementation**

For each builtin, at the top of every listed tool's `execute` closure (which already has `ctx` in scope), insert the guard. Example for forms `set_form_fields` (real execute is `execute: async (args: unknown) => await executeSet(parseArgs(setInput, args), params)`, and `params` carries `ctx`):

```ts
// providers/forms/buildTools.ts — inside the set_form_fields tool object
import { simulatedNoop } from '../../runtime/simulatedNoop.js';
// ...
      execute: async (args: unknown) => {
        if (ctx.environment === 'simulation') return await simulatedNoop(args, ctx);
        return await executeSet(parseArgs(setInput, args), params);
      },
```

Repeat the identical pattern (`if (ctx.environment === 'simulation') return await simulatedNoop(args, ctx);` as the first statement) for:
- kv_store: `list_keys`, `get_values`, `search`, `update_value`
- rag: `search_rag`
- forms: `set_form_fields`, `get_form_field`
- lead_scoring: `set_lead_score`, `get_lead_score`
- web: `web_search`, `web_extract`, `web_crawl`, `web_map`

(Where a tool's `execute` is the terse one-expression form, expand it to a block first — never compress.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=providers/__tests__/simulatedNoopSeam`
Then: `npm run typecheck -w packages/api`
Expected: PASS, and the union-narrowing makes `ctx.simulationState` available only inside the guard.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/kv_store/buildTools.ts packages/api/src/providers/rag/buildTools.ts packages/api/src/providers/forms/buildTools.ts packages/api/src/providers/lead_scoring/buildTools.ts packages/api/src/providers/web/buildTools.ts packages/api/src/providers/__tests__/simulatedNoopSeam.test.ts
git commit -m "feat(api): per-tool simulatedNoop seam in every builtin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `resolveChildConfig` ported into api (the `RuntimeServices.resolveChildConfig` seam)

**Files:**
- Create: `packages/api/src/runtime/resolveChildConfig.ts`
- Test: `packages/api/src/runtime/__tests__/resolveChildConfig.test.ts`

**Interfaces:**
- Consumes: `ResolveChildInput` + `ResolvedChildConfig` (Task 4); a `SupabaseLike` reader passed in.
- Produces: `export async function resolveChildConfig(supabase: SupabaseLike, input: ResolveChildInput): Promise<ResolvedChildConfig>` — ports the backend `simulateChildResolver.ts` `DISPATCH_HANDLERS` logic (`create_agent` builds an in-memory child from params; `invoke_agent`/`invoke_workflow` read the published version). For RU3 the only consumer is the sim driver, so this can wrap the backend resolver via injection rather than re-port the DB queries IF the backend keeps `simulateChildResolver.ts` until RU6 — to avoid a premature port, the sim driver may inject the existing backend `resolveChildConfig` as `RuntimeServices.resolveChildConfig`. DECISION: **inject, don't re-port in RU3.** This task instead defines the `resolveChildConfig` *adapter contract* and a thin passthrough; the real DB port lands in RU4 (Worker needs it). FLAGGED.

> Because of the above decision, Task 13 is small: it provides `makeResolveChildConfig(supabase, backendResolve)` that conforms the existing backend resolver to the `RuntimeServices.resolveChildConfig` signature. The test exercises the adapter with a fake backend resolver.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/resolveChildConfig.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ResolvedChildConfig } from '../../capabilities/index.js';
import { makeResolveChildConfig } from '../resolveChildConfig.js';

describe('makeResolveChildConfig adapter', () => {
  it('forwards to the injected backend resolver', async () => {
    const stub: ResolvedChildConfig = {
      systemPrompt: 'sp', context: 'c', modelId: 'm', maxSteps: null, mcpServers: [],
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

export type BackendResolve = (
  supabase: SupabaseLike,
  input: ResolveChildInput
) => Promise<ResolvedChildConfig>;

export function makeResolveChildConfig(
  supabase: SupabaseLike,
  backendResolve: BackendResolve
): (input: ResolveChildInput) => Promise<ResolvedChildConfig> {
  return async (input: ResolveChildInput): Promise<ResolvedChildConfig> =>
    await backendResolve(supabase, input);
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

### Task 14: `executeTurn` — build ctx, run loop, drive dispatch loop, emit events

**Files:**
- Create: `packages/api/src/runtime/executeTurn.ts`
- Test: `packages/api/src/runtime/__tests__/executeTurn.test.ts`

**Interfaces:**
- Consumes: `executeAgentLoop` (`agentLoop/agentLoop.js`, returns `AgentLoopResult` with `finalText`, `dispatchResult?`, `finishResult?`, `totalTokens`); `EventEmitter` (Task 2); `childDispatch` (Task 11); `RuntimeCapabilities`/`RuntimeServices` (Task 4); `SimStateStore` (Task 8); `RuntimeOutput` (Task 3).
- Produces:
  - `export interface ExecuteTurnArgs { environment: 'production' | 'simulation'; dispatchDepth: number; maxDispatchDepth: number; capabilities: RuntimeCapabilities; services: RuntimeServices; simStore?: SimStateStore; runLoop: () => Promise<AgentLoopResult>; runChildLoop: (config: ResolvedChildConfig) => Promise<AgentLoopResult>; }`
  - `export async function executeTurn(args: ExecuteTurnArgs): Promise<RuntimeOutput>` — runs `runLoop()`; emits `node_exited`/`assistant_message`/`finished` (minimal mapping from `AgentLoopResult`); if `loopResult.dispatchResult !== undefined`, resolves the child config via `services.resolveChildConfig`, calls `childDispatch` with `runChildToTermination` = (run `runChildLoop(config)`, return `{ finishResult, lastAssistantText: childLoop.finalText }`), then continues. On terminal completion emits the sim snapshot (when `simStore`) and `finished`. Returns `{ environment, events, finalResult }`.

> The full parent-resume re-injection (pushing a tool-result message and re-running the parent loop, as `continueParentAfterChild` does today) is owned by the caller's `runLoop`/`runChildLoop` closures the driver provides — `executeTurn` orchestrates the *sequence* and the events; the message threading stays in the driver (Task 16) which already has the `simulationOrchestrator` machinery. This keeps `executeTurn` under the line limit and avoids re-implementing message plumbing. FLAGGED: this is a pragmatic split; RU4 may pull more into `executeTurn`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/executeTurn.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '../../events/types.js';
import { noopPersistence } from '../../simulation/noopPersistence.js';
import { consoleLogger, consoleObservability, noopRateLimit } from '../../simulation/consoleCapabilities.js';
import { syncRecurseStrategy } from '../../simulation/syncRecurseStrategy.js';
import { executeTurn } from '../executeTurn.js';

const caps = {
  persistence: noopPersistence,
  dispatch: syncRecurseStrategy,
  observability: consoleObservability,
  rateLimit: noopRateLimit,
  logger: consoleLogger,
};

const services = {
  mcpPool: { invoke: async () => ({}) },
  resolveChildConfig: async () => ({
    systemPrompt: 's', context: 'c', modelId: 'm', maxSteps: null, mcpServers: [],
    isChildAgent: true, task: 't',
  }),
  supabase: {},
};

async function drain(it: AsyncIterable<ExecutionEvent>): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('executeTurn', () => {
  it('emits finished for a single no-dispatch turn', async () => {
    const out = await executeTurn({
      environment: 'simulation',
      dispatchDepth: 0,
      maxDispatchDepth: 10,
      capabilities: caps as never,
      services: services as never,
      runLoop: async () => ({ finalText: 'hello', steps: 1, totalTokens: { input: 1, output: 1, cached: 0 }, tokensLogs: [], toolCalls: [] }),
      runChildLoop: async () => ({ finalText: '', steps: 0, totalTokens: { input: 0, output: 0, cached: 0 }, tokensLogs: [], toolCalls: [] }),
    });
    expect(out.finalResult).toBe('hello');
    const types = (await drain(out.events)).map((e) => e.type);
    expect(types).toContain('finished');
  });

  it('drives one child dispatch and emits child_dispatched + child_finished', async () => {
    const out = await executeTurn({
      environment: 'simulation',
      dispatchDepth: 0,
      maxDispatchDepth: 10,
      capabilities: caps as never,
      services: services as never,
      runLoop: async () => ({
        finalText: 'parent done', steps: 1, totalTokens: { input: 0, output: 0, cached: 0 }, tokensLogs: [], toolCalls: [],
        dispatchResult: { __sentinel: 'dispatch', type: 'invoke_agent', params: {} },
      }),
      runChildLoop: async () => ({
        finalText: 'child answer', steps: 1, totalTokens: { input: 0, output: 0, cached: 0 }, tokensLogs: [], toolCalls: [],
        finishResult: { __sentinel: 'finish', output: 'child answer', status: 'success' },
      }),
    });
    const types = (await drain(out.events)).map((e) => e.type);
    expect(types).toContain('child_dispatched');
    expect(types).toContain('child_finished');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/executeTurn`
Expected: FAIL — cannot find module `../executeTurn.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/runtime/executeTurn.ts
import type { RuntimeCapabilities, RuntimeServices, ResolvedChildConfig } from '../capabilities/index.js';
import { createEventEmitter } from '../events/emitter.js';
import type { AgentLoopResult } from '../agentLoop/agentLoopTypes.js';
import { childDispatch } from './childDispatch.js';
import type { SimStateStore } from './simStateStore.js';
import type { RuntimeOutput } from './types.js';

export interface ExecuteTurnArgs {
  environment: 'production' | 'simulation';
  dispatchDepth: number;
  maxDispatchDepth: number;
  capabilities: RuntimeCapabilities;
  services: RuntimeServices;
  simStore?: SimStateStore;
  runLoop: () => Promise<AgentLoopResult>;
  runChildLoop: (config: ResolvedChildConfig) => Promise<AgentLoopResult>;
}

function emitTerminal(args: ExecuteTurnArgs, emitter: ReturnType<typeof createEventEmitter>, text: string): void {
  if (args.simStore !== undefined) {
    emitter.emit({ type: 'simulation_state_snapshot', state: args.simStore.snapshot() });
  }
  emitter.emit({ type: 'finished', result: text });
}

async function dispatchChild(
  args: ExecuteTurnArgs,
  emitter: ReturnType<typeof createEventEmitter>,
  loopResult: AgentLoopResult
): Promise<void> {
  const sentinel = loopResult.dispatchResult;
  if (sentinel === undefined) return;
  const config = await args.services.resolveChildConfig({
    dispatchType: sentinel.type,
    params: sentinel.params,
    orgId: '',
  });
  await childDispatch({
    sentinel,
    dispatchDepth: args.dispatchDepth,
    maxDispatchDepth: args.maxDispatchDepth,
    environment: args.environment,
    strategy: args.capabilities.dispatch,
    emitter,
    childExecutionId: `child-${String(args.dispatchDepth + 1)}`,
    runChildToTermination: async () => {
      const child = await args.runChildLoop(config);
      return { finishResult: child.finishResult, lastAssistantText: child.finalText };
    },
  });
}

export async function executeTurn(args: ExecuteTurnArgs): Promise<RuntimeOutput> {
  const emitter = createEventEmitter();
  const loopResult = await args.runLoop();
  if (loopResult.finalText.length > 0) {
    emitter.emit({ type: 'assistant_message', text: loopResult.finalText, depth: args.dispatchDepth });
  }
  await dispatchChild(args, emitter, loopResult);
  emitTerminal(args, emitter, loopResult.finalText);
  emitter.close();
  return { environment: args.environment, events: emitter.events, finalResult: loopResult.finalText };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/executeTurn`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/executeTurn.ts packages/api/src/runtime/__tests__/executeTurn.test.ts
git commit -m "feat(api): executeTurn (run loop, drive dispatch, emit ExecutionEvents)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Public barrel exports + emitter-completeness assertion test

**Files:**
- Modify: `packages/api/src/index.ts`
- Test: `packages/api/src/events/__tests__/emitterCompleteness.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: barrel re-exports of `ExecutionEvent`, `Tokens`, `ChildResult`, `ChildErrorCode`, `mapTerminationToChildResult`, `RuntimeCapabilities`, `RuntimeServices`, `DispatchStrategy`/`DispatchOutcome`/`DispatchPersistence`, `executeTurn`, `childDispatch`, `createEventEmitter`, `createSimStateStore`, `setByJsonPointer`, `simulatedNoop`, `syncRecurseStrategy`, `noopPersistence`, `consoleObservability`, `consoleLogger`, `noopRateLimit`, `MAX_DISPATCH_DEPTH`, `MAX_CHILD_RUNTIME_MS`, `makeResolveChildConfig`.
- The completeness test asserts the superset covers each of the 3 RU5 consumers' field needs (§5).

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/events/__tests__/emitterCompleteness.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '../types.js';

// Each RU5 consumer's required fields, asserted constructible from the union.
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

  it('simulation panel: step_processed(reasoning), tool_executed, child_*, snapshot/patch', () => {
    const step: ExecutionEvent = { type: 'node_exited', nodeId: 'n', depth: 0, reasoning: 'why', durationMs: 5 };
    const toolResult: ExecutionEvent = { type: 'tool_result', toolCallId: 'i', result: {}, depth: 0 };
    const awaiting: ExecutionEvent = { type: 'child_awaiting_input', childExecutionId: 'c', partial: 'p', depth: 1 };
    const patch: ExecutionEvent = { type: 'simulation_state_patch', tool: 't', path: '/a', value: 1 };
    const snapshot: ExecutionEvent = { type: 'simulation_state_snapshot', state: {} };
    expect([step, toolResult, awaiting, patch, snapshot].length).toBe(5);
  });

  it('widget: text + done + per-node tokens', () => {
    const text: ExecutionEvent = { type: 'assistant_message', text: 'x', depth: 0 };
    const done: ExecutionEvent = { type: 'finished', result: 'r' };
    expect([text, done].length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/emitterCompleteness`
Expected: PASS immediately if the union from Task 1 is complete — if any consumer field has no home, a TS compile error in this test FAILS the run. (That failure IS the §5 guard firing.) Confirm it compiles+passes; if a field is missing, add it to the union in `events/types.ts` and re-run.

- [ ] **Step 3: Add the barrel exports**

In `packages/api/src/index.ts`, add (respecting `@trivago` import sort):

```ts
export type { ExecutionEvent, Tokens } from './events/types.js';
export { createEventEmitter } from './events/emitter.js';
export type { ChildResult, ChildErrorCode, TerminationInput } from './runtime/childResult.js';
export { mapTerminationToChildResult } from './runtime/childResult.js';
export type {
  RuntimeCapabilities,
  RuntimeServices,
  ResolveChildInput,
  ResolvedChildConfig,
  DispatchStrategy,
  DispatchOutcome,
  DispatchArgs,
  DispatchPersistence,
  DispatchHandle,
  Observability,
  RateLimiter,
  RunnerLogger,
} from './capabilities/index.js';
export { executeTurn } from './runtime/executeTurn.js';
export { childDispatch } from './runtime/childDispatch.js';
export { createSimStateStore, deepFreeze } from './runtime/simStateStore.js';
export type { SimStateStore, SimStatePatch } from './runtime/simStateStore.js';
export { setByJsonPointer } from './runtime/jsonPointer.js';
export { simulatedNoop } from './runtime/simulatedNoop.js';
export { syncRecurseStrategy } from './simulation/syncRecurseStrategy.js';
export { noopPersistence } from './simulation/noopPersistence.js';
export { consoleObservability, consoleLogger, noopRateLimit } from './simulation/consoleCapabilities.js';
export { makeResolveChildConfig } from './runtime/resolveChildConfig.js';
export { MAX_DISPATCH_DEPTH, MAX_CHILD_RUNTIME_MS } from './runtime/types.js';
export type { RuntimeInput, RuntimeOutput, DeepReadonly, ToolRef } from './runtime/types.js';
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

### Task 16: Sim capabilities wiring + `ExecutionEvent → sim-SSE` bridge (backend)

**Files:**
- Create: `packages/backend/src/runtime/simulationCapabilities.ts`
- Create: `packages/backend/src/runtime/executionEventBridge.ts`
- Test: `packages/backend/src/runtime/__tests__/executionEventBridge.test.ts`

**Interfaces:**
- Consumes (from `@daviddh/llm-graph-runner`): `RuntimeCapabilities`, `RuntimeServices`, `syncRecurseStrategy`, `noopPersistence`, `consoleObservability`, `consoleLogger`, `noopRateLimit`, `makeResolveChildConfig`, `ExecutionEvent`. RU2: `createMcpPoolClient`. Backend: `resolveChildConfig` (existing `simulateChildResolver.ts`), `AgentSimulationEvent` + `writeAgentSSE` (`simulateAgentSse.ts`).
- Produces:
  - `export function buildSimulationCapabilities(): RuntimeCapabilities` = `{ persistence: noopPersistence, dispatch: syncRecurseStrategy, observability: consoleObservability, rateLimit: noopRateLimit, logger: consoleLogger }`.
  - `export function buildSimulationServices(supabase, mcpPool): RuntimeServices`.
  - `export function executionEventToSim(ev: ExecutionEvent): AgentSimulationEvent | null` — maps the superset to today's sim shape. Mapping:
    - `assistant_message` → `{ type: 'agent_response', depth, text, steps: 0, totalTokens, toolCalls: [] }` (or fold into `step_processed`).
    - `tool_call`/`tool_result` → `{ type: 'tool_executed', step, depth, toolCall }`.
    - `node_exited` → `{ type: 'step_processed', ... }`.
    - `child_dispatched` → `{ type: 'child_dispatched', ... }`.
    - `child_finished` → `{ type: 'child_finished', depth, output, status, tokens }`.
    - `child_awaiting_input` → `{ type: 'child_waiting', depth, text: partial }`.
    - `finished` → `{ type: 'simulation_complete' }`.
    - `error` → `{ type: 'error', message }`.
    - `simulation_state_patch`/`simulation_state_snapshot` → **forwarded** (see below).
    - `node_entered`/`assistant_message` duplicates/`child_suspended` → `null` (ExecutionEvent-only; surface to other consumers only post-RU5).

> **The bridge FORWARDS `simulation_state_patch`/`simulation_state_snapshot`** (corrected — do NOT drop them). Today's sim-SSE union lacks them, so this task **temporarily extends `AgentSimulationEvent`** (`packages/backend/src/routes/simulateAgentTypes.ts`) with exactly two members — `{ type: 'simulation_state_patch'; tool: string; path: string; value: unknown }` and `{ type: 'simulation_state_snapshot'; state: Record<string, unknown> }` — and `executionEventToSim` maps them through 1:1. Task 18's panel consumes them off the SSE stream. This makes RU3 validate the §6 sim-state model end-to-end (runtime → bridge → FE), not via FE-side optimistic-local patches. The two members (and this whole bridge) are absorbed/deleted at RU5's full cutover.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/runtime/__tests__/executionEventBridge.test.ts
import { describe, expect, it } from '@jest/globals';

import { executionEventToSim } from '../executionEventBridge.js';

describe('executionEventToSim', () => {
  it('maps child_awaiting_input → child_waiting', () => {
    expect(
      executionEventToSim({ type: 'child_awaiting_input', childExecutionId: 'c', partial: 'p', depth: 1 })
    ).toEqual({ type: 'child_waiting', depth: 1, text: 'p' });
  });

  it('maps child_finished → child_finished (sim shape)', () => {
    const out = executionEventToSim({
      type: 'child_finished', childExecutionId: 'c', depth: 1,
      result: { status: 'finished', result: 'done', outcome: 'success' },
      tokens: { input: 1, output: 2, cached: 0 },
    });
    expect(out).toEqual({ type: 'child_finished', depth: 1, output: 'done', status: 'success', tokens: { input: 1, output: 2, cached: 0 } });
  });

  it('maps finished → simulation_complete', () => {
    expect(executionEventToSim({ type: 'finished', result: 'x' })).toEqual({ type: 'simulation_complete' });
  });

  it('forwards simulation_state_snapshot (temporary bridge extension)', () => {
    expect(executionEventToSim({ type: 'simulation_state_snapshot', state: { a: 1 } })).toEqual({
      type: 'simulation_state_snapshot',
      state: { a: 1 },
    });
  });

  it('forwards simulation_state_patch (temporary bridge extension)', () => {
    expect(executionEventToSim({ type: 'simulation_state_patch', tool: 't', path: '/a', value: 1 })).toEqual({
      type: 'simulation_state_patch',
      tool: 't',
      path: '/a',
      value: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=runtime/__tests__/executionEventBridge`
Expected: FAIL — cannot find module `../executionEventBridge.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/runtime/executionEventBridge.ts
import type { ExecutionEvent } from '@daviddh/llm-graph-runner';

import type { AgentSimulationEvent } from '../routes/simulateAgentTypes.js';

function childFinishedToSim(
  ev: Extract<ExecutionEvent, { type: 'child_finished' }>
): AgentSimulationEvent {
  const result = ev.result;
  const output = result.status === 'finished' ? result.result : '';
  const status = result.status === 'finished' ? result.outcome : 'error';
  return {
    type: 'child_finished',
    depth: ev.depth,
    output,
    status,
    tokens: ev.tokens ?? { input: 0, output: 0, cached: 0 },
  };
}

export function executionEventToSim(ev: ExecutionEvent): AgentSimulationEvent | null {
  switch (ev.type) {
    case 'child_awaiting_input':
      return { type: 'child_waiting', depth: ev.depth, text: ev.partial };
    case 'child_dispatched':
      return null; // child_dispatched needs parent metadata the bridge lacks here; emitted by driver directly
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
// NB: this requires adding those two members to the `AgentSimulationEvent` union in
// `packages/backend/src/routes/simulateAgentTypes.ts` (temporary; removed at RU5).
```

```ts
// packages/backend/src/runtime/simulationCapabilities.ts
import {
  consoleLogger,
  consoleObservability,
  makeResolveChildConfig,
  noopPersistence,
  noopRateLimit,
  syncRecurseStrategy,
  type RuntimeCapabilities,
  type RuntimeServices,
  type McpInvoker,
  type SupabaseLike,
} from '@daviddh/llm-graph-runner';

import { resolveChildConfig } from '../routes/simulateChildResolver.js';

export function buildSimulationCapabilities(): RuntimeCapabilities {
  return {
    persistence: noopPersistence,
    dispatch: syncRecurseStrategy,
    observability: consoleObservability,
    rateLimit: noopRateLimit,
    logger: consoleLogger,
  };
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=runtime/__tests__/executionEventBridge && npm run typecheck -w packages/backend`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/runtime/simulationCapabilities.ts packages/backend/src/runtime/executionEventBridge.ts packages/backend/src/runtime/__tests__/executionEventBridge.test.ts
git commit -m "feat(backend): sim capabilities wiring + throwaway ExecutionEvent→sim-SSE bridge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Migrate `simulationOrchestrator` onto `executeTurn`

**Files:**
- Modify: `packages/backend/src/routes/simulationOrchestrator.ts`
- Test: `packages/backend/src/routes/__tests__/simulationOrchestrator.test.ts`

**Interfaces:**
- Consumes: `executeTurn`, `createSimStateStore` (api); `buildSimulationCapabilities`/`buildSimulationRuntimeServices`/`executionEventToSim` (Task 16); existing `buildLoopConfig`/`executeAgentLoop`/`buildChildOrchestratorConfig` helpers (kept as the `runLoop`/`runChildLoop` closures); `writeAgentSSE` (`simulateAgentSse.ts`).
- Produces: `runSimulationOrchestration(config, callbacks)` becomes a thin driver: builds the sim-state store from `config.body.simulationState`/`simulationStateWritable`, constructs `executeTurn` args with `runLoop = () => executeAgentLoop(loopConfig, loopCallbacks, consoleLogger)` and `runChildLoop = (childConfig) => executeAgentLoop(buildChildLoopConfig(childConfig), …)`, iterates `output.events`, bridges each via `executionEventToSim`, and emits non-null events through the existing SSE writer. Existing `OrchestratorResult` is kept as the return shape (derived from `output.finalResult` + whether a `child_awaiting_input` fired).

> The legacy `continueParentAfterChild` message-threading stays inside the `runChildLoop`/resume closure the driver builds (per Task 14's split). The orchestrator keeps producing today's `OrchestratorResult` so its caller (`simulateHandler`) is unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/__tests__/simulationOrchestrator.test.ts
import { describe, expect, it, jest } from '@jest/globals';

// Mock executeAgentLoop to return a simple finishing parent (no dispatch).
jest.unstable_mockModule('@daviddh/llm-graph-runner', async () => {
  const actual = await import('@daviddh/llm-graph-runner');
  return {
    ...actual,
    // keep real executeTurn / bridge helpers; override the loop runner used by buildLoopConfig path if needed
  };
});

const { runSimulationOrchestration } = await import('../simulationOrchestrator.js');

describe('runSimulationOrchestration on executeTurn', () => {
  it('returns a completed result for a non-dispatch turn', async () => {
    const events: string[] = [];
    const config = {
      body: { tenantId: 't', messages: [{ role: 'user', message: { text: 'hi' } }], maxSteps: 2, simulationState: {}, simulationStateWritable: true },
      depth: 0, maxNestingDepth: 10, orgId: 'o', supabase: {} as never,
    } as never;
    const result = await runSimulationOrchestration(config, {
      onSseEvent: (e: { type: string }) => events.push(e.type),
      onChildFinished: () => undefined,
    } as never);
    expect(result.type).toBe('completed');
  });
});
```

> This test is a smoke test; adjust the mock to whatever minimal loop stub makes `runLoop` resolve a `finalText` without a real model. If `buildLoopConfig` calls a real LLM, inject a fake `runLoop` via a new optional `config.__runLoopOverride` test seam OR mock `buildLoopConfig`. Keep the seam test-only.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=routes/__tests__/simulationOrchestrator`
Expected: FAIL — orchestrator not yet routed through `executeTurn` / shape mismatch.

- [ ] **Step 3: Write minimal implementation**

Refactor `runSimulationOrchestration` to drive `executeTurn` (decompose into helpers to respect the 40-line limit):

```ts
// packages/backend/src/routes/simulationOrchestrator.ts  (new core — keep helpers in this file or a new simulationDriverHelpers.ts)
import { createSimStateStore, executeTurn } from '@daviddh/llm-graph-runner';

import { buildSimulationCapabilities, buildSimulationRuntimeServices } from '../runtime/simulationCapabilities.js';
import { executionEventToSim } from '../runtime/executionEventBridge.js';

export async function runSimulationOrchestration(
  config: OrchestratorConfig,
  callbacks: OrchestratorCallbacks
): Promise<OrchestratorResult> {
  const simStore = createSimStateStore(
    config.body.simulationState ?? {},
    config.body.simulationStateWritable ?? true
  );
  const output = await executeTurn(buildTurnArgs(config, simStore));
  let awaiting: { depth: number; text: string } | null = null;
  for await (const ev of output.events) {
    if (ev.type === 'child_awaiting_input') awaiting = { depth: ev.depth, text: ev.partial };
    const sim = executionEventToSim(ev);
    if (sim !== null) callbacks.onSseEvent(sim);
  }
  if (awaiting !== null) return { type: 'child_waiting', depth: awaiting.depth, text: awaiting.text };
  return { type: 'completed', result: toLoopResult(output) };
}
```

`buildTurnArgs`, `toLoopResult`, and the `runLoop`/`runChildLoop` closures (reusing `buildLoopConfig`/`executeAgentLoop`/`buildChildOrchestratorConfig`) go in a sibling `simulationDriverHelpers.ts` to stay under `max-lines`. Adapt `OrchestratorCallbacks` to carry an `onSseEvent` callback (the caller `simulateHandler` already has `writeAgentSSE(res, event)` — pass it).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=routes/__tests__/simulationOrchestrator && npm run typecheck -w packages/backend`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/simulationOrchestrator.ts packages/backend/src/routes/simulationDriverHelpers.ts packages/backend/src/routes/__tests__/simulationOrchestrator.test.ts
git commit -m "feat(backend): drive simulation through executeTurn + ExecutionEvent bridge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: FE sim-state store hook + `setByJsonPointer` + JSON panel

> **Data source (corrected with Task 16):** the panel consumes the **runtime-emitted** `simulation_state_patch`/`simulation_state_snapshot` events that the bridge now forwards over SSE — *not* FE-side optimistic-local patches. So the FE sim-stream parser must recognize those two event types; `useSimulationState` applies a `simulation_state_patch` display-only via `setByJsonPointer`, and **replaces** its copy on `simulation_state_snapshot` via `adoptSnapshot` (the only authoritative update, per §6). This is what validates the §6 runtime-as-sole-writer model in RU3.

**Files:**
- Create: `packages/web/app/utils/jsonPointer.ts`
- Modify: `packages/web/app/hooks/useSimulationState.ts`
- Create: `packages/web/app/components/panels/SimulationStatePanel.tsx`
- Test: `packages/web/app/utils/__tests__/jsonPointer.test.ts`

**Interfaces:**
- Produces:
  - `export function setByJsonPointer(obj, pointer, value)` (FE copy of Task 7 logic — web cannot import the api package's internal module path; duplicate the small RFC-6901 setter).
  - `useSimulationState` gains `simulationState: Record<string, unknown>`, `adoptSnapshot(snapshot)`, `resetSimulationState()`.
  - `SimulationStatePanel` renders `simulationState` via `JsonBlock` (from `JsonDisplay.tsx`) with an empty-state message and a "Reset simulation" footer button.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/web -- --testPathPattern=utils/__tests__/jsonPointer`
Expected: FAIL — cannot find module `../jsonPointer`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/web/app/utils/jsonPointer.ts` (identical RFC-6901 setter as Task 7, no `.js` extension per web import conventions). Then add to `useSimulationState.ts`:

```ts
// packages/web/app/hooks/useSimulationState.ts  (add inside the hook)
const [simulationState, setSimulationState] = useState<Record<string, unknown>>({});

const adoptSnapshot = useCallback((snapshot: Record<string, unknown>) => {
  setSimulationState(snapshot);
}, []);

const resetSimulationState = useCallback(() => {
  setSimulationState({});
}, []);
```

Expose `simulationState`, `adoptSnapshot`, `resetSimulationState` on the returned object/setters. Create `SimulationStatePanel.tsx`:

```tsx
// packages/web/app/components/panels/SimulationStatePanel.tsx
'use client';

import { useTranslations } from 'next-intl';

import { JsonBlock } from './JsonDisplay';
import { Button } from '@/components/ui/button';

interface Props {
  state: Record<string, unknown>;
  onReset: () => void;
}

export function SimulationStatePanel({ state, onReset }: Props): React.JSX.Element {
  const t = useTranslations();
  const isEmpty = Object.keys(state).length === 0;
  return (
    <div className="flex flex-col gap-2">
      {isEmpty ? (
        <p className="text-xs text-muted-foreground">{t('simulation.statePanel.empty')}</p>
      ) : (
        <JsonBlock value={state} />
      )}
      <Button size="sm" variant="outline" onClick={onReset}>
        {t('simulation.statePanel.resetButton')}
      </Button>
    </div>
  );
}
```

(Adjust `JsonBlock` import/prop names to the real `JsonDisplay.tsx` exports.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/web -- --testPathPattern=utils/__tests__/jsonPointer && npm run lint -w packages/web`
Expected: PASS / clean (translation keys added in Task 20 — if lint flags missing keys, do Task 20 first or add keys now).

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/utils/jsonPointer.ts packages/web/app/hooks/useSimulationState.ts packages/web/app/components/panels/SimulationStatePanel.tsx packages/web/app/utils/__tests__/jsonPointer.test.ts
git commit -m "feat(web): sim-state store hook (adoptSnapshot/reset) + JSON state panel + jsonPointer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: FE — testing-presets popover, reset + tenant-switch dialogs, MCP badge

**Files:**
- Create: `packages/web/app/components/panels/TestingPresetsPopover.tsx`
- Create: `packages/web/app/components/panels/ResetSimulationDialog.tsx`
- Create: `packages/web/app/components/panels/TenantSwitchResetDialog.tsx`
- Create: `packages/web/app/components/McpSideEffectBadge.tsx`
- Test: `packages/web/app/components/__tests__/McpSideEffectBadge.test.tsx`

**Interfaces:**
- Consumes: shadcn `Popover`, `AlertDialog`, `Badge`; `TestingPresetsSection` + `PublishButtonTenantPicker`'s `TenantPicker`; `useTranslations`.
- Produces:
  - `TestingPresetsPopover` — wraps `TestingPresetsSection` in a `Popover`, replacing the tenant text input with `TenantPicker`; a tenant change while `simulationState` is non-empty OR sim messages exist opens `TenantSwitchResetDialog`.
  - `ResetSimulationDialog` — `AlertDialog` with `simulation.resetState.*` copy; on confirm calls `onReset` (reset state + clear sim messages/tokens + reset to start node).
  - `TenantSwitchResetDialog` — `AlertDialog` with `simulation.tenantSwitchReset.*` copy; on confirm resets then applies the tenant change.
  - `McpSideEffectBadge` — shadcn `<Badge>` warning tone, `aria-label`, tooltip; rendered where `providerType === 'mcp'` (tool picker + tool-call cards).

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/web -- --testPathPattern=McpSideEffectBadge`
Expected: FAIL — cannot find module `../McpSideEffectBadge` (and missing `simulation.mcpBadge.*` keys — add in Task 20 first if needed).

- [ ] **Step 3: Write minimal implementation**

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
        <Badge
          variant="outline"
          className="border-amber-500 text-amber-600"
          aria-label={t('simulation.mcpBadge.tooltip')}
        >
          {t('simulation.mcpBadge.label')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t('simulation.mcpBadge.tooltip')}</TooltipContent>
    </Tooltip>
  );
}
```

Build `ResetSimulationDialog`, `TenantSwitchResetDialog` with shadcn `AlertDialog` using the §12.5 keys, and `TestingPresetsPopover` wrapping `TestingPresetsSection` + `TenantPicker`. Wire `McpSideEffectBadge` into the tool picker + tool-call cards where `providerType === 'mcp'`. (Run `npx shadcn@latest add badge tooltip popover alert-dialog` only for any not already present.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/web -- --testPathPattern=McpSideEffectBadge && npm run lint -w packages/web`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/panels/TestingPresetsPopover.tsx packages/web/app/components/panels/ResetSimulationDialog.tsx packages/web/app/components/panels/TenantSwitchResetDialog.tsx packages/web/app/components/McpSideEffectBadge.tsx packages/web/app/components/__tests__/McpSideEffectBadge.test.tsx
git commit -m "feat(web): testing-presets popover, reset/tenant-switch dialogs, MCP side-effect badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Translations (§12.5 keys) + toolbar wiring

**Files:**
- Modify: `packages/web/messages/en.json`
- Modify: the simulation toolbar component (locate via `grep -rn "TestingPresetsSection\|toolbar" packages/web/app/components`) to mount the two icon buttons (testing presets + sim state panel).
- Test: `packages/web/app/__tests__/simulationMessages.test.ts`

**Interfaces:**
- Produces: the §12.5 keys under a `simulation` namespace in `en.json`; the toolbar renders the testing-presets icon (opens `TestingPresetsPopover`) and the sim-state icon (opens `SimulationStatePanel`).

- [ ] **Step 1: Write the failing test**

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
  it('all §12.5 keys exist', () => {
    const sim = (messages as Record<string, Record<string, unknown>>).simulation;
    for (const path of REQUIRED) {
      const [group, key] = path.split('.');
      expect((sim[group] as Record<string, unknown>)[key]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/web -- --testPathPattern=simulationMessages`
Expected: FAIL — keys missing.

- [ ] **Step 3: Write minimal implementation**

Add to `packages/web/messages/en.json` under a `simulation` object (merge if it exists):

```json
"simulation": {
  "resetState": {
    "title": "Reset simulation state?",
    "description": "This clears the current simulation state and conversation. This cannot be undone.",
    "confirm": "Reset",
    "cancel": "Cancel"
  },
  "tenantSwitchReset": {
    "title": "Switch tenant and reset?",
    "description": "Changing the tenant resets the simulation state and conversation. This cannot be undone.",
    "confirm": "Switch and reset",
    "cancel": "Cancel"
  },
  "toolbar": {
    "testingPresetsLabel": "Testing presets",
    "simulationStateLabel": "Simulation state",
    "openPanel": "Open panel"
  },
  "statePanel": {
    "empty": "No simulation state yet.",
    "resetButton": "Reset simulation"
  },
  "mcpBadge": {
    "label": "Real",
    "tooltip": "MCP tools run for real in simulation — this call has real side effects."
  }
}
```

Wire the toolbar icon buttons (using the `toolbar.*` labels as `aria-label`/tooltip) to open the popover and panel.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/web -- --testPathPattern=simulationMessages && npm run lint -w packages/web`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/messages/en.json packages/web/app/__tests__/simulationMessages.test.ts
git commit -m "feat(web): simulation i18n keys + toolbar testing-presets/sim-state icon buttons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Full gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full check**

Run: `npm run check`
Expected: format clean, lint clean (no `eslint-disable`, no `any`), `tsc -b` clean across all packages.

- [ ] **Step 2: Run all touched suites**

Run: `npm run test -w packages/api && npm run test -w packages/backend -- --testPathPattern=runtime && npm run test -w packages/web -- --testPathPattern="jsonPointer|McpSideEffectBadge|simulationMessages|simulationOrchestrator"`
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
| §2 In-scope: core `executeTurn`+`childDispatch` wrapping the loop | 11, 14 |
| §2/§3/§6.3 `RuntimeCapabilities` (5 seams) + `RuntimeServices` | 4 |
| §3/§6.4 `ChildResult` envelope + env-aware termination mapping | 1, 5 |
| §3 `DispatchStrategy`/`DispatchPersistence` contracts | 4 |
| §3 sim impls (SyncRecurse + Noop + console/no-op caps) | 6, 10 |
| §3/§6.2 env-discriminated `ProviderCtx` | 9 |
| §5 superset `ExecutionEvent` emitter + bridge + completeness assertion | 1, 2, 16, 15 |
| §6 sim-state model (deep-freeze, clone-write, `DeepReadonly`, patch/snapshot, abort, mutation-throws test) | 3, 7, 8 |
| §6 sim-state JSON-Pointer write | 7 |
| §7/§13 per-tool `simulatedNoop` seam in every builtin | 9, 12 |
| §7/§12.4 MCP "real side-effects" badge | 19 |
| §8/§11 migrate sim handler onto `executeTurn` + bridge | 16, 17 |
| §8 testing-presets popover, sim-state panel, reset/tenant-switch modals, i18n | 18, 19, 20 |
| §9 validation: behavior tests on the new core | 5, 8, 10, 11, 14, 15 (emitter completeness), 16 |
| §10 child-result injection shared by both strategies; only sim runs | 10, 11 |
| RU3 child seam (north-star §6.3 `loadChildAgentGraph` → real `resolveChildConfig`) | 4, 13 |
| Full gate (`npm run check`) | 21 |

**Out of scope (correctly deferred, per spec §2/§10/§11):** running `DurableDispatchStrategy`/`SupabaseDispatchPersistence` (contracts only — Task 4); prod edge migration (RU4); SSE consumer cutover + bridge deletion (RU5); legacy orchestrator deletion (RU6); bespoke per-tool sim behavior (every builtin no-ops uniformly).

**Spec requirements I could NOT cleanly map (flagged, not silently fixed):**
1. North-star §6.3 `RuntimeServices.loadChildAgentGraph: (agentId) => Promise<AgentGraph>` — no `AgentGraph` type exists; mapped to the real `resolveChildConfig`/`ResolvedChildConfig` seam (Tasks 4, 13).
2. §4 "`executeAgent` yields a dispatch decision" — `executeAgent` does not; the loop's `AgentLoopResult.dispatchResult` does. Wrapped the loop, not the attempt executor (Task 14).
3. §6.4 prod `no_result`/`finished` END-without-finish rows — forward-design; not exercised by a running strategy in RU3 (only the pure mapper is unit-tested) (Task 5).
4. §5/§6 `simulation_state_patch`/`simulation_state_snapshot` delivery — the throwaway bridge is **temporarily extended** with these two `AgentSimulationEvent` members (Task 16) and the FE consumes them (Task 18), so RU3 validates the §6 runtime→FE sim-state model end-to-end. Both members + the whole bridge are removed at RU5's full cutover.
