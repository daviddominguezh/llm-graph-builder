# RU5 — SSE hard cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the divergent internal SSE vocabularies onto **one** superset `ExecutionEvent` union + **one** serializer (`executionEventSse.ts`: `ExecutionEvent → data: <JSON>\n\n`), and serve every surface through it. Internally everything is `ExecutionEvent`; at the **public boundary (decision B)** a single `ExecutionEvent → PublicExecutionEvent` **projection** runs at the BE serve step, so the external API + the embedded widget keep their stable curated/vendored `PublicExecutionEvent` shape — **the widget is NOT rewritten**. The prod BE serve step is the **durable SSE delivery** path (§4b): it **subscribes Redis Cloud channel `execution_id`**, **tails the Postgres event log** (`agent_execution_events` via `getEventsAfter`) for `Last-Event-ID`/`seq` resume, sends **heartbeats**, and survives BE-instance failover (any instance serves; gap-replay from Postgres). The sim path is in-process and serializes directly. The FE stops choosing agent-vs-workflow — the **two stream fns collapse into one** call to the single sim API; the BE routes by `appType` (RU3's `runUnifiedSimulation`). Delete the per-runtime internal→public converter, the sim `AgentSimulationEvent` union + `simulateAgentSse.ts` writer, and the RU3 throwaway bridge (`executionEventBridge.ts` + `bridgeAgent.ts` + `bridgeWorkflow.ts` + test + the temporary sim-state union members). **Keep `PublicExecutionEvent`** (now produced by the projection). Manual cross-consumer verification (no automated render harness); the RU3 emitter-completeness assertion is retained.

**Architecture:** RU3 defines the superset `ExecutionEvent` union (`packages/api/src/events/types.ts`) + emitter + `executeTurn` (returns `{ events: AsyncIterable<ExecutionEvent>, finalResult }`) + the unified sim handler (`runUnifiedSimulation` in `simulateHandlerUnified.ts`, BE-routes agent-vs-workflow, workflow engine migrated onto the core) + the throwaway `executionEventToSim` bridge + the emitter-completeness assertion. RU4 makes prod durable: `executeAgentCore` keeps the `ExecuteCoreCallbacks` shape (NOT an `ExecutionEvent` AsyncIterable — see finding #1); the Worker publishes `ExecutionEvent`s to Redis Cloud (channel `execution_id`) via `POST /internal/events/publish` and persists them to `agent_execution_events` with a monotonic `sequence` (`next_execution_event_seq` RPC). RU5 adds: (1) the single neutral serializer in `packages/api`; (2) the `ExecutionEvent → PublicExecutionEvent` projection module; (3) the **prod durable SSE serve handler** (resolve active leaf → trigger Worker → subscribe Redis → project → write `id: <seq>\ndata: <JSON>` + heartbeats; on reconnect replay gap from Postgres via `getEventsAfter` then re-subscribe); (4) the sim-agent + sim-workflow consumer migrations with the two FE stream fns collapsed; (5) the deletions. The widget is left as-is on the wire (verify the projection matches its vendored shape).

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `noUncheckedIndexedAccess`), the api package (`@daviddh/llm-graph-runner`) events module, Express SSE + `ioredis` pub/sub (`messaging/services/redisCloud.ts` `subscribeToChannel`/`publishMessage`) + Supabase Postgres (`getEventsAfter`) on the BE, Next.js 16 / React (web sim consumers), the widget (Vite/React + Vitest, its own `sseReader`/`eventToBlock`), Zod (web `api.ts` parse), Jest ESM (`npm run test -w packages/<pkg>`; web uses its own config; widget uses Vitest).

## Global Constraints

- npm workspaces. ESM (`"type":"module"`, NodeNext). TS strict, `noUncheckedIndexedAccess`. **Never `any`. Never eslint-disable.**
- ESLint: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2 — split into helpers/files.
- Tests: Jest ESM — `npm run test -w packages/<pkg> -- --testPathPattern=…`; web uses its own config; **widget uses Vitest** (`npm run test -w packages/widget`). Full gate: `npm run check`.
- **Always add/update translations** for any user-facing copy touched.
- **Document any new `process.env.X` in `.env.example` in the same change.** (RU5 reuses `REDIS_URL` — already documented — so no new env var is expected; if you add one, document it.)
- Prettier: single quotes, 2-space, width 110, trailing comma es5; `@trivago` import sorting.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; stage files explicitly (no `git add -A`, no `-am`).

---

## Decisions / spec-vs-code findings (READ BEFORE STARTING — these are FLAGS, not silent fixes)

Verified against the real code on branch `feat/data-tools` and the RU3/RU4/RU6 plans+specs. Where the spec assumes a shape the code does not (yet) have, this plan implements against reality and flags it here.

1. **RU4 does NOT convert `executeAgentCore` to an `ExecutionEvent` AsyncIterable — it keeps the callback shape.** Real RU4 leaves `executeAgentCore(params, callbacks?: ExecuteCoreCallbacks): Promise<ExecuteCoreOutput>` where `ExecuteCoreCallbacks = { onNodeVisited; onNodeProcessed }` (`executeCore.ts` / `executeCoreTypes.ts`). RU4's durable producer side lives in the **Worker** + `POST /internal/events/publish` (publishes `ExecutionEvent`s to Redis) + per-step Postgres persistence; the BE prod handler is NOT rewritten by RU4. **FLAG (spec §4b assumes the serve step reads `ExecutionEvent`s from Redis/log, which is true — the Worker produces them — but the legacy non-durable in-process `handleStreaming` path in `executeHandler.ts` still uses callbacks).** Resolution: RU5's **new prod serve path** reads `ExecutionEvent`s from the Redis subscription + Postgres log (Task 3) and projects them — it does NOT touch `executeAgentCore`'s callback contract. The legacy in-process `handleStreaming` (callbacks → `writePublicSSE`) is superseded by the durable serve path; RU5 replaces `handleExecute`'s streaming branch with the durable serve handler and removes the `writePublicSSE`/`sendNode*` converter (Task 7). The non-streaming JSON branch (`handleNonStreaming`) is untouched.

2. **The prod public consumer is the external API + the embedded widget — NOT `api.ts`.** Real code: the widget (`packages/widget`) hits `/api/chat/execute/{tenant}/{agent}/{version}` (the prod `executeHandler.ts` → `executeAgentCore`) and parses the **public** shape (`node_visited`/`text`/`toolCall`/`tokenUsage`/`structuredOutput`/`nodeError`/`error`/`done`) via its own vendored `PublicExecutionEvent` (`packages/widget/src/types/publicEvents.ts`), `sseReader.ts`, `eventToBlock.ts`, `useChatStream.ts`. `packages/widget/package.json` has **no `@daviddh/*` dependency** — it is a separate transport. Under decision B the widget is **kept untouched on the wire**; only the new BE `ExecutionEvent → PublicExecutionEvent` projection feeds it. **FLAG (the earlier RU5 draft WRONGLY rewrote the widget to a vendored `ExecutionEvent` and deleted the public shapes).** This plan does the opposite: keep `PublicExecutionEvent`, add the projection, verify the widget renders unchanged (Task 6 is verification-only, no widget source rewrite).

