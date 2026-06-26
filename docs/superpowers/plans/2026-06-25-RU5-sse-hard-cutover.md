# RU5 — SSE hard cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three divergent SSE vocabularies (prod internal+public split in `executeTypes.ts` + the internal→public converter; sim `AgentSimulationEvent`; widget `PublicExecutionEvent`) into **one** superset `ExecutionEvent` union + **one** serializer (`executionEventSse.ts`: `ExecutionEvent → data: <JSON>\n\n`). Wire both HTTP handlers (prod execute, sim agent) to emit through it, migrate all three consumers (prod `api.ts`, the sim path, the widget) with a **full rename and NO back-compat aliases**, and delete every legacy SSE shape, the internal→public converter, the sim `AgentSimulationEvent` + `simulateAgentSse.ts`, and the RU3 throwaway bridge (`executionEventToSim` + its temporary sim-state members + test). Manual cross-consumer verification (no automated render harness); the RU3 emitter-completeness assertion is retained.

**Architecture:** RU3 defined the superset `ExecutionEvent` union (`packages/api/src/events/types.ts`) and an emitter; RU4 made prod emit it. RU5 adds the single neutral serializer in `packages/api` (`@daviddh/llm-graph-runner`) — importable by both the prod Worker/BE handler and the sim BE handler with no Node-only/Workers-only deps. Each BE handler iterates its runtime's `ExecutionEvent` stream and writes via `serializeExecutionEvent`. On the wire it is `data: <JSON.stringify(event)>\n\n` carrying the discriminating `type`, matching every consumer's existing `data: ` + `JSON.parse` parse. Each consumer re-keys its reducer/callback set onto the `ExecutionEvent` type strings; the sim-state events (`simulation_state_patch`/`simulation_state_snapshot`) become first-class instead of routed through the deleted RU3 bridge extension. Then all the legacy shapes/writers/bridge are deleted.

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `noUncheckedIndexedAccess`), the api package (`@daviddh/llm-graph-runner`) events module, Express SSE (BE handlers), Next.js 16 / React (web sim + prod consumers), the widget (Vite/React, its own `sseReader`/`eventToBlock`), Zod (web `api.ts` parse), Jest ESM (`npm run test -w packages/<pkg>`; web uses its own config).

## Global Constraints

- npm workspaces. ESM (`"type":"module"`, NodeNext). TS strict, `noUncheckedIndexedAccess`. **Never `any`. Never eslint-disable.**
- ESLint: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2 — split into helpers/files.
- Tests: Jest ESM — `npm run test -w packages/<pkg> -- --testPathPattern=…`; web uses its own config. Full gate: `npm run check`.
- **Always add/update translations** for any user-facing copy touched.
- Prettier: single quotes, 2-space, width 110, trailing comma es5; `@trivago` import sorting.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; stage files explicitly.

---

## Decisions / spec-vs-code findings (READ BEFORE STARTING — these are NOT silent fixes)

Verified against the real code on branch `feat/data-tools`. Where the spec assumes a shape the code does not have, this plan implements against the real code and flags it here.

1. **RU3/RU4 NOT YET BUILT — the superset union, emitter, bridge, and `packages/api/src/events/` directory do not exist in the working tree.** `grep -rln ExecutionEvent packages/api/src` returns nothing; there is no `events/` dir; `executionEventToSim`/`executionEventBridge` do not exist. This plan assumes RU3 (which creates `packages/api/src/events/types.ts` with the exact union below + emitter + `executionEventToSim` bridge + temporary `AgentSimulationEvent` sim-state members) and RU4 (prod emits `ExecutionEvent`) are merged first. **FLAGGED cross-RU dependency.** The exact union members + field names are taken verbatim from the RU3 plan Task 1 (`docs/superpowers/plans/2026-06-24-RU3-runtime-core-simulation.md` lines 161-189) and north-star §6.6 — they match exactly. If RU3 lands with renamed members, reconcile names at impl time (the serializer is type-driven so a mismatch is a compile error, not silent).

2. **The widget is a SEPARATE transport with its OWN copy of the public shape — it does NOT import from `@daviddh/llm-graph-runner` and does NOT share the sim/prod parser.** Real code: `packages/widget/src/types/publicEvents.ts` declares its own `PublicExecutionEvent` union (`node_visited`/`text`/`toolCall`/`tokenUsage`/`structuredOutput`/`nodeError`/`error`/`done`); `packages/widget/src/api/sseReader.ts` parses `data:` lines into it; `packages/widget/src/api/eventToBlock.ts` (`BlockCoalescer`) reduces `text`/`toolCall`/`nodeError` into `CopilotMessageBlock`s; `useChatStream.ts` additionally consumes synthetic `error`/`done` from `eventToBlock`/`executeClient`. `packages/widget/package.json` has **no** `@daviddh/*` dependency. So the widget migration = rewrite `publicEvents.ts` → `ExecutionEvent` (vendored copy, since adding a workspace dep on the api package is out of scope and the spec says rename, not re-architect transport), re-key `eventToBlock.ts` (`text`→`assistant_message`+`node_exited.text`, `toolCall`→`tool_call`/`tool_result`, `nodeError`→`node_error`, `error` stays, `done`→`finished`), and update `useChatStream.ts`'s terminal/error handling (`'done'`→`'finished'`). **FLAGGED:** the spec (§9, §10 widget-coupling risk) suspected this; confirmed — the widget keeps its own transport + a vendored `ExecutionEvent` type, NOT a shared import. If RU later decides to share the type via a published package, that is a separate change.

3. **The prod `api.ts` consumer is SHARED across TWO backend sim paths, not just the prod execute path.** Real code: `packages/web/app/lib/api.ts` `streamSimulation` POSTs `/api/simulate`, and its permissive `SseEventSchema` + `dispatchSseEvent` handle BOTH (a) the agent-sim shape from `simulateAgentHandler.ts`/`simulateAgentSse.ts` (`step_started`/`step_processed`/`tool_executed`/`agent_response`/`child_dispatched`/`child_finished`/`child_waiting`/`simulation_complete`) AND (b) the workflow-sim INTERNAL shape from `simulateHandler.ts` (`node_visited`/`node_processed`/`agent_response`). The widget hits `/api/chat/execute/...` (the prod `executeHandler.ts`), a different route. **The spec's framing of "prod `api.ts`" is the SIM/workflow consumer**, not the widget's prod path. RU5 migrates `api.ts` to `ExecutionEvent` for the **agent-sim path** (the `executeTurn`/serializer path RU3 built). **FLAGGED:** `simulateHandler.ts`'s separate **workflow** sim path (`buildContextWithRegistry`, `executeWithCallbacks`, internal `node_*` shape) is NOT on `executeTurn` (RU3 §decision-7 migrated only the agent orchestrator path; workflow stays legacy until RU6). Per spec §2-Out ("RU5 deletes only the SSE-shape/writer code it directly replaces"), RU5 must KEEP `simulate.ts`'s `writeSSE`/`SimulationEvent` + `simulateHandler.ts`'s `node_visited`/`node_processed` emission alive for the workflow path, so `api.ts`'s reducer must still accept those legacy `node_*` strings until RU6 migrates the workflow path. **This is a genuine spec-vs-code tension** (the spec implies a clean full rename of `api.ts`; the workflow path forbids deleting the `node_*` branches yet). Resolution in this plan: migrate `api.ts`'s **agent-sim** branches to `ExecutionEvent` and RETAIN the workflow `node_visited`/`node_processed`/`agent_response` branches (legacy, RU6 removes), documented inline. Do NOT silently delete them.

4. **The serializer lives in `packages/api/src/events/executionEventSse.ts` and is re-exported from `packages/api/src/index.ts`.** This is the neutral location both BE handlers can import (`@daviddh/llm-graph-runner`). It depends ONLY on `./types.js` (the union) — no Express/Node/Workers types. Confirmed: `packages/api/src/index.ts` is the package barrel; both `simulateAgentHandler.ts` and the prod handler already import from `@daviddh/llm-graph-runner`.

5. **`executeHelpers.ts` mixes the converter with non-SSE helpers — delete SURGICALLY.** Real `executeHelpers.ts` contains the internal→public converter pieces (`writePublicSSE`, `sendNodeVisitedEvent`, `sendNodeProcessedEvent`) AND unrelated live helpers (`setSseHeaders`, `buildUserMessage`, `resolveMcpTransportVariables`, `sumTokens`, `resolveOAuthForExecution`, `logExec`). RU5 deletes ONLY the SSE-writer/converter functions (`writePublicSSE`, `sendNodeVisitedEvent`, `sendNodeProcessedEvent`) and keeps the rest. `setSseHeaders` stays (the new emit loop reuses it). **FLAGGED:** the prod handler `executeHandler.ts` currently writes a `done` event via `writePublicSSE` + `buildResponseByType`; once it emits `ExecutionEvent`, the terminal becomes a `finished` event (RU4 already produces it on the stream). RU5's prod-handler rewrite (Task 2) replaces the `onNodeVisited`/`onNodeProcessed` callback bridge with an `ExecutionEvent` stream + serializer loop; confirm with RU4 author whether RU4 already converted `executeAgentCore` to emit an `ExecutionEvent` stream or still uses the `ExecuteCoreCallbacks` shape. If RU4 left the callback shape, Task 2 maps the callbacks' `NodeProcessedEvent`→`ExecutionEvent` at the handler boundary (an adapter the serializer consumes) — implement against whichever RU4 delivers. **FLAGGED.**

6. **The internal/public `PublicExecutionEvent` (and `AgentExecutionResponse` `done` payload) in `executeTypes.ts` is also referenced by the non-streaming JSON path** (`buildResponseByType`/`respondNormally`/`buildBaseResponse` return `AgentExecutionResponse`). Deleting the SSE event unions (`InternalExecutionEvent`, `PublicExecutionEvent`) is safe, but `AgentExecutionResponse`/`AgentAppResponse`/`WorkflowExecutionResponse`/`TokenUsage`/`ToolCallRecord` (the non-streaming response types) MUST stay. Task 7 deletes only the two SSE unions + their member interfaces, NOT the response types.