3. **`api.ts` is the SIM-WORKFLOW consumer, not "prod".** Real code: `packages/web/app/lib/api.ts` `streamSimulation` POSTs `/api/simulate`; the web proxy (`packages/web/app/api/simulate/route.ts`) **already routes by `appType`** server-side (`body.appType === 'agent'` → `${API_URL}/simulate-agent`, else `${API_URL}/simulate`). `api.ts`'s permissive `SseEventSchema` + `dispatchSseEvent` currently handle BOTH (a) the agent-sim shape from `simulateAgentHandler`/`simulateAgentSse` (`step_started`/`step_processed`/`tool_executed`/`agent_response`/`child_dispatched`/`child_finished`/`child_waiting`/`simulation_complete`) AND (b) the workflow-sim shape from `simulateHandler` (`node_visited`/`node_processed`/`agent_response`/`simulation_complete`). After RU3 **both** sim engines run through `runUnifiedSimulation` emitting `ExecutionEvent` (RU3 migrated the workflow engine onto the core — confirmed in the RU3 plan, Tasks 14/17/18). So RU5 migrates `api.ts`'s reducer to `ExecutionEvent` for **both** sim paths — there is NO retained legacy `node_*` branch (the earlier draft's finding #3 retention is OBSOLETE because RU3 migrated the workflow engine). **FLAG:** this depends on RU3 actually landing the workflow-engine migration (`buildWorkflowMachineDeps` + `WorkflowStepMachine` + `runUnifiedSimulation`). If RU3 lands WITHOUT migrating the workflow engine, retain the `node_visited`/`node_processed` branches in `api.ts` until RU6 and flag it — but per the merged RU3 plan it IS migrated, so this plan assumes the full rename.

4. **The two FE sim stream fns collapse into ONE call; the BE already routes by `appType`.** Real code: `streamSimulation` (`api.ts`) and `streamAgentSimulation` (`agentSimulationApi.ts`) are two near-identical `fetch('/api/simulate')` wrappers differing only in request body. The proxy routes by `appType`. RU5 collapses them into a single `streamSimulate(params, callbacks, signal)` in `api.ts` (the body's `appType` drives routing, unchanged at the proxy). `agentSimulationApi.ts`'s `streamAgentSimulation` is deleted; `simulationSendHelpers.ts`'s `sendAgentSim`/`sendWorkflowSim` both call the single fn. The proxy + `simulateHandlerUnified` (RU3) are NOT modified by RU5 (RU3 owns the unified handler; RU5 owns the FE collapse + consumer reducer).

5. **`PublicExecutionEvent` is KEPT (decision B) and RELOCATED behind the projection.** `executeTypes.ts` currently declares BOTH the internal SSE union (`InternalExecutionEvent` + members) AND the public union (`PublicExecutionEvent` + members) AND the shared non-streaming response types (`AgentExecutionResponse`/`AgentAppResponse`/`WorkflowExecutionResponse`/`TokenUsage`/`ToolCallRecord`). RU5 (Task 7) deletes the **internal** union + the converter (`writePublicSSE`/`sendNodeVisitedEvent`/`sendNodeProcessedEvent` in `executeHelpers.ts`), and **moves** the `PublicExecutionEvent` union into the new projection module (`executionEventPublic.ts`) — it is now produced by the `ExecutionEvent → PublicExecutionEvent` projection, not the deleted converter. The widget's vendored copy stays its own source of truth. The non-streaming response types STAY (`buildResponseByType`/`respondNormally` use them). RU6 (not RU5) deletes `executeTypes.ts`'s internal-shape remnants if any survive and decommissions the edge runtime; `PublicExecutionEvent` is explicitly NOT deleted by RU6 either (decision B).

6. **`getEventsAfter` returns a DB-row `ExecutionEvent` (NOT the api union) — name collision.** `packages/backend/src/db/queries/eventQueries.ts` exports `interface ExecutionEvent { executionId; orgId; sequence; eventType; payload }` — a **persistence row**, distinct from `@daviddh/llm-graph-runner`'s `ExecutionEvent` **union**. RU5's serve step reads rows via `getEventsAfter`, takes `row.payload` (the serialized api `ExecutionEvent`) + `row.sequence` (the SSE `id:`), projects `payload` → `PublicExecutionEvent`, and writes `id: <sequence>\ndata: <JSON>`. **FLAG:** import the row type as `PersistedEventRow` (alias) in RU5's serve module to avoid shadowing the union. RU4 owns writing `payload`; RU5 trusts `payload` is a valid api `ExecutionEvent` and validates defensively at the projection boundary.

7. **`runSimulationOrchestration` keeps the callback shape; `executeTurn` (api) returns the `ExecutionEvent` AsyncIterable.** RU3 makes `runUnifiedSimulation` (`simulateHandlerUnified.ts`) iterate `executeTurn(...).events`. RU5's sim-handler work is therefore: have `simulateHandlerUnified.ts` serialize each `ExecutionEvent` via the shared serializer (Task 4) and delete the bridge + `simulateAgentSse` (Task 7). RU5 does NOT need to touch `runSimulationOrchestration` directly — RU3 already rerouted the handlers through `runUnifiedSimulation`. (If RU3 left `simulateAgentHandler.ts`/`simulateHandler.ts` as thin shims delegating to `runUnifiedSimulation`, RU5 only edits the unified handler's write step.)

8. **`REDIS_URL` + `subscribeToChannel`/`publishMessage` already exist.** `packages/backend/src/messaging/services/redisCloud.ts` already exports `subscribeToChannel(channel, cb): () => void` (dedicated ioredis subscriber, `.subscribe` + `.on('message')`, returns an unsubscribe fn) and `publishMessage(channel, payload)`. `REDIS_URL` is in `.env.example` (Redis Cloud pub/sub). RU5's serve step reuses `subscribeToChannel` — **no new env var, no new Redis client**. The completion-notifier env vars (`COMPLETION_*`) are unrelated to RU5's serve path.

9. **api package `no-console`** — the serializer + projection are pure (no logging). The BE serve handler uses `process.stdout.write` (the codebase's logging convention, see `executeHelpers.logExec`), not `console`. No action unless `npm run lint` flags it.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/api/src/events/executionEventSse.ts` (create) | `serializeExecutionEvent(event: ExecutionEvent): string` → `data: <JSON>\n\n`. The ONLY place an `ExecutionEvent` is written to the wire. Pure, no Express/Node deps. |
| `packages/api/src/events/__tests__/executionEventSse.test.ts` (create) | Every `ExecutionEvent` variant → well-formed `data: …\n\n`; round-trips through `JSON.parse`. |
| `packages/api/src/index.ts` (modify) | Re-export `serializeExecutionEvent` (+ `ExecutionEvent`/`Tokens` if RU3 has not already). |
| `packages/backend/src/routes/execute/executionEventPublic.ts` (create) | The `ExecutionEvent → PublicExecutionEvent` **projection** (decision B). Houses the relocated `PublicExecutionEvent` union (moved from `executeTypes.ts`) + `projectToPublic(ev: ExecutionEvent): PublicExecutionEvent[]`. Pure. |
| `packages/backend/src/routes/execute/__tests__/executionEventPublic.test.ts` (create) | Projection covers every `ExecutionEvent` variant → the widget's vendored shape (or drops it); golden-matches `packages/widget/src/types/publicEvents.ts`. |
| `packages/backend/src/routes/execute/executeServeSse.ts` (create) | The prod **durable SSE serve** step (§4b): resolve active leaf → trigger Worker → `subscribeToChannel(execution_id)` → project → write `id: <seq>\ndata: <JSON>` + heartbeats; `Last-Event-ID`/`seq` resume via `getEventsAfter`; failover (gap-replay from Postgres). |
| `packages/backend/src/routes/execute/__tests__/executeServeSse.test.ts` (create) | Unit: resume replays the Postgres gap (`getEventsAfter`) before live; heartbeat formatting (`: ping\n\n`); `id:`/`seq` framing. |
| `packages/backend/src/routes/execute/executeHandler.ts` (modify) | Replace the streaming branch with the durable serve step (`serveDurableSse`); drop the `writePublicSSE` `done`/error writes (use the projection's `finished`/`error`). Keep the non-streaming JSON branch. |
| `packages/backend/src/routes/execute/executeHelpers.ts` (modify) | Delete `writePublicSSE`/`sendNodeVisitedEvent`/`sendNodeProcessedEvent`; keep `setSseHeaders` + all non-SSE helpers. |
| `packages/backend/src/routes/simulateHandlerUnified.ts` (modify) | The unified sim handler (RU3) iterates `executeTurn(...).events` — change its write step to `serializeExecutionEvent` (drop the `executionEventToSim` bridge + `simulateAgentSse`/`simulate.writeSSE`). |
| `packages/web/app/lib/api.ts` (modify) | Re-key `dispatchSseEvent` onto `ExecutionEvent` type strings (both sim engines now emit it — finding #3). Collapse `streamSimulation` → the single `streamSimulate`. Drop the legacy `step_*`/`agent_response`/`child_completed`/`node_*`/`simulation_complete` branches. |
| `packages/web/app/lib/agentSimulationApi.ts` (modify/shrink) | Delete `streamAgentSimulation` (collapsed into `api.ts`'s `streamSimulate`); keep `AgentSimulateRequestBody`/`CompositionStackEntry` types (still used to build the request body). |
| `packages/web/app/lib/sseSimComposition.ts` (modify) | `child_dispatched`/`child_finished`/`child_waiting` → `child_dispatched`/`child_finished`/`child_awaiting_input`; read `ExecutionEvent` fields (`childExecutionId`, `result` `ChildResult`, `partial`, `depth`, `dispatchType`, `task`); add `simulation_state_patch`/`simulation_state_snapshot` callbacks (first-class). |
| `packages/web/app/hooks/compositionMachine.ts` (modify) | Rename the `'child_waiting'` `CompositionPhase` literal → `'child_awaiting_input'`; FE-internal `CHILD_*` event names unchanged. |
| `packages/web/app/hooks/simulationSendHelpers.ts` (modify) | `onSimChildWaiting` → `onSimChildAwaitingInput`; add `onSimulationStatePatch`/`onSimulationStateSnapshot` wiring; route both senders through the single `streamSimulate`. |
| `packages/web/app/hooks/useSimulationSend.ts` (modify) | Update only if a renamed phase/callback flows through (verify `'child_waiting'` literal). |
| `packages/widget/src/**` (NO source rewrite) | **KEPT** under decision B. Task 6 is verification-only: confirm the BE projection's output matches the vendored `PublicExecutionEvent` so the widget renders unchanged. |
| `packages/backend/src/routes/execute/executeTypes.ts` (modify) | Delete `InternalExecutionEvent`+members; **MOVE** `PublicExecutionEvent`+members to `executionEventPublic.ts`; KEEP `AgentExecutionResponse`/`AgentAppResponse`/`WorkflowExecutionResponse`/`TokenUsage`/`ToolCallRecord`/`AgentExecutionInputSchema`. |
| `packages/backend/src/routes/simulateAgentSse.ts` (delete) | The sim writer — replaced by the serializer. |
| `packages/backend/src/routes/simulateAgentTypes.ts` (modify) | Delete `AgentSimulationEvent` union + its member interfaces + the RU3 temporary `simulation_state_patch`/`simulation_state_snapshot` members; KEEP `SimulateAgentRequest`/`SimulateAgentRequestSchema`. |
| `packages/backend/src/types.ts` (modify) | Delete the RU3 temporary `simulation_state_*`/`child_finished` members added to the workflow `SimulationEvent` union (whatever RU3 added); KEEP the rest until RU6 removes `SimulationEvent` entirely. |
| `packages/backend/src/runtime/executionEventBridge.ts` (delete) | RU3 throwaway `executionEventToSim` bridge. |
| `packages/backend/src/runtime/bridgeAgent.ts` (delete) | RU3 bridge helper (`agentEventToSim`). |
| `packages/backend/src/runtime/bridgeWorkflow.ts` (delete) | RU3 bridge helper (`workflowEventToSim`). |
| `packages/backend/src/runtime/__tests__/executionEventBridge.test.ts` (delete) | The bridge's test. |

---

### Task 1: `serializeExecutionEvent` serializer + unit tests

**Files:**
- Create: `packages/api/src/events/executionEventSse.ts`
- Create: `packages/api/src/events/__tests__/executionEventSse.test.ts`
- Modify: `packages/api/src/index.ts`

**Interfaces:**
- Consumes: `ExecutionEvent` from `./types.js` (RU3 Task 1 — the 14-member union, exact members in the test below).
- Produces: `export function serializeExecutionEvent(event: ExecutionEvent): string` returning `` `data: ${JSON.stringify(event)}\n\n` ``.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/events/__tests__/executionEventSse.test.ts
import { describe, expect, it } from '@jest/globals';

import { serializeExecutionEvent } from '../executionEventSse.js';
import type { ExecutionEvent } from '../types.js';

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
      { type: 'child_dispatched', childExecutionId: 'c', dispatchType: 'invoke_agent', task: 't', depth: 1 },
      { type: 'child_suspended', childExecutionId: 'c', depth: 1 },
      { type: 'child_awaiting_input', childExecutionId: 'c', partial: 'p', depth: 1 },
      {
        type: 'child_finished',
        childExecutionId: 'c',
        depth: 1,
        result: { status: 'finished', result: 'd', outcome: 'success' },
      },
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
 * The single serializer for the unified internal SSE vocabulary. Both the sim BE
 * handler and the prod BE serve step write `ExecutionEvent`s through this and only
 * this. The only internal/public boundary is the deliberate public projection
 * (decision B): at the public edge the BE first maps `ExecutionEvent ->
 * PublicExecutionEvent` (executionEventPublic.ts), then serializes that.
 *
 * Format: `data: <JSON.stringify(event)>\n\n`. The JSON carries the discriminating
 * `type` field, matching every consumer's `data: ` + `JSON.parse` parse.
 */
export function serializeExecutionEvent(event: ExecutionEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
```

Add to `packages/api/src/index.ts` (sorted with the other event/`executeTurn` exports RU3 added):

```ts
export { serializeExecutionEvent } from './events/executionEventSse.js';
export type { ExecutionEvent, Tokens } from './events/types.js';
```

> If RU3 already re-exports `ExecutionEvent`/`Tokens` from `index.ts`, add only the `serializeExecutionEvent` line.

- [ ] **Step 4: Run test to verify it passes** — `npm run test -w packages/api -- --testPathPattern=events/__tests__/executionEventSse` → PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/events/executionEventSse.ts packages/api/src/events/__tests__/executionEventSse.test.ts packages/api/src/index.ts
git commit -m "feat(api): single ExecutionEvent SSE serializer (data: <JSON>)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `ExecutionEvent → PublicExecutionEvent` projection (decision B) + relocate the public union

**Files:**
- Create: `packages/backend/src/routes/execute/executionEventPublic.ts`
- Create: `packages/backend/src/routes/execute/__tests__/executionEventPublic.test.ts`

**Interfaces:**
- Consumes: `ExecutionEvent` (from `@daviddh/llm-graph-runner`).
- Produces: the relocated `PublicExecutionEvent` union (moved verbatim from `executeTypes.ts` — finding #5) + `export function projectToPublic(ev: ExecutionEvent): PublicExecutionEvent[]`. One `ExecutionEvent` may project to **zero or more** public events (e.g. a `node_exited` with text + tokens → a `text` + a `tokenUsage`; `node_entered` → `node_visited`; `tool_call`/`tool_result` coalesce into `toolCall`). The projection MUST match the widget's vendored shape (`packages/widget/src/types/publicEvents.ts`).

> This is the ONLY deliberate internal→public boundary (decision B). It replaces the deleted per-runtime converter (`sendNodeProcessedEvent`'s `text`/`toolCall`/`tokenUsage`/`structuredOutput`/`nodeError` mapping in `executeHelpers.ts`) — reuse that mapping logic as the reference, but drive it off the `ExecutionEvent` union instead of `NodeProcessedEvent`. The terminal `finished` → the public `done` event (carrying the `AgentExecutionResponse`); the top-level `error` → public `error`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/execute/__tests__/executionEventPublic.test.ts
import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '@daviddh/llm-graph-runner';

import { projectToPublic } from '../executionEventPublic.js';

describe('projectToPublic (decision B)', () => {
  it('projects node_entered -> node_visited', () => {
    const out = projectToPublic({ type: 'node_entered', nodeId: 'n', depth: 0 });
    expect(out).toEqual([{ type: 'node_visited', nodeId: 'n' }]);
  });

  it('projects node_exited (text + tokens + structuredOutput) to text/tokenUsage/structuredOutput', () => {
    const out = projectToPublic({
      type: 'node_exited',
      nodeId: 'n',
      depth: 0,
      text: 'hi',
      tokens: { input: 1, output: 2, cached: 0, costUSD: 0.5 },
      durationMs: 10,
      structuredOutput: { nodeId: 'n', data: { a: 1 } },
    });
    expect(out).toContainEqual({ type: 'text', text: 'hi', nodeId: 'n' });
    expect(out).toContainEqual({
      type: 'tokenUsage',
      nodeId: 'n',
      inputTokens: 1,
      outputTokens: 2,
      cachedTokens: 0,
      cost: 0.5,
      durationMs: 10,
    });
    expect(out).toContainEqual({ type: 'structuredOutput', nodeId: 'n', data: { a: 1 } });
  });

  it('projects a tool_call to a public toolCall', () => {
    const out = projectToPublic({
      type: 'tool_call',
      toolName: 'create_event',
      toolCallId: 'i',
      args: { title: 'Sync' },
      depth: 0,
      isMcp: false,
    });
    expect(out).toEqual([
      { type: 'toolCall', nodeId: '', name: 'create_event', args: { title: 'Sync' }, result: undefined },
    ]);
  });

  it('projects node_error -> nodeError and top-level error -> error', () => {
    expect(projectToPublic({ type: 'node_error', nodeId: 'n', message: 'm', depth: 0 })).toEqual([
      { type: 'nodeError', nodeId: 'n', message: 'm' },
    ]);
    expect(projectToPublic({ type: 'error', code: 'x', message: 'boom' })).toEqual([
      { type: 'error', message: 'boom' },
    ]);
  });

  it('drops internal-only events (assistant_message text routes via node_exited; child_*, sim-state)', () => {
    expect(projectToPublic({ type: 'child_suspended', childExecutionId: 'c', depth: 1 })).toEqual([]);
    expect(projectToPublic({ type: 'simulation_state_snapshot', state: {} })).toEqual([]);
  });
});
```

> **Confirm the `assistant_message` vs `node_exited.text` decision against RU3's prod emitter** before finalizing: the widget renders streamed text from `text` events keyed by `nodeId` (`BlockCoalescer.pushText`). If RU4's Worker emits per-token `assistant_message` (no `nodeId`) rather than a single `node_exited.text`, project `assistant_message` → `{ type: 'text', text, nodeId: 'assistant' }` so the widget coalesces correctly. Pick the branch matching what RU4 actually publishes; this is the spec §10 "widget coupling" risk — verify, don't assume.

- [ ] **Step 2: Run test to verify it fails** — module not found.

- [ ] **Step 3: Write minimal implementation**

Move the `PublicExecutionEvent` union (and its member interfaces) verbatim out of `executeTypes.ts` into `executionEventPublic.ts` (keep `PublicDoneEvent`'s `response: AgentExecutionResponse` — import the response type from `./executeTypes.js`). Then:

```ts
// packages/backend/src/routes/execute/executionEventPublic.ts (projection core — split helpers to respect max-lines-per-function)
import type { ExecutionEvent } from '@daviddh/llm-graph-runner';

import type { AgentExecutionResponse } from './executeTypes.js';

// ... relocated PublicNodeVisitedEvent / PublicTextEvent / PublicToolCallEvent /
// PublicTokenUsageEvent / PublicStructuredOutputEvent / PublicNodeErrorEvent /
// PublicErrorEvent / PublicDoneEvent + the PublicExecutionEvent union ...

const ZERO = 0;

function projectNodeExited(ev: Extract<ExecutionEvent, { type: 'node_exited' }>): PublicExecutionEvent[] {
  const out: PublicExecutionEvent[] = [];
  if (ev.text !== undefined && ev.text !== '') out.push({ type: 'text', text: ev.text, nodeId: ev.nodeId });
  if (ev.tokens !== undefined) {
    out.push({
      type: 'tokenUsage',
      nodeId: ev.nodeId,
      inputTokens: ev.tokens.input,
      outputTokens: ev.tokens.output,
      cachedTokens: ev.tokens.cached,
      cost: ev.tokens.costUSD ?? ZERO,
      durationMs: ev.durationMs ?? ZERO,
    });
  }
  if (ev.structuredOutput !== undefined) {
    out.push({ type: 'structuredOutput', nodeId: ev.structuredOutput.nodeId, data: ev.structuredOutput.data });
  }
  return out;
}

export function projectToPublic(ev: ExecutionEvent): PublicExecutionEvent[] {
  switch (ev.type) {
    case 'node_entered':
      return [{ type: 'node_visited', nodeId: ev.nodeId }];
    case 'node_exited':
      return projectNodeExited(ev);
    case 'tool_call':
      return [{ type: 'toolCall', nodeId: '', name: ev.toolName, args: ev.args, result: undefined }];
    case 'node_error':
      return [{ type: 'nodeError', nodeId: ev.nodeId, message: ev.message }];
    case 'error':
      return [{ type: 'error', message: ev.message }];
    default:
      return projectTail(ev); // tool_result coalesce, finished -> done, assistant_message, dropped internals
  }
}
```

`projectTail` handles `finished` → `{ type: 'done', response }` (build the `AgentExecutionResponse` from `ev.result`/`ev.tokens`/`ev.structuredOutputs` — reuse `buildResponseByType`'s shape), `tool_result` (attach to the prior `toolCall` if you track open calls, else drop — the widget tolerates `result: undefined`), `assistant_message` per the §1 widget decision above, and returns `[]` for `tool_call` duplicates, `child_*`, `child_suspended`, `simulation_state_*`. Keep each helper ≤40 lines; split `projectTail` further if needed.

- [ ] **Step 4: Run test + golden-match the widget shape**

Run: `npm run test -w packages/backend -- --testPathPattern=execute/__tests__/executionEventPublic` then diff the projection's output union against `packages/widget/src/types/publicEvents.ts` member-by-member (manual — they must be field-identical). `npm run typecheck -w packages/backend`.
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/executionEventPublic.ts packages/backend/src/routes/execute/__tests__/executionEventPublic.test.ts
git commit -m "feat(backend): ExecutionEvent -> PublicExecutionEvent projection (decision B); relocate public union

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Prod durable SSE serve step (subscribe Redis + tail Postgres log + Last-Event-ID resume + heartbeats)

**Files:**
- Create: `packages/backend/src/routes/execute/executeServeSse.ts`
- Create: `packages/backend/src/routes/execute/__tests__/executeServeSse.test.ts`

**Interfaces:**
- Consumes: `subscribeToChannel`/`publishMessage` (`../../messaging/services/redisCloud.js`), `getEventsAfter` + the persisted-row type aliased `PersistedEventRow` (`../../db/queries/eventQueries.js` — finding #6), `resolveActiveLeaf` (RU4 `activeLeaf.ts`) + a `DurableQueries` instance, the Worker trigger (RU4 — `POST` to the Worker `fetch` with `{ mode: 'new_run' | 'human_resume', ... }`), `projectToPublic` (Task 2), `serializeExecutionEvent` is NOT used here — the public edge serializes `PublicExecutionEvent` (see below).
- Produces: `export async function serveDurableSse(args: ServeDurableSseArgs): Promise<void>` — the held SSE response loop. Writes **`id: <seq>\ndata: <JSON.stringify(publicEvent)>\n\n`** per projected public event; heartbeats `: ping\n\n` every ~20s; on `Last-Event-ID`/`?seq=` replays `getEventsAfter(supabase, executionId, lastSeq)` (projecting each `row.payload`) then subscribes Redis for live; ends on a terminal `finished`/`error` or response close.

> **Per finding #1**, the events on the wire here come from the **Redis subscription** (live) + the **Postgres log** (resume) — both carry the api `ExecutionEvent` (the Worker's published JSON / `row.payload`). At the public edge each is run through `projectToPublic` then JSON-serialized with an `id: <seq>` line. This is NOT the internal `serializeExecutionEvent` path (that is for the sim, which is internal). The widget/external-API see only `PublicExecutionEvent`.

> **Resume framing:** the FE already consumes `data:` lines (`sseReader.ts`); the `id:` line is additive (`EventSource`-style `Last-Event-ID`) and harmless to the widget's line parser (it only reads `data:` lines). On reconnect the FE sends `Last-Event-ID` (header) or `?seq=` (query); the BE replays the gap then re-subscribes. The Worker run is **triggered/resumed by the user message** (a `human_resume`/`new_run` POST), NOT by the SSE (re)connect — a reconnect only re-attaches to the stream (§4b.1).

- [ ] **Step 1: Write the failing test** (BE Jest, pure/unit — no live Redis/Worker)

```ts
// packages/backend/src/routes/execute/__tests__/executeServeSse.test.ts
import { describe, expect, it } from '@jest/globals';

import { framePublicEvent, replayFromLog } from '../executeServeSse.js';

describe('durable SSE serve framing + resume', () => {
  it('frames a projected public event with an id: <seq> line', () => {
    const line = framePublicEvent(7, { type: 'node_visited', nodeId: 'n' });
    expect(line).toBe('id: 7\ndata: {"type":"node_visited","nodeId":"n"}\n\n');
  });

  it('replays the Postgres gap after lastSeq, projecting each row payload', async () => {
    const rows = [
      { executionId: 'e', orgId: 'o', sequence: 3, eventType: 'node_entered', payload: { type: 'node_entered', nodeId: 'a', depth: 0 } },
      { executionId: 'e', orgId: 'o', sequence: 4, eventType: 'finished', payload: { type: 'finished', result: 'done' } },
    ];
    const written: string[] = [];
    await replayFromLog({
      getEventsAfter: async () => rows,
      supabase: {} as never,
      executionId: 'e',
      lastSeq: 2,
      write: (s: string) => written.push(s),
    });
    expect(written[0]).toContain('id: 3\n');
    expect(written.some((w) => w.includes('"type":"done"'))).toBe(true);
  });
});
```

> The held-response loop, Redis subscription, Worker trigger, and heartbeat timer are verified **manually** (spec §7) — a full Express+Redis integration test is out of scope (no automated harness). Keep the unit test on the pure pieces (`framePublicEvent`, `replayFromLog`) and gate the rest on `npm run typecheck`.

- [ ] **Step 2: Run test to verify it fails** — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/routes/execute/executeServeSse.ts
import type { Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ExecutionEvent as PersistedEventRow } from '../../db/queries/eventQueries.js';
import { getEventsAfter } from '../../db/queries/eventQueries.js';
import { subscribeToChannel } from '../../messaging/services/redisCloud.js';
import type { PublicExecutionEvent } from './executionEventPublic.js';
import { projectToPublic } from './executionEventPublic.js';

const HEARTBEAT_MS = 20_000;

export function framePublicEvent(seq: number, ev: PublicExecutionEvent): string {
  return `id: ${String(seq)}\ndata: ${JSON.stringify(ev)}\n\n`;
}

interface ReplayArgs {
  getEventsAfter: typeof getEventsAfter;
  supabase: SupabaseClient;
  executionId: string;
  lastSeq: number;
  write: (chunk: string) => void;
}

export async function replayFromLog(args: ReplayArgs): Promise<void> {
  const rows: PersistedEventRow[] = await args.getEventsAfter(args.supabase, args.executionId, args.lastSeq);
  for (const row of rows) {
    for (const pub of projectToPublic(row.payload as unknown as import('@daviddh/llm-graph-runner').ExecutionEvent)) {
      args.write(framePublicEvent(row.sequence, pub));
    }
  }
}
```

The exported `serveDurableSse(args)` orchestrates: `setSseHeaders(res)` → if `lastSeq` present, `await replayFromLog({ ...res.write })` → resolve+trigger the Worker run for this turn (RU4 `human_resume`/`new_run`) → `const unsubscribe = subscribeToChannel(executionId, onMessage)` where `onMessage(raw)` parses the published JSON (an api `ExecutionEvent` + its `seq`), projects it, writes `framePublicEvent(seq, pub)`, and ends the response on a terminal `finished`/`error` → a `setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)` heartbeat, cleared with `unsubscribe()` on `res.on('close')`/terminal. Resolve the active-leaf `executionId` via RU4's `resolveActiveLeaf(queries, conversationId)`. Split `serveDurableSse` into `startLiveSubscription` + `attachHeartbeat` + `resolveAndTrigger` helpers to stay under 40 lines each / `max-depth` 2.

> **Confirm the Worker publish envelope with RU4**: does `POST /internal/events/publish` republish each event to Redis as the bare api `ExecutionEvent` JSON, or wrapped `{ seq, event }`? `onMessage` must parse whatever RU4 publishes to recover both the `seq` (for the `id:` line / resume cursor) and the `ExecutionEvent` (for projection). If RU4 publishes the bare event without `seq`, fall back to the Postgres `sequence` (the serve step can track the last replayed `seq` and increment, or re-query) — implement against RU4's actual envelope and FLAG if it omits `seq`.

- [ ] **Step 4: Run test + typecheck** — `npm run test -w packages/backend -- --testPathPattern=execute/__tests__/executeServeSse` then `npm run typecheck -w packages/backend` → PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/executeServeSse.ts packages/backend/src/routes/execute/__tests__/executeServeSse.test.ts
git commit -m "feat(backend): durable prod SSE serve (Redis subscribe + Postgres gap-replay + id:<seq> + heartbeats)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire the prod execute handler + the unified sim handler to the serve step / serializer

**Files:**
- Modify: `packages/backend/src/routes/execute/executeHandler.ts`
- Modify: `packages/backend/src/routes/simulateHandlerUnified.ts`

**Interfaces:**
- Prod (`executeHandler.ts`): replace `handleStreaming`'s callback→`writePublicSSE` body with a call to `serveDurableSse(...)` (Task 3). Keep `handleNonStreaming` (JSON path) untouched. The terminal `done`/error now come from the projection inside the serve step (drop the `writePublicSSE({ type: 'done' })` + the `writePublicSSE({ type: 'error' })` in `handleExecutionError`'s streaming branch — the serve step emits the projected `done`/`error`).
- Sim (`simulateHandlerUnified.ts`): RU3's `runUnifiedSimulation` iterates `executeTurn(...).events`; change its per-event write from `executionEventToSim` + `writeSSE`/`writeAgentSSE` to `res.write(serializeExecutionEvent(ev))` (+ flush). Terminal = the runtime's `finished`; errors = the runtime's `error`. No more `simulation_complete`/`sendAgentError` legacy frames.

- [ ] **Step 1: Write the failing test** (thin contract smoke tests — handler streaming verified manually per §7)

```ts
// packages/backend/src/routes/execute/__tests__/handlerSerializerContract.test.ts
import { describe, expect, it } from '@jest/globals';

import { serializeExecutionEvent } from '@daviddh/llm-graph-runner';

describe('sim handler serializer contract', () => {
  it('emits child_awaiting_input (no legacy child_waiting) through the shared serializer', () => {
    const line = serializeExecutionEvent({
      type: 'child_awaiting_input',
      childExecutionId: 'c',
      partial: 'hold',
      depth: 1,
    });
    expect(line).toContain('"type":"child_awaiting_input"');
    expect(line).not.toContain('child_waiting');
  });
});
```

- [ ] **Step 2: Run test** — PASS once Task 1 is built; the handler edits are gated by `npm run typecheck -w packages/backend`.

- [ ] **Step 3: Write minimal implementation**

`executeHandler.ts` — replace `handleStreaming`:

```ts
async function handleStreaming(parsed: ParsedInput, res: Response): Promise<void> {
  await serveDurableSse({
    supabase: parsed.supabase,
    orgId: parsed.orgId,
    agentId: parsed.agentId,
    version: parsed.version,
    input: parsed.input,
    res,
    lastSeq: parseLastEventId(res.req),
  });
}
```

Add `parseLastEventId(req)` (reads the `Last-Event-ID` header or `?seq=` query; default `-1`). Remove the `ExecuteCoreCallbacks` block, the `executeAgentCore(..., callbacks)` streaming call, and the `buildResponseByType` + `writePublicSSE({ type: 'done' })`. In `handleExecutionError`'s `res.headersSent` branch, the serve step already emits the projected `error`; drop the `writePublicSSE({ type: 'error', message })` line (the durable serve owns terminal framing). Drop the now-unused `sendNodeProcessedEvent`/`sendNodeVisitedEvent`/`writePublicSSE` imports (deleted in Task 7).

`simulateHandlerUnified.ts` (RU3) — the event-write loop:

```ts
import { serializeExecutionEvent } from '@daviddh/llm-graph-runner';
// ...
for await (const ev of output.events) {
  res.write(serializeExecutionEvent(ev));
  flushIfPossible(res);
}
```

Delete the `executionEventToSim`/`bridgeAgent`/`bridgeWorkflow` import + call and the `writeSSE`/`writeAgentSSE`/`simulation_complete` frames. (`flushIfPossible` = the existing flush guard from `simulate.ts`/`executeHelpers.ts` — reuse one.)

- [ ] **Step 4: Run test + typecheck** — `npm run test -w packages/backend -- --testPathPattern=execute/__tests__/handlerSerializerContract` then `npm run typecheck -w packages/backend`. (The `simulateAgentSse`/bridge symbols are now unreferenced; they are deleted in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/executeHandler.ts packages/backend/src/routes/simulateHandlerUnified.ts packages/backend/src/routes/execute/__tests__/handlerSerializerContract.test.ts
git commit -m "feat(backend): prod handler -> durable serve; unified sim handler emits ExecutionEvent via serializer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Migrate the sim consumers (`api.ts` reducer + collapse the two FE stream fns) to `ExecutionEvent`

**Files:**
- Modify: `packages/web/app/lib/api.ts`
- Modify: `packages/web/app/lib/agentSimulationApi.ts`
- Modify: `packages/web/app/lib/sseSimComposition.ts`
- Modify: `packages/web/app/hooks/compositionMachine.ts`
- Modify: `packages/web/app/hooks/simulationSendHelpers.ts`
- Modify: `packages/web/app/hooks/useSimulationSend.ts`

**Interfaces:**
- `api.ts`: re-key `dispatchSseEvent` onto `ExecutionEvent` strings — `node_exited`→`onNodeProcessed`, `assistant_message`→`onNodeProcessed`(synthetic node), `tool_call`/`tool_result`→fold into the open node's tool calls, `child_*`/`simulation_state_*`→`dispatchSimCompositionEvent` (sseSimComposition), `finished`→`onComplete`, `error`→`onError`. Per finding #3 BOTH sim engines now emit `ExecutionEvent`, so the legacy `node_visited`/`node_processed`/`step_*`/`agent_response`/`child_completed`/`simulation_complete` branches are **removed** (not retained). Add the `ExecutionEvent` fields to `SseEventSchema` (`toolName`, `toolCallId`, `args`, `result`, `isMcp`, `childExecutionId`, `partial`, `code`, the `ChildResult` `result` object, `state`, `tool`, `path`, `value`, `dispatchType`); drop the obsolete optional fields once unreferenced. Collapse `streamSimulation` into a single exported `streamSimulate(params, callbacks, signal)` (body already carries `appType`; proxy routes).
- `agentSimulationApi.ts`: delete `streamAgentSimulation`; keep `AgentSimulateRequestBody`/`CompositionStackEntry` (used to build the agent request body).
- `sseSimComposition.ts`: `child_waiting`→`child_awaiting_input` (read `partial`), `child_finished` reads `result: ChildResult` (`output = result.status === 'finished' ? result.result : ''`; `status = result.outcome ?? (result.status === 'error' ? 'error' : 'success')`); `child_dispatched` reads `childExecutionId`/`dispatchType`/`task`/`depth`; add `onSimulationStatePatch`/`onSimulationStateSnapshot` (forwarded to RU3's sim-state store — **confirm the store symbol**, finding flag below).
- `compositionMachine.ts`: rename the `'child_waiting'` `CompositionPhase` literal → `'child_awaiting_input'`.
- `simulationSendHelpers.ts`: `onSimChildWaiting`→`onSimChildAwaitingInput`; add the two sim-state callbacks; both `sendAgentSim`/`sendWorkflowSim` call `streamSimulate`.
- `useSimulationSend.ts`: update any `'child_waiting'` literal reference (verify — currently none).

> **FLAG (sim-state store symbol):** the spec says sim-state events route to "RU3's sim-state store (`useSimulationState.adoptSnapshot`)". The real `packages/web/app/hooks/useSimulationState.ts` is the simulation hook-state container; it does NOT currently expose `adoptSnapshot`. RU3 is expected to add the sim-state store + `adoptSnapshot`/`applyPatch`. If RU3 lands it under a different symbol/module, wire `onSimulationStateSnapshot`/`onSimulationStatePatch` to that real symbol and FLAG the rename. If RU3 has NOT added a sim-state store, surface the snapshot/patch through a new local setter and FLAG that the dedicated store is missing (do not invent a store).

- [ ] **Step 1: Write the failing tests** (web Jest config)

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
  it('maps node_exited -> onNodeProcessed and finished -> onComplete', async () => {
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

  it('maps error -> onError', async () => {
    const errs: string[] = [];
    await readSseStream(streamOf([JSON.stringify({ type: 'error', code: 'x', message: 'boom' })]), {
      onError: (m) => errs.push(m),
    });
    expect(errs).toEqual(['boom']);
  });
});
```

```ts
// packages/web/app/lib/__tests__/sseSimComposition.test.ts
import { describe, expect, it } from '@jest/globals';

import { dispatchSimCompositionEvent } from '../sseSimComposition';
import type { SimCompositionCallbacks } from '../sseSimComposition';

describe('dispatchSimCompositionEvent (ExecutionEvent)', () => {
  it('maps child_finished (ChildResult) -> onSimChildFinished', () => {
    let out: { output: string; status: string } | null = null;
    const handled = dispatchSimCompositionEvent(
      { type: 'child_finished', childExecutionId: 'c', depth: 1, result: { status: 'finished', result: 'done', outcome: 'success' } },
      { onSimChildFinished: (e) => (out = { output: e.output, status: e.status }) }
    );
    expect(handled).toBe(true);
    expect(out).toEqual({ output: 'done', status: 'success' });
  });

  it('maps child_awaiting_input -> onSimChildAwaitingInput', () => {
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

- [ ] **Step 2: Run tests to verify they fail** — `npm run test -w packages/web -- --testPathPattern='__tests__/(apiExecutionEvent|sseSimComposition)'` → FAIL (old keys).

- [ ] **Step 3: Write minimal implementation**

`api.ts` `dispatchSseEvent`:

```ts
function dispatchSseEvent(event: SseEvent, callbacks: StreamCallbacks): void {
  if (dispatchSimCompositionEvent(event, callbacks)) return; // child_* + simulation_state_*
  if (event.type === 'node_exited') {
    handleNodeExited(event, callbacks);
  } else if (event.type === 'assistant_message') {
    handleAssistantMessage(event, callbacks);
  } else if (event.type === 'tool_call' || event.type === 'tool_result') {
    handleToolEvent(event, callbacks);
  } else if (event.type === 'finished') {
    callbacks.onComplete?.();
  } else if (event.type === 'error' && event.message !== undefined) {
    callbacks.onError?.(event.message);
  }
}
```

`handleNodeExited` maps `{ nodeId, text, tokens, durationMs, reasoning, structuredOutput }` → `onNodeProcessed({ nodeId, text: text ?? '', tokens: tokens ?? { input: 0, output: 0, cached: 0 }, durationMs, reasoning, structuredOutput, toolCalls: <accumulated>, output: undefined })`. `handleAssistantMessage` routes streamed text to `onNodeProcessed` with a synthetic node id (match the old `step_processed` `step-N` behavior). `handleToolEvent` accumulates into the open node's `toolCalls` so nothing falls through (if RU3's emitter already folds tool calls into `node_exited`, these can be no-ops — verify). Update `SseEventSchema` per the Interfaces list; remove the obsolete `step`/`responseText`/`totalSteps`/`childAppType`/`parentExecutionId` fields once unreferenced. Replace `streamSimulation` with `export async function streamSimulate(params, callbacks, signal)` (identical body, generic `params` typed as the union of the workflow + agent request bodies). Delete `streamAgentSimulation` from `agentSimulationApi.ts`. In `simulationSendHelpers.ts` point both senders at `streamSimulate`, rename `onSimChildWaiting`→`onSimChildAwaitingInput`, add `onSimulationStateSnapshot`/`onSimulationStatePatch`. In `compositionMachine.ts` rename the phase literal. `sseSimComposition.ts` per Task interfaces (re-key the three child handlers + add two sim-state handlers; update `CompositionSseEvent`/`SimCompositionSchemaFields` with `childExecutionId`/`partial`/`result`(ChildResult)/`state`/`tool`/`path`/`value`/`dispatchType`).

- [ ] **Step 4: Run tests + typecheck** — `npm run test -w packages/web -- --testPathPattern='__tests__/(apiExecutionEvent|sseSimComposition)'` then `npm run typecheck -w packages/web` → PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/api.ts packages/web/app/lib/agentSimulationApi.ts packages/web/app/lib/sseSimComposition.ts packages/web/app/hooks/compositionMachine.ts packages/web/app/hooks/simulationSendHelpers.ts packages/web/app/hooks/useSimulationSend.ts packages/web/app/lib/__tests__/apiExecutionEvent.test.ts packages/web/app/lib/__tests__/sseSimComposition.test.ts
git commit -m "feat(web): migrate sim consumers to ExecutionEvent; collapse the two stream fns; sim-state first-class

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Verify the widget renders unchanged against the new projection (NO widget source rewrite)

**Files:**
- (no widget source changes — decision B keeps the widget untouched on the wire)
- Optional: `packages/widget/src/api/__tests__/projectionParity.test.ts` (Vitest) — a parity guard.

**Interfaces:**
- Consumes: the BE projection's output (Task 2) and the widget's vendored `PublicExecutionEvent` (`packages/widget/src/types/publicEvents.ts`).
- Produces: confidence that `projectToPublic` emits exactly the widget's member shapes (`node_visited`/`text`/`toolCall`/`tokenUsage`/`structuredOutput`/`nodeError`/`error`/`done`) so `sseReader.ts`/`eventToBlock.ts`/`useChatStream.ts` keep working with zero source edits.

> Per finding #2 the widget is a separate transport with no `@daviddh/*` dep. RU5 does NOT rewrite it. This task is the spec §10 "widget coupling" verification.

- [ ] **Step 1: Parity check (Vitest, optional but recommended)**

Add a Vitest test in the widget that feeds a representative `data:` line set (matching `projectToPublic`'s output) through `readSseStream` + `BlockCoalescer` and asserts the blocks render (mirroring the existing `sseReader.test.ts` style). This does NOT import the BE projection (no cross-package dep) — it hard-codes the public lines the projection is contracted to emit, keeping the widget's parser as the source of truth.

```ts
// packages/widget/src/api/__tests__/projectionParity.test.ts
import { describe, expect, it } from 'vitest';

import { BlockCoalescer } from '../eventToBlock.js';

describe('widget renders the BE projection output unchanged', () => {
  it('coalesces text + renders a toolCall + done terminal', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'text', text: 'hello', nodeId: 'n' });
    c.push({ type: 'toolCall', nodeId: 'n', name: 'create_event', args: { title: 'Sync' }, result: undefined });
    const blocks = c.finalize();
    expect(blocks.some((b) => b.type === 'text' && b.content === 'hello')).toBe(true);
    expect(blocks.some((b) => b.type === 'action' && b.title === 'Sync')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the widget suite + typecheck (NO source edits)**

Run: `npm run test -w packages/widget` then `npm run typecheck -w packages/widget`
Expected: PASS / clean — the widget compiles and parses the projection output without changes. If anything fails, the projection (Task 2) is wrong — fix the projection, NOT the widget.

- [ ] **Step 3: Manual render check (spec §7)** — drive the live widget against the prod execute endpoint and confirm streamed text, tool-call actions, `nodeError` alerts, and the `done` terminal render exactly as before. This is the public-boundary safety check.

- [ ] **Step 4: Commit (only if the optional parity test was added)**

```bash
git add packages/widget/src/api/__tests__/projectionParity.test.ts
git commit -m "test(widget): parity guard — widget renders the BE ExecutionEvent->Public projection unchanged

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Delete the internal converter, `simulateAgentSse`, `AgentSimulationEvent`, the RU3 bridge; relocate-confirm `PublicExecutionEvent`

**Files:**
- Modify: `packages/backend/src/routes/execute/executeTypes.ts` (delete `InternalExecutionEvent`+members; the `PublicExecutionEvent` union is now in `executionEventPublic.ts` (Task 2) — remove it here; keep response types + request schema)
- Modify: `packages/backend/src/routes/execute/executeHelpers.ts` (delete `writePublicSSE`/`sendNodeVisitedEvent`/`sendNodeProcessedEvent` + the now-unused `PublicExecutionEvent`/`NodeProcessedEvent` imports; keep the rest)
- Delete: `packages/backend/src/routes/simulateAgentSse.ts`
- Modify: `packages/backend/src/routes/simulateAgentTypes.ts` (delete `AgentSimulationEvent` + member interfaces + the RU3 temporary `simulation_state_patch`/`simulation_state_snapshot` members; keep `SimulateAgentRequest`/`SimulateAgentRequestSchema`)
- Modify: `packages/backend/src/types.ts` (delete the RU3 temporary `simulation_state_*`/`child_finished` members from the workflow `SimulationEvent` union; KEEP the rest of `SimulationEvent` — RU6 deletes it whole)
- Delete: `packages/backend/src/runtime/executionEventBridge.ts`
- Delete: `packages/backend/src/runtime/bridgeAgent.ts`
- Delete: `packages/backend/src/runtime/bridgeWorkflow.ts`
- Delete: `packages/backend/src/runtime/__tests__/executionEventBridge.test.ts`

**Interfaces:**
- Removes now-unreferenced code (Tasks 2/4 stopped referencing it). The only internal SSE writer left is `serializeExecutionEvent`; the only public writer is the projection in the serve step. The RU3 emitter-completeness assertion (`packages/api/src/events/__tests__/emitterCompleteness.test.ts`) is RETAINED — do not touch it.

> **RU6 boundary (do NOT delete here):** the legacy workflow engine internals, `simulationOrchestrator.ts`, the legacy `simulateHandler.ts`/`simulateAgentHandler.ts` shims, `simulate.ts`'s remaining `writeSSE`/`SimulationEvent` (the non-temporary members), `executeAgentCore`/`executeCore*.ts`, and the Supabase edge runtime are all **RU6** deletions. `PublicExecutionEvent` is KEPT (decision B). RU5 deletes only the SSE shapes/writers/bridge it directly replaced.

- [ ] **Step 1: Prove the legacy code is unreferenced**

Run: `cd packages/backend && grep -rn "writePublicSSE\|sendNodeVisitedEvent\|sendNodeProcessedEvent\|AgentSimulationEvent\|writeAgentSSE\|executionEventToSim\|agentEventToSim\|workflowEventToSim\|InternalExecutionEvent\|simulateAgentSse" src --include="*.ts" | grep -v __tests__`
Expected: only the DEFINITIONS (in the files being deleted/edited) — NO live callers in `executeHandler.ts`/`simulateHandlerUnified.ts`. If a caller remains, finish Tasks 2/4 first.

- [ ] **Step 2: Delete + edit**

- `git rm packages/backend/src/routes/simulateAgentSse.ts packages/backend/src/runtime/executionEventBridge.ts packages/backend/src/runtime/bridgeAgent.ts packages/backend/src/runtime/bridgeWorkflow.ts packages/backend/src/runtime/__tests__/executionEventBridge.test.ts`
- `executeTypes.ts`: delete the `/* Internal SSE events */` block (`InternalNodeVisitedEvent`/`InternalNodeProcessedEvent`/`InternalAgentResponseEvent`/`InternalErrorEvent`/`InternalCompleteEvent` + `InternalExecutionEvent`) and the `/* Public SSE events */` block (now relocated to `executionEventPublic.ts` in Task 2). KEEP `ToolCallRecord`/`TokenUsage`/`WorkflowExecutionResponse`/`AgentAppResponse`/`AgentExecutionResponse` + `AgentExecutionInputSchema`/`AgentExecutionInput`.
- `executeHelpers.ts`: delete `writePublicSSE`, `sendNodeVisitedEvent`, `sendNodeProcessedEvent` + the `PublicExecutionEvent`/`NodeProcessedEvent` imports + the `Flushable`/`hasFlushMethod`/`writePublicSSE` flush block if now unused (keep a flush helper if the serve step imports it). KEEP `setSseHeaders`, `buildUserMessage`, `resolveServerTransport`/`resolveMcpTransportVariables`, `sumTokens`/`sumTotalCost`, `resolveOAuthForExecution`, `logExec`, `extractTextFromInput`.
- `simulateAgentTypes.ts`: delete `AgentStepStartedEvent`/`AgentStepProcessedEvent`/`AgentToolExecutedEvent`/`AgentResponseEvent`/`AgentSimulationErrorEvent`/`AgentSimulationCompleteEvent`/`ChildDispatchedEvent`/`ChildFinishedEvent`/`ChildWaitingEvent` + the `AgentSimulationEvent` union + the RU3 temporary `simulation_state_patch`/`simulation_state_snapshot` members. KEEP all request-schema code.
- `types.ts`: remove the RU3 temporary `simulation_state_*`/`child_finished` union members from `SimulationEvent` (whatever RU3 added). KEEP the legacy `node_visited`/`node_processed`/`agent_response`/`error`/`simulation_complete`/`child_dispatched` members (RU6 deletes `SimulationEvent` whole once the legacy workflow writer is gone).

- [ ] **Step 3: Run the gate** — `npm run typecheck -w packages/backend && npm run lint -w packages/backend` → clean.

- [ ] **Step 4: Verify the retained assertion still runs** — `npm run test -w packages/api -- --testPathPattern=events/__tests__/emitterCompleteness` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/executeTypes.ts packages/backend/src/routes/execute/executeHelpers.ts packages/backend/src/routes/simulateAgentTypes.ts packages/backend/src/types.ts
git rm packages/backend/src/routes/simulateAgentSse.ts packages/backend/src/runtime/executionEventBridge.ts packages/backend/src/runtime/bridgeAgent.ts packages/backend/src/runtime/bridgeWorkflow.ts packages/backend/src/runtime/__tests__/executionEventBridge.test.ts
git commit -m "refactor(backend): delete internal SSE shapes + converter + simulateAgentSse + AgentSimulationEvent + RU3 bridge (keep PublicExecutionEvent)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full gate + light per-consumer reducer sweeps + manual verification checklist

**Files:**
- (no new source) — augment the consumer reducer tests with a "no fall-through" sweep, then run the full gate.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green `npm run check`; a documented manual cross-consumer verification checklist (spec §7) to run before RU6.

- [ ] **Step 1: Add a "no fall-through" sweep to each consumer reducer test**

In `apiExecutionEvent.test.ts` (web) and `sseSimComposition.test.ts` (web), add one test pushing EVERY `ExecutionEvent` variant (the 14-member list from Task 1) through the reducer and asserting no throw + each is handled or explicitly ignored (`return false`/`default`). For the projection, add the same sweep to `executionEventPublic.test.ts` (every variant → an array, never a throw). This is the spec §8 "light, not a full render harness" check.

```ts
// pattern (web sseSimComposition): every type returns boolean, never throws
const ALL: CompositionSseEvent[] = [ /* all 14 ExecutionEvent variants */ ];
it('handles every ExecutionEvent type without throwing', () => {
  for (const ev of ALL) expect(() => dispatchSimCompositionEvent(ev, {})).not.toThrow();
});
```

- [ ] **Step 2: Run each package's suite** — `npm run test -w packages/api`, `npm run test -w packages/backend`, `npm run test -w packages/web`, `npm run test -w packages/widget` → all PASS.

- [ ] **Step 3: Full gate** — `npm run check` → format + lint + typecheck clean across all packages.

- [ ] **Step 4: Record + run the manual cross-consumer verification checklist (spec §7) — DO NOT skip; precedes RU6**

Verify manually (no automated harness) against the live surfaces:
- **Sim (agent + workflow, one `streamSimulate` call, BE-routed by `appType`):** per-node tokens, durations, reasoning, structured output, per-node `node_error`, `child_dispatched`/`child_finished`/`child_awaiting_input` nesting with correct `depth`, sim-state (`simulation_state_patch` preview + `simulation_state_snapshot` adoption).
- **Prod durable SSE (external API + widget):** stream a multi-turn durable run; confirm the widget renders `text`/`toolCall`/`nodeError`/`done` unchanged; kill+reconnect the FE mid-stream and confirm the gap replays from Postgres (`getEventsAfter`) and the message re-renders complete; confirm heartbeats keep a slow-tool gap alive; (optional) restart the serving BE instance mid-run and confirm a healthy instance resumes via the log.
Fix regressions as found. The hard cutover has no fallback — this manual pass is the safety step before RU6 deletes the legacy orchestrators/edge runtime.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/__tests__/apiExecutionEvent.test.ts packages/web/app/lib/__tests__/sseSimComposition.test.ts packages/backend/src/routes/execute/__tests__/executionEventPublic.test.ts
git commit -m "test(ru5): per-consumer + projection no-fall-through sweeps; full gate green

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

Spec §1–§10 + §4b → task mapping:

- **§1 Intent (one internal `ExecutionEvent` + one serializer; curated `PublicExecutionEvent` at the public edge via one projection; single sim API + single prod API BE-routed by type; delete the per-runtime converter, NOT the public shape)** → Task 1 (serializer), Task 2 (projection + keep public union), Tasks 4/5 (handlers + FE collapse), Task 7 (delete converter, keep `PublicExecutionEvent`).
- **§2 Scope (serializer; decision-B projection; single sim+prod API; migrate sim-agent + sim-workflow internal consumers; delete legacy shapes + converter + RU3 bridge. Out: emitter (RU3/RU4), automated harness, RU6 deletions)** → Task 1, Task 2, Task 5 (collapse two FE fns; both sim engines emit `ExecutionEvent` — finding #3), Task 7 (only the SSE-shape/writer/bridge code). No automated harness (Task 8 = manual checklist). Emitter NOT built here (finding #1).
- **§3 Three vocabularies → one (RU3 superset, old strings replaced not aliased)** → Tasks 4/5 full rename; Task 7 deletes the old strings. (FLAG finding #3: RU3 migrated the workflow engine, so no legacy `node_*` retention — unlike the obsolete earlier draft.)
- **§4 The serializer (`data: <JSON>\n\n`, both runtimes; the ONLY internal/public boundary is the projection)** → Task 1 + Task 4 (sim serializes `ExecutionEvent`; prod public edge serializes the *projected* `PublicExecutionEvent` — Task 3).
- **§4b Durable SSE delivery (BE-only client boundary; serve = subscribe Redis Cloud `execution_id` + trigger Worker + write `id:<seq>\ndata:`; resume = replay Postgres gap via `getEventsAfter` then re-subscribe; serializer reads from Redis/log not a Worker pipe)** → **Task 3** (`executeServeSse.ts`) + Task 4 (wires `handleStreaming`). Reuses `subscribeToChannel`/`publishMessage` + `getEventsAfter` + RU4's `resolveActiveLeaf`/Worker trigger (findings #6/#8). FLAG #1: `executeAgentCore` stays callback-shaped; the durable serve reads the Worker's published events, not the in-process callback stream.
- **§4b.1 Liveness + failover (trigger vs attach; heartbeats `: ping`; any instance serves, no sticky routing; gap-replay from Postgres; only the live typing animation is lost, re-rendered complete)** → Task 3 (heartbeat timer; reconnect → `replayFromLog` → re-subscribe; message trigger ≠ SSE attach) + Task 8 Step 4 (manual reconnect/failover verification).
- **§5 Consumer migrations: sim-agent + sim-workflow → `ExecutionEvent` (sim-state first-class, no RU3 bridge); two FE stream fns collapse; BE routes by type. Public boundary NOT rewritten to `ExecutionEvent` — widget keeps vendored `PublicExecutionEvent`, fed by the new projection** → Task 5 (sim consumers + collapse), Task 6 (widget untouched, projection-fed, verified). (FLAG #2: widget is a separate transport, kept; FLAG sim-state store symbol in Task 5.)
- **§6 Deletions (internal shapes + internal→public converter — KEEP & RELOCATE `PublicExecutionEvent`; `AgentSimulationEvent` + `simulateAgentSse`; RU3 bridge + temp sim-state members + test; any `ssePublicAdapter`/`sseSimulationAdapter`)** → Task 2 (relocate public union), Task 7 (delete the rest). No `ssePublicAdapter`/`sseSimulationAdapter` exist in-tree — none to delete.
- **§7 Verification (manual, no harness; RU3 emitter-completeness retained)** → Task 6 Step 3 + Task 8 Step 4 checklist; Task 7 Step 4 keeps the assertion.
- **§8 Tests (serializer unit; light consumer + projection reducer sweeps; retained assertion; `npm run check`)** → Task 1 (serializer), Task 2 (projection), Tasks 5/8 (light sweeps), Task 7 (assertion retained), Task 8 (`npm run check`).
- **§9 Affected paths** → covered by the File Structure table (note: `api.ts` is the **sim-workflow** consumer per finding #3; the prod consumer is the external API + widget).
- **§10 Risks (hard cutover no fallback; widget coupling; serializer location; ordering vs RU6)** → finding #2 (widget separate transport, kept — Task 6 verifies), finding #1 (serializer in `packages/api/src/events`, importable by both; prod reads Worker-published events), finding #5/#6/RU6 boundary in Task 7 (RU6 owns the legacy orchestrators/edge runtime; `PublicExecutionEvent` kept).

**Manual cross-consumer + durable-resume verification (spec §7/§4b.1) precedes RU6:** Task 8 Step 4 is the gate before any RU6 deletion — there is no automated per-consumer render harness and no fallback path once RU6 removes the edge runtime.

**Cross-RU dependencies (FLAGGED — reconcile at impl time if the upstream RU lands differently):**
- RU3 must land: the `ExecutionEvent` union (14 members, names confirmed), `executeTurn` returning `{ events: AsyncIterable<ExecutionEvent> }`, `runUnifiedSimulation` (`simulateHandlerUnified.ts`) with the **workflow engine migrated** onto the core, the `executionEventBridge.ts`/`bridgeAgent.ts`/`bridgeWorkflow.ts` bridge + test, the temporary sim-state members in `simulateAgentTypes.ts` + `types.ts` `SimulationEvent`, the emitter-completeness assertion, and a sim-state store (`adoptSnapshot`/`applyPatch` — Task 5 FLAG if the symbol differs).
- RU4 must land: the Worker publishing `ExecutionEvent`s to Redis Cloud (channel `execution_id`) via `POST /internal/events/publish`, per-step Postgres persistence with monotonic `sequence` (`next_execution_event_seq`), `resolveActiveLeaf(queries, conversationId)`, and the Worker trigger (`mode: new_run | human_resume | reinvoke`). The serializer/serve location must stay free of Node-only/Workers-only deps (it is — `packages/api/src/events` for the serializer; the serve step is BE-only and may use Express/ioredis/Supabase).