7. **api package console rule unknown — route sim logging through existing logger if `no-console` is on.** Could not confirm `no-console` in the api ESLint config from the shell. The serializer itself logs nothing (pure), so this only matters if a task adds logging; none do. No action unless `npm run lint` flags it.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/api/src/events/executionEventSse.ts` (create) | `serializeExecutionEvent(event: ExecutionEvent): string` → `data: <JSON>\n\n`. The ONLY place `ExecutionEvent` is written to the wire. Pure, no Express/Node deps. |
| `packages/api/src/events/__tests__/executionEventSse.test.ts` (create) | Every `ExecutionEvent` variant → well-formed `data: …\n\n`; round-trips through `JSON.parse`. |
| `packages/api/src/index.ts` (modify) | Re-export `serializeExecutionEvent` (and `ExecutionEvent`/`Tokens` if RU3 has not already). |
| `packages/backend/src/routes/execute/executeHandler.ts` (modify) | Emit via `serializeExecutionEvent` over the runtime's `ExecutionEvent` stream; drop the public-shape `done`/`node_*` writes. |
| `packages/backend/src/routes/execute/executeHelpers.ts` (modify) | Delete `writePublicSSE`/`sendNodeVisitedEvent`/`sendNodeProcessedEvent`; keep `setSseHeaders` + all non-SSE helpers. |
| `packages/backend/src/routes/simulateAgentHandler.ts` (modify) | Emit via `serializeExecutionEvent` over the `executeTurn` `ExecutionEvent` stream; drop `buildCallbacks` → `simulateAgentSse` bridge + the `executionEventBridge`. |
| `packages/web/app/lib/api.ts` (modify) | Re-key the agent-sim reducer branches to `ExecutionEvent` type strings; retain workflow `node_*` branches (legacy, RU6); drop the `agent_response`/`step_*`/`child_*`(old) handlers. |
| `packages/web/app/lib/sseSimComposition.ts` (modify) | `child_dispatched`/`child_finished`/`child_waiting` → `child_dispatched`/`child_finished`/`child_awaiting_input` (`ExecutionEvent` fields: `childExecutionId`, `result`, `partial`, `depth`); add `simulation_state_patch`/`simulation_state_snapshot` callbacks. |
| `packages/web/app/hooks/compositionMachine.ts` (modify) | Rename internal `child_waiting` phase string → `child_awaiting_input`; keep state-machine event names (`CHILD_*`) which are FE-internal, not wire. |
| `packages/web/app/hooks/useSimulationSend.ts` (modify) | No wire-shape coupling beyond `streamSimulation`/callbacks — update only if a renamed callback name flows through. |
| `packages/web/app/hooks/simulationSendHelpers.ts` (modify) | Update `onSimChildWaiting`→`onSimChildAwaitingInput` callback wiring + add `onSimulationStatePatch`/`Snapshot` if the panel consumes them off the stream. |
| `packages/widget/src/types/publicEvents.ts` (modify) | Replace `PublicExecutionEvent` union with a vendored `ExecutionEvent` union (same members as the api union). |
| `packages/widget/src/api/eventToBlock.ts` (modify) | Re-key `BlockCoalescer.push` to `assistant_message`/`node_exited`/`tool_call`/`tool_result`/`node_error`. |
| `packages/widget/src/api/sseReader.ts` (modify) | Type-only: parse to the new `ExecutionEvent`. |
| `packages/widget/src/ui/useChatStream.ts` (modify) | `'done'`→`'finished'`, `error` field access; `coalescer.push(ev)` typing. |
| `packages/backend/src/routes/execute/executeTypes.ts` (modify) | Delete `InternalExecutionEvent`+members and `PublicExecutionEvent`+members; KEEP `AgentExecutionResponse`/`AgentAppResponse`/`WorkflowExecutionResponse`/`TokenUsage`/`ToolCallRecord`/`AgentExecutionInputSchema`. |
| `packages/backend/src/routes/simulateAgentSse.ts` (delete) | The sim writer (`writeAgentSSE` + `sendStep*`/`sendChild*`) — replaced by the serializer. |
| `packages/backend/src/routes/simulateAgentTypes.ts` (modify) | Delete `AgentSimulationEvent` union + its member interfaces (`AgentStep*`/`AgentToolExecuted`/`AgentResponse`/`Child*`/`AgentSimulation*` events) + the RU3 temporary `simulation_state_patch`/`snapshot` members; KEEP `SimulateAgentRequest`/`SimulateAgentRequestSchema`. |
| `packages/backend/src/runtime/executionEventBridge.ts` (delete) | RU3 throwaway `executionEventToSim` bridge. |
| `packages/backend/src/runtime/__tests__/executionEventBridge.test.ts` (delete) | The bridge's test. |

---

### Task 1: `serializeExecutionEvent` serializer + unit tests

**Files:**
- Create: `packages/api/src/events/executionEventSse.ts`
- Create: `packages/api/src/events/__tests__/executionEventSse.test.ts`
- Modify: `packages/api/src/index.ts`

**Interfaces:**
- Consumes: `ExecutionEvent` from `./types.js` (RU3 Task 1 — exact members below).
- Produces: `export function serializeExecutionEvent(event: ExecutionEvent): string` returning `` `data: ${JSON.stringify(event)}\n\n` ``.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/events/__tests__/executionEventSse.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '../types.js';
import { serializeExecutionEvent } from '../executionEventSse.js';

function roundTrip(ev: ExecutionEvent): unknown {
  const line = serializeExecutionEvent(ev);
  expect(line.startsWith('data: ')).toBe(true);
  expect(line.endsWith('\n\n')).toBe(true);
  return JSON.parse(line.slice('data: '.length, -2));
}

describe('serializeExecutionEvent', () => {
  it('serializes a node_exited event with tokens and round-trips', () => {
    const ev: ExecutionEvent = {
      type: 'node_exited',
      nodeId: 'n1',
      depth: 0,
      text: 'hi',
      tokens: { input: 1, output: 2, cached: 0, costUSD: 0.01 },
    };
    expect(roundTrip(ev)).toEqual(ev);
  });

  it('serializes every variant to a well-formed data line', () => {
    const variants: ExecutionEvent[] = [
      { type: 'node_entered', nodeId: 'n', depth: 0 },
      { type: 'node_exited', nodeId: 'n', depth: 0 },
      { type: 'assistant_message', text: 'x', depth: 0 },
      { type: 'tool_call', toolName: 't', toolCallId: 'i', args: {}, depth: 0, isMcp: true },
      { type: 'tool_result', toolCallId: 'i', result: { ok: true }, depth: 0 },
      { type: 'simulation_state_patch', tool: 't', path: '/a', value: 1 },
      { type: 'simulation_state_snapshot', state: { a: 1 } },
      { type: 'child_dispatched', childExecutionId: 'c', depth: 1 },
      { type: 'child_suspended', childExecutionId: 'c', depth: 1 },
      { type: 'child_awaiting_input', childExecutionId: 'c', partial: 'p', depth: 1 },
      { type: 'child_finished', childExecutionId: 'c', depth: 1, result: { status: 'finished', result: 'd', outcome: 'success' } },
      { type: 'node_error', nodeId: 'n', message: 'm', depth: 0 },
      { type: 'error', code: 'boom', message: 'm' },
      { type: 'finished', result: 'done' },
    ];
    for (const ev of variants) {
      expect(roundTrip(ev)).toEqual(ev);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/executionEventSse`
Expected: FAIL — cannot find module `../executionEventSse.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/events/executionEventSse.ts
import type { ExecutionEvent } from './types.js';

/**
 * The single serializer for the unified SSE vocabulary. Both runtimes' HTTP
 * handlers (prod Worker/BE + sim BE) write `ExecutionEvent`s through this and
 * only this — there is no internal/public split and no per-runtime adapter.
 *
 * Format: `data: <JSON.stringify(event)>\n\n`. The JSON carries the
 * discriminating `type` field, matching every consumer's `data: ` + `JSON.parse`.
 */
export function serializeExecutionEvent(event: ExecutionEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
```

Add to `packages/api/src/index.ts` (re-export; place with the other event exports, sorted):

```ts
export { serializeExecutionEvent } from './events/executionEventSse.js';
export type { ExecutionEvent, Tokens } from './events/types.js';
```

> If RU3 already re-exports `ExecutionEvent`/`Tokens` from `index.ts`, add only the `serializeExecutionEvent` line and do not duplicate the type re-exports.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/executionEventSse`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/events/executionEventSse.ts packages/api/src/events/__tests__/executionEventSse.test.ts packages/api/src/index.ts
git commit -m "feat(api): single ExecutionEvent SSE serializer (data: <JSON>)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire the prod execute handler to emit via the serializer

**Files:**
- Modify: `packages/backend/src/routes/execute/executeHandler.ts`
- (no helper deletions yet — Task 7 removes the dead `writePublicSSE`/`sendNode*` once unreferenced)

**Interfaces:**
- Consumes (from `@daviddh/llm-graph-runner`): `serializeExecutionEvent`, `ExecutionEvent`. From the existing core: whatever RU4 exposes (an `ExecutionEvent` `AsyncIterable` OR the existing `ExecuteCoreCallbacks` — see finding #5; adapt).
- Produces: `handleStreaming` writes `res.write(serializeExecutionEvent(ev))` per event + flush; the terminal is the runtime's `finished` event (no separate `done`).

> **Per finding #5**, RU4 may deliver either (a) an `ExecutionEvent` stream from `executeAgentCore`, or (b) the legacy `ExecuteCoreCallbacks`. Implement against what RU4 delivers. The two sub-variants below are mutually exclusive — pick the one matching RU4.

- [ ] **Step 1: Write the failing test** (handler-level, BE Jest)

```ts
// packages/backend/src/routes/execute/__tests__/executeHandlerSse.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import { serializeExecutionEvent } from '@daviddh/llm-graph-runner';

describe('prod execute SSE', () => {
  it('serializes a finished event through the shared serializer', () => {
    const line = serializeExecutionEvent({ type: 'finished', result: 'done' });
    expect(line).toBe('data: {"type":"finished","result":"done"}\n\n');
  });
});
```

> This is a thin smoke test guarding the contract that the prod handler emits the shared format. The real verification of the handler streaming path is manual (spec §7). Keep it minimal — a full Express SSE integration test is out of scope per spec (no automated render harness).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=execute/__tests__/executeHandlerSse`
Expected: FAIL — `serializeExecutionEvent` not yet exported / handler not wired (depending on Task 1 build state; if Task 1's commit is present it PASSES the assertion but the handler edit below is still required — treat the handler rewrite's `npm run typecheck -w packages/backend` as the gate).

- [ ] **Step 3: Write minimal implementation**

Variant (a) — RU4 exposes an `ExecutionEvent` stream. Replace `handleStreaming`:

```ts
// packages/backend/src/routes/execute/executeHandler.ts (handleStreaming)
import { serializeExecutionEvent } from '@daviddh/llm-graph-runner';
import { setSseHeaders } from './executeHelpers.js';

async function handleStreaming(parsed: ParsedInput, res: Response): Promise<void> {
  setSseHeaders(res);
  const output = await executeAgentCore({
    supabase: parsed.supabase,
    orgId: parsed.orgId,
    agentId: parsed.agentId,
    version: parsed.version,
    input: parsed.input,
  });
  for await (const ev of output.events) {
    res.write(serializeExecutionEvent(ev));
    flushIfPossible(res);
  }
}
```

(`flushIfPossible` = the existing flush guard; lift it from `executeHelpers.ts` or inline a 4-line helper — keep `setSseHeaders` imported from `executeHelpers.ts`.)

Variant (b) — RU4 still uses `ExecuteCoreCallbacks`. Map each callback to an `ExecutionEvent` at the handler boundary and serialize:

```ts
import { serializeExecutionEvent } from '@daviddh/llm-graph-runner';
import type { ExecutionEvent } from '@daviddh/llm-graph-runner';

function emit(res: Response, ev: ExecutionEvent): void {
  res.write(serializeExecutionEvent(ev));
  flushIfPossible(res);
}

async function handleStreaming(parsed: ParsedInput, res: Response): Promise<void> {
  setSseHeaders(res);
  const callbacks: ExecuteCoreCallbacks = {
    onNodeVisited: (nodeId) => emit(res, { type: 'node_entered', nodeId, depth: 0 }),
    onNodeProcessed: (event) => emitNodeProcessed(res, event), // maps text→assistant_message, toolCalls→tool_call, tokens→node_exited, structuredOutput, error→node_error
  };
  const result = await executeAgentCore({ /* …existing args… */ }, callbacks);
  if (result.output !== null) {
    emit(res, { type: 'finished', result: extractFinalText(result), structuredOutputs: extractStructured(result) });
  }
}
```

Extract `emitNodeProcessed` into a small helper module (mirrors the deleted `sendNodeProcessedEvent` mapping but targets `ExecutionEvent`) to respect `max-lines-per-function`.

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -w packages/backend -- --testPathPattern=execute/__tests__/executeHandlerSse` then `npm run typecheck -w packages/backend`
Expected: PASS / clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/executeHandler.ts packages/backend/src/routes/execute/__tests__/executeHandlerSse.test.ts
git commit -m "feat(backend): prod execute handler emits ExecutionEvent via shared serializer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire the sim agent handler to emit via the serializer (replace `simulateAgentSse`)

**Files:**
- Modify: `packages/backend/src/routes/simulateAgentHandler.ts`

**Interfaces:**
- Consumes (from `@daviddh/llm-graph-runner`): `serializeExecutionEvent`, `executeTurn` + its `ExecutionEvent` stream (RU3). From the existing handler: `SimulateAgentRequestSchema`, `setSseHeaders` (from `./simulate.js`).
- Produces: `handleSimulateAgent` iterates the `executeTurn` runtime output's `events` and writes each via `serializeExecutionEvent`; replaces `buildCallbacks`/`runSimulationOrchestration`+`sendStep*`/`sendChild*` and the `executionEventBridge`. Terminal = the runtime's `finished` event (replaces `simulation_complete`); errors = the runtime's `error` event (replaces `sendAgentError`).

> RU3 made `runSimulationOrchestration` a thin driver over `executeTurn`+the bridge, and `simulateAgentHandler.ts` called `buildCallbacks(res)` → `simulateAgentSse`. RU5 collapses that: the handler now iterates `executeTurn(...).events` directly and serializes. If RU3 left `runSimulationOrchestration` as the entry point, change it to return/expose the `ExecutionEvent` stream (drop the bridge call) and have the handler iterate it.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/__tests__/simulateAgentHandlerSse.test.ts
import { describe, expect, it } from '@jest/globals';

import { serializeExecutionEvent } from '@daviddh/llm-graph-runner';

describe('sim agent SSE', () => {
  it('serializes child_awaiting_input through the shared serializer (no old child_waiting)', () => {
    const line = serializeExecutionEvent({
      type: 'child_awaiting_input',
      childExecutionId: 'c',
      partial: 'hold on',
      depth: 1,
    });
    expect(line).toContain('"type":"child_awaiting_input"');
    expect(line).not.toContain('child_waiting');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=__tests__/simulateAgentHandlerSse`
Expected: FAIL until Task 1 is built (then the assertion PASSES; the handler rewrite gate is `npm run typecheck -w packages/backend`).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/routes/simulateAgentHandler.ts
import { serializeExecutionEvent } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';

import { setSseHeaders } from './simulate.js';
import type { SimulateAgentRequest } from './simulateAgentTypes.js';
import { SimulateAgentRequestSchema } from './simulateAgentTypes.js';
import { runSimulationOrchestration } from './simulationOrchestrator.js';

const HTTP_BAD_REQUEST = 400;

function emit(res: Response, line: string): void {
  res.write(line);
  flushIfPossible(res); // existing flush guard, lifted to a shared sim helper
}

export async function handleSimulateAgent(
  req: Request<Record<string, string>, unknown, SimulateAgentRequest>,
  res: Response
): Promise<void> {
  const parsed = SimulateAgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }
  setSseHeaders(res);
  try {
    const output = await runSimulationOrchestration(buildOrchestratorConfig(req.body));
    for await (const ev of output.events) {
      emit(res, serializeExecutionEvent(ev));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Agent simulation failed';
    emit(res, serializeExecutionEvent({ type: 'error', code: 'simulation_failed', message }));
  } finally {
    res.end();
  }
}
```

Keep `buildOrchestratorConfig`/`buildLogPayload`/`log` as-is; delete `buildCallbacks`, `handleOrchestratorResult`, `handleCompletedChild`, and the `simulateAgentSse` imports. (`runSimulationOrchestration` now returns `{ events: AsyncIterable<ExecutionEvent> }` per RU3 — confirm its signature; if it still takes callbacks, expose the emitter's `events` instead.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -w packages/backend -- --testPathPattern=__tests__/simulateAgentHandlerSse` then `npm run typecheck -w packages/backend`
Expected: PASS / clean (the `simulateAgentSse`/bridge deletions land in Task 7; until then they are unreferenced — that is fine, lint's no-unused only fires within a file).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/simulateAgentHandler.ts packages/backend/src/routes/__tests__/simulateAgentHandlerSse.test.ts
git commit -m "feat(backend): sim agent handler emits ExecutionEvent via shared serializer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Migrate prod/sim consumer `api.ts` to `ExecutionEvent` (agent-sim branches)

**Files:**
- Modify: `packages/web/app/lib/api.ts`

**Interfaces:**
- Consumes: the `data: ` SSE lines (parser unchanged), now carrying `ExecutionEvent`. Per finding #3, RETAIN the workflow `node_visited`/`node_processed`/`agent_response` branches (legacy until RU6).
- Produces: re-keyed `dispatchSseEvent`: `assistant_message`/`node_exited`→`onNodeProcessed`; `tool_call`/`tool_result`→fold into node tool calls; `child_dispatched`/`child_finished`/`child_awaiting_input`→sim-composition callbacks (Task 5); `finished`→`onComplete`; `error`→`onError`. The `SseEventSchema` gains the `ExecutionEvent` fields (`toolName`, `toolCallId`, `args`, `result`, `childExecutionId`, `partial`, `isMcp`, `code`, `result` child-result shape) and drops nothing yet (additive parse — workflow fields stay).

- [ ] **Step 1: Write the failing test** (web Jest config)

```ts
// packages/web/app/lib/__tests__/apiExecutionEvent.test.ts
import { describe, expect, it } from '@jest/globals';

import { readSseStream } from '../api';
import type { StreamCallbacks } from '../api';

function streamOf(lines: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const enc = new TextEncoder();
  const chunks = lines.map((l) => enc.encode(`data: ${l}\n\n`));
  let i = 0;
  return {
    read: async () =>
      i < chunks.length ? { done: false, value: chunks[i++]! } : { done: true, value: undefined },
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

describe('api.ts ExecutionEvent reducer', () => {
  it('maps node_exited → onNodeProcessed and finished → onComplete without falling through', async () => {
    const seen: string[] = [];
    const cbs: StreamCallbacks = {
      onNodeProcessed: () => seen.push('processed'),
      onComplete: () => seen.push('complete'),
    };
    await readSseStream(
      streamOf([
        JSON.stringify({ type: 'node_exited', nodeId: 'n', depth: 0, text: 'hi', tokens: { input: 1, output: 1, cached: 0 } }),
        JSON.stringify({ type: 'finished', result: 'done' }),
      ]),
      cbs
    );
    expect(seen).toEqual(['processed', 'complete']);
  });

  it('maps error → onError', async () => {
    const errs: string[] = [];
    await readSseStream(streamOf([JSON.stringify({ type: 'error', code: 'x', message: 'boom' })]), {
      onError: (m) => errs.push(m),
    });
    expect(errs).toEqual(['boom']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/web -- --testPathPattern=__tests__/apiExecutionEvent`
Expected: FAIL — current reducer keys on `node_processed`/`simulation_complete`, not `node_exited`/`finished`.

- [ ] **Step 3: Write minimal implementation**

Re-key `dispatchSseEvent` and add `ExecutionEvent` handlers. Replace the `node_processed`/`agent_response`/`step_*`/`child_completed`/`simulation_complete` agent-sim branches with:

```ts
// packages/web/app/lib/api.ts (dispatchSseEvent — agent-sim branches re-keyed; workflow node_* retained per RU6)
function dispatchSseEvent(event: SseEvent, callbacks: StreamCallbacks): void {
  if (dispatchSimCompositionEvent(event, callbacks)) return; // child_dispatched / child_finished / child_awaiting_input (Task 5)
  if (event.type === 'node_exited') {
    handleNodeExited(event, callbacks);
  } else if (event.type === 'assistant_message') {
    handleAssistantMessage(event, callbacks);
  } else if (event.type === 'finished') {
    callbacks.onComplete?.();
  } else if (event.type === 'error' && event.message !== undefined) {
    callbacks.onError?.(event.message);
  } else if (event.type === 'node_visited' || event.type === 'node_processed' || event.type === 'agent_response') {
    handleLegacyWorkflowEvent(event, callbacks); // RU6 removes — workflow sim path still emits the internal shape
  }
}
```

`handleNodeExited` maps `{ nodeId, text, tokens, durationMs, reasoning, structuredOutput }` → `onNodeProcessed({ nodeId, text: text ?? '', tokens: tokens ?? {input:0,output:0,cached:0}, durationMs, reasoning, structuredOutput, toolCalls: [], output: undefined })`. `handleAssistantMessage` appends to the current node's text (or routes to `onNodeProcessed` with a synthetic node id — match the existing `step_processed` behavior). `handleLegacyWorkflowEvent` retains the existing `handleNodeVisited`/`handleNodeProcessed`/`handleAgentResponse` bodies verbatim. Add the new fields to `SseEventSchema` (`toolName`, `toolCallId`, `args`, `result`, `isMcp`, `childExecutionId`, `partial`, `code`, child-`result` object) as optional.

> `tool_call`/`tool_result` may be folded into the node's `toolCalls` if the sim panel renders per-node tool calls (it does, via `NodeProcessedEvent.toolCalls`). If RU3's emitter coalesces tool calls into `node_exited` already, `tool_call`/`tool_result` can be no-ops here — verify against RU3's `executeTurn` emission. Keep a `tool_call`/`tool_result` branch that accumulates into the open node so nothing falls through.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/web -- --testPathPattern=__tests__/apiExecutionEvent`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/api.ts packages/web/app/lib/__tests__/apiExecutionEvent.test.ts
git commit -m "feat(web): migrate api.ts agent-sim reducer to ExecutionEvent (workflow node_* retained for RU6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Migrate the sim composition consumer (`sseSimComposition` + machine + send) — sim-state first-class

**Files:**
- Modify: `packages/web/app/lib/sseSimComposition.ts`
- Modify: `packages/web/app/hooks/compositionMachine.ts`
- Modify: `packages/web/app/hooks/simulationSendHelpers.ts`
- Modify: `packages/web/app/hooks/useSimulationSend.ts`

**Interfaces:**
- Consumes: `ExecutionEvent` `child_dispatched`/`child_finished`/`child_awaiting_input`/`simulation_state_patch`/`simulation_state_snapshot`.
- Produces: `dispatchSimCompositionEvent` keys on the new type strings + reads `ExecutionEvent` fields (`childExecutionId`, `result.result`/`result.outcome`, `partial`, `depth`); new `onSimChildAwaitingInput` (was `onSimChildWaiting`), new `onSimulationStatePatch`/`onSimulationStateSnapshot` callbacks routed to the sim-state store (RU3's `useSimulationState.adoptSnapshot`). The state-machine `CompositionEvent` names (`CHILD_*`) are FE-internal, unchanged; the phase string `'child_waiting'` → `'child_awaiting_input'` is internal but renamed for consistency.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/app/lib/__tests__/sseSimComposition.test.ts
import { describe, expect, it } from '@jest/globals';

import { dispatchSimCompositionEvent } from '../sseSimComposition';
import type { SimCompositionCallbacks } from '../sseSimComposition';

describe('dispatchSimCompositionEvent (ExecutionEvent)', () => {
  it('maps child_finished (ExecutionEvent.result) → onSimChildFinished', () => {
    let out: { output: string; status: string } | null = null;
    const cbs: SimCompositionCallbacks = {
      onSimChildFinished: (e) => (out = { output: e.output, status: e.status }),
    };
    const handled = dispatchSimCompositionEvent(
      { type: 'child_finished', childExecutionId: 'c', depth: 1, result: { status: 'finished', result: 'done', outcome: 'success' } },
      cbs
    );
    expect(handled).toBe(true);
    expect(out).toEqual({ output: 'done', status: 'success' });
  });

  it('maps child_awaiting_input → onSimChildAwaitingInput', () => {
    let text = '';
    dispatchSimCompositionEvent(
      { type: 'child_awaiting_input', childExecutionId: 'c', partial: 'hold', depth: 1 },
      { onSimChildAwaitingInput: (e) => (text = e.text) }
    );
    expect(text).toBe('hold');
  });

  it('forwards simulation_state_snapshot to onSimulationStateSnapshot', () => {
    let state: Record<string, unknown> | null = null;
    dispatchSimCompositionEvent(
      { type: 'simulation_state_snapshot', state: { a: 1 } },
      { onSimulationStateSnapshot: (s) => (state = s) }
    );
    expect(state).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/web -- --testPathPattern=__tests__/sseSimComposition`
Expected: FAIL — keys on old `child_waiting` + reads `event.output`/`event.text`, no `result`/`partial`/sim-state branches.

- [ ] **Step 3: Write minimal implementation**

Re-key `dispatchSimCompositionEvent` and map `ExecutionEvent` fields:

```ts
// packages/web/app/lib/sseSimComposition.ts (excerpt)
export interface SimChildFinishedEvent { depth: number; output: string; status: string; tokens: { input: number; output: number; cached: number } }
export interface SimChildAwaitingInputEvent { depth: number; text: string }

export interface SimCompositionCallbacks {
  onSimChildDispatched?: (event: SimChildDispatchedEvent) => void;
  onSimChildFinished?: (event: SimChildFinishedEvent) => void;
  onSimChildAwaitingInput?: (event: SimChildAwaitingInputEvent) => void;
  onSimulationStatePatch?: (patch: { tool: string; path: string; value: unknown }) => void;
  onSimulationStateSnapshot?: (state: Record<string, unknown>) => void;
}

export function dispatchSimCompositionEvent(event: CompositionSseEvent, cbs: SimCompositionCallbacks): boolean {
  if (event.type === 'child_dispatched') return handleChildDispatched(event, cbs);
  if (event.type === 'child_finished') return handleChildFinished(event, cbs);
  if (event.type === 'child_awaiting_input') return handleChildAwaitingInput(event, cbs);
  if (event.type === 'simulation_state_patch') return handleStatePatch(event, cbs);
  if (event.type === 'simulation_state_snapshot') return handleStateSnapshot(event, cbs);
  return false;
}
```

`handleChildFinished` reads `event.result` (the `ChildResult`): `output = result.status === 'finished' ? result.result : ''`, `status = result.outcome ?? (result.status === 'error' ? 'error' : 'success')`. `handleChildAwaitingInput` reads `event.partial`. `handleStatePatch`/`handleStateSnapshot` forward to the new callbacks (each `return true`). Update `CompositionSseEvent`/`SimCompositionSchemaFields` to carry `childExecutionId`, `partial`, `result` (child-result object), `state`, `tool`, `path`, `value`. In `simulationSendHelpers.ts`: rename `onSimChildWaiting`→`onSimChildAwaitingInput`, add `onSimulationStateSnapshot: (s) => deps.setters.adoptSnapshot(s)` (RU3's sim-state store). In `compositionMachine.ts`: rename the `'child_waiting'` phase literal to `'child_awaiting_input'` (update the `CompositionPhase` union + any references in `useSimulationSend.ts`). `useSimulationSend.ts` only references `phase` strings via `CompositionPhase` — update if it literals `'child_waiting'` (it does not currently; verify).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/web -- --testPathPattern=__tests__/sseSimComposition` then `npm run typecheck -w packages/web`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/sseSimComposition.ts packages/web/app/hooks/compositionMachine.ts packages/web/app/hooks/simulationSendHelpers.ts packages/web/app/hooks/useSimulationSend.ts packages/web/app/lib/__tests__/sseSimComposition.test.ts
git commit -m "feat(web): migrate sim composition consumer to ExecutionEvent; sim-state events first-class

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Migrate the widget (`publicEvents` + `eventToBlock` + `sseReader` + `useChatStream`)

**Files:**
- Modify: `packages/widget/src/types/publicEvents.ts`
- Modify: `packages/widget/src/api/eventToBlock.ts`
- Modify: `packages/widget/src/api/sseReader.ts`
- Modify: `packages/widget/src/ui/useChatStream.ts`

**Interfaces:**
- Consumes: the same `data: ` lines from the prod execute handler, now carrying `ExecutionEvent` (Task 2). Per finding #2 the widget keeps its OWN transport + a **vendored** `ExecutionEvent` union (no `@daviddh/*` dep added).
- Produces: `publicEvents.ts` exports `ExecutionEvent` (same members as the api union, vendored). `BlockCoalescer.push` keys on `assistant_message`/`node_exited`/`tool_call`/`tool_result`/`node_error`. `useChatStream`/`executeClient` terminal becomes `finished` (was `done`); fatal becomes `error` (`{ code, message }`, was `{ message }`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/widget/src/api/__tests__/eventToBlock.test.ts
import { describe, expect, it } from 'vitest'; // widget uses its own runner; match it

import { BlockCoalescer } from '../eventToBlock.js';

describe('BlockCoalescer (ExecutionEvent)', () => {
  it('coalesces assistant_message text and renders a tool_call block', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'assistant_message', text: 'hello', depth: 0 });
    c.push({ type: 'tool_call', toolName: 'create_event', toolCallId: 'i', args: { title: 'Sync' }, depth: 0, isMcp: false });
    const blocks = c.finalize();
    expect(blocks.some((b) => b.type === 'text' && b.content === 'hello')).toBe(true);
    expect(blocks.some((b) => b.type === 'action' && b.title === 'Sync')).toBe(true);
  });

  it('renders node_error as an alert action', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'node_error', nodeId: 'n', message: 'failed', depth: 0 });
    expect(c.finalize().some((b) => b.type === 'action' && b.description === 'failed')).toBe(true);
  });
});
```

> Match the widget's actual test runner (Vitest vs Jest — check `packages/widget/package.json` `test` script before writing the import). If the widget has no test setup, add a minimal one or fold this into a typecheck-gated assertion; do NOT introduce a new test framework just for this.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/widget` (or the widget's configured runner)
Expected: FAIL — `BlockCoalescer.push` keys on `text`/`toolCall`/`nodeError`.

- [ ] **Step 3: Write minimal implementation**

`publicEvents.ts`: replace the `PublicExecutionEvent` union with a vendored `ExecutionEvent` (copy the api union members + `Tokens` + a local `ChildResult`). `sseReader.ts`: change the imported type to `ExecutionEvent` (the parse logic is type-agnostic — only the import + `isEvent` return type change). `eventToBlock.ts`:

```ts
// packages/widget/src/api/eventToBlock.ts (push)
push(ev: ExecutionEvent): void {
  switch (ev.type) {
    case 'assistant_message':
      this.pushText(ev.text, `msg-${ev.depth}`);
      break;
    case 'node_exited':
      if (ev.text !== undefined && ev.text !== '') this.pushText(ev.text, ev.nodeId);
      break;
    case 'tool_call':
      this.flushText();
      this.blocks.push(makeToolBlock({ name: ev.toolName, args: ev.args, result: undefined }));
      break;
    case 'tool_result':
      // optional: attach result to the last tool block; no-op is acceptable
      break;
    case 'node_error':
      this.flushText();
      this.blocks.push({ type: 'action', icon: 'alert-triangle', title: 'Step failed', description: ev.message });
      break;
    default:
      break; // node_entered, tokens, child_*, simulation_state_*, error, finished — not blocks
  }
}
```

`useChatStream.ts`: in `handleStreamEvent`, `ev.type === 'error'` stays (read `ev.message`); replace `ev.type === 'done'` with `ev.type === 'finished'` (finalize on `finished`); `coalescer.push(ev)` now takes `ExecutionEvent`. `executeClient.ts`/`HandleEventArgs` type inference flows from `execute`'s `AsyncGenerator<ExecutionEvent>` — update `execute`'s return type to the new union.

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -w packages/widget` then `npm run typecheck -w packages/widget`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/types/publicEvents.ts packages/widget/src/api/eventToBlock.ts packages/widget/src/api/sseReader.ts packages/widget/src/ui/useChatStream.ts packages/widget/src/api/__tests__/eventToBlock.test.ts
git commit -m "feat(widget): migrate to vendored ExecutionEvent (assistant_message/tool_call/node_error/finished)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Delete legacy shapes, the internal→public converter, `simulateAgentSse`, `AgentSimulationEvent`, and the RU3 bridge

**Files:**
- Modify: `packages/backend/src/routes/execute/executeTypes.ts` (delete the two SSE unions + members; keep response types + request schema)
- Modify: `packages/backend/src/routes/execute/executeHelpers.ts` (delete `writePublicSSE`/`sendNodeVisitedEvent`/`sendNodeProcessedEvent`; keep the rest)
- Delete: `packages/backend/src/routes/simulateAgentSse.ts`
- Modify: `packages/backend/src/routes/simulateAgentTypes.ts` (delete `AgentSimulationEvent` + members + the RU3 temporary sim-state members; keep `SimulateAgentRequest`/`SimulateAgentRequestSchema`)
- Delete: `packages/backend/src/runtime/executionEventBridge.ts`
- Delete: `packages/backend/src/runtime/__tests__/executionEventBridge.test.ts`

**Interfaces:**
- Consumes: nothing new — this task removes now-unreferenced code (Tasks 2/3 stopped referencing it).
- Produces: a tree where the only SSE writer is `serializeExecutionEvent`. (The RU3 emitter-completeness assertion test under `packages/api/src/events/__tests__/emitterCompleteness.test.ts` is RETAINED — do not touch it.)

- [ ] **Step 1: Prove the legacy code is unreferenced (failing-to-find check)**

Run: `cd packages/backend && grep -rn "writePublicSSE\|sendNodeVisitedEvent\|sendNodeProcessedEvent\|AgentSimulationEvent\|writeAgentSSE\|sendStepProcessed\|sendChildWaiting\|executionEventToSim\|InternalExecutionEvent\|PublicExecutionEvent" src --include="*.ts" | grep -v __tests__`
Expected: only the DEFINITIONS (in the files being deleted/edited) remain — NO callers in `simulateAgentHandler.ts`/`executeHandler.ts`/`simulationOrchestrator.ts`. If a caller remains, finish Tasks 2/3 first.

- [ ] **Step 2: Delete + edit**

- `git rm packages/backend/src/routes/simulateAgentSse.ts packages/backend/src/runtime/executionEventBridge.ts packages/backend/src/runtime/__tests__/executionEventBridge.test.ts`
- In `executeTypes.ts`: delete the `/* Internal SSE events */` and `/* Public SSE events */` blocks (`InternalNodeVisited`/`InternalNodeProcessed`/`InternalAgentResponse`/`InternalError`/`InternalComplete` + `InternalExecutionEvent`; `PublicNodeVisited`/`PublicText`/`PublicToolCall`/`PublicTokenUsage`/`PublicStructuredOutput`/`PublicNodeError`/`PublicError`/`PublicDone` + `PublicExecutionEvent`). KEEP the shared response block (`ToolCallRecord`/`TokenUsage`/`WorkflowExecutionResponse`/`AgentAppResponse`/`AgentExecutionResponse`) and `AgentExecutionInputSchema`/`AgentExecutionInput`.
- In `executeHelpers.ts`: delete `writePublicSSE`, `sendNodeVisitedEvent`, `sendNodeProcessedEvent` and the now-unused `PublicExecutionEvent`/`NodeProcessedEvent` imports. KEEP `setSseHeaders`, `buildUserMessage`, `resolveServerTransport`/`resolveMcpTransportVariables`, `sumTokens`/`sumTotalCost`, `resolveOAuthForExecution`, `logExec`.
- In `simulateAgentTypes.ts`: delete `AgentStepStartedEvent`/`AgentStepProcessedEvent`/`AgentToolExecutedEvent`/`AgentResponseEvent`/`AgentSimulationErrorEvent`/`AgentSimulationCompleteEvent`/`ChildDispatchedEvent`/`ChildFinishedEvent`/`ChildWaitingEvent` + the `AgentSimulationEvent` union + the RU3-added `simulation_state_patch`/`simulation_state_snapshot` members (if RU3 added them here). KEEP all request-schema code.

- [ ] **Step 3: Run the gate**

Run: `npm run typecheck -w packages/backend && npm run lint -w packages/backend`
Expected: clean — no unresolved imports, no unused exports flagged.

- [ ] **Step 4: Verify the retained assertion still runs**

Run: `npm run test -w packages/api -- --testPathPattern=events/__tests__/emitterCompleteness`
Expected: PASS (RU3's emitter-completeness assertion is untouched).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/executeTypes.ts packages/backend/src/routes/execute/executeHelpers.ts packages/backend/src/routes/simulateAgentTypes.ts
git rm packages/backend/src/routes/simulateAgentSse.ts packages/backend/src/runtime/executionEventBridge.ts packages/backend/src/runtime/__tests__/executionEventBridge.test.ts
git commit -m "refactor(backend): delete legacy SSE shapes, internal->public converter, simulateAgentSse, AgentSimulationEvent, RU3 bridge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full gate + light per-consumer reducer coverage check

**Files:**
- (no new source) — confirm the three light reducer tests (Tasks 4/5/6) each cover every `ExecutionEvent` type without falling through, then run the full gate.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green `npm run check`; a documented manual-verification checklist (spec §7) to run before RU6.

- [ ] **Step 1: Augment each consumer reducer test with a "no fall-through" sweep**

In each of `apiExecutionEvent.test.ts`, `sseSimComposition.test.ts`, `eventToBlock.test.ts`, add one test that pushes EVERY `ExecutionEvent` variant (the 14-member list from Task 1) through the reducer and asserts no throw + that each is either handled or explicitly ignored (the `default`/`return false` branch). This is the spec §8 "light, not a full render harness" check — replacing the deleted per-shape parse tests.

```ts
// pattern (web sseSimComposition): every type either returns true or false, never throws
const ALL: CompositionSseEvent[] = [ /* all 14 ExecutionEvent variants */ ];
it('handles every ExecutionEvent type without throwing', () => {
  for (const ev of ALL) expect(() => dispatchSimCompositionEvent(ev, {})).not.toThrow();
});
```

- [ ] **Step 2: Run each package's suite**

Run: `npm run test -w packages/api`, `npm run test -w packages/backend`, `npm run test -w packages/web`, `npm run test -w packages/widget`
Expected: all PASS.

- [ ] **Step 3: Full gate**

Run: `npm run check`
Expected: format + lint + typecheck clean across all packages.

- [ ] **Step 4: Record the manual cross-consumer verification checklist (spec §7) — DO NOT skip; precedes RU6**

Verify manually against the three live surfaces (no automated harness): per-node tokens, durations, reasoning, structured output, per-node (`node_error`) errors, `child_dispatched`/`child_finished`/`child_awaiting_input` nesting with correct `depth`, sim-state (`simulation_state_patch` preview + `simulation_state_snapshot` adoption), and the widget's `assistant_message`/`tool_call`/`finished` rendering. Fix regressions as found.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/__tests__/apiExecutionEvent.test.ts packages/web/app/lib/__tests__/sseSimComposition.test.ts packages/widget/src/api/__tests__/eventToBlock.test.ts
git commit -m "test(ru5): per-consumer ExecutionEvent reducer no-fall-through sweeps; full gate green

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

Spec §1–§10 → task mapping:

- **§1 Intent (collapse 3 vocabularies + delete converter)** → Tasks 1 (one serializer), 2/3 (handlers), 4/5/6 (consumers), 7 (deletions).
- **§2 Scope (serializer + 3 consumer migrations + deletions; out: emitter, harness, RU6 deletions)** → Task 1 (serializer only, not the emitter — RU3), Tasks 4/5/6 (consumers), Task 7 (only the SSE-shape/writer code, not the orchestrator). No automated harness (Task 8 = manual checklist).
- **§3 Three vocabularies → one (RU3 superset, old strings replaced not aliased)** → Tasks 4/5/6 full rename; Task 7 deletes the old strings. (FLAG: `api.ts` workflow `node_*` branches retained until RU6 — finding #3.)
- **§4 The serializer (`data: <JSON>\n\n`, both handlers)** → Task 1 + Tasks 2/3.
- **§5 Consumer migrations (full rename)** → Task 4 (prod/sim `api.ts`), Task 5 (sim composition + sim-state first-class), Task 6 (widget). (FLAG: widget vendors the type, separate transport — finding #2.)
- **§6 Deletions (internal+public shapes, converter, `AgentSimulationEvent`+`simulateAgentSse`, RU3 bridge+temp members+test; any `ssePublicAdapter`/`sseSimulationAdapter`)** → Task 7. (No `ssePublicAdapter`/`sseSimulationAdapter` exist in-tree — confirmed none to delete.)
- **§7 Verification (manual, no harness; RU3 emitter-completeness retained)** → Task 8 Step 4 checklist; Task 7 Step 4 keeps the assertion.
- **§8 Tests (serializer unit, light consumer reducer, retained assertion, `npm run check`)** → Task 1 (serializer), Tasks 4/5/6 + Task 8 (light reducer sweeps), Task 7 (assertion retained), Task 8 (`npm run check`).
- **§9 Affected paths** → covered by the File Structure table.
- **§10 Risks (hard cutover no fallback, widget coupling, serializer location, ordering vs RU6)** → finding #2 (widget transport confirmed separate), finding #4 (serializer in `packages/api/src/events`), finding #3 + Task 7 scope (RU6 ordering: workflow `node_*` + `simulate.ts` writer retained).

Manual cross-consumer verification (spec §7) precedes RU6: Task 8 Step 4 is the gate before any further RU6 deletion.
