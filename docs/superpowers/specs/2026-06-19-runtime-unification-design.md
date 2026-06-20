# Runtime unification — design

**Date:** 2026-06-19
**Branch context:** `feat/data-tools`
**Status:** Design approved; pending implementation plan.

## 1. Context

The repository runs the agent state machine in **two execution runtimes**:

- **Production:** Supabase edge function (`supabase/functions/execute-agent`, `execute-tool`) running on Deno
- **Simulation:** Node Express backend (`packages/backend/src/routes/simulate*`) — the live preview path used by the graph editor

A prior audit (recorded in conversation) identified **11 duplication points** between the two runtimes — some cosmetic, others load-bearing — plus two architectural surprises (dead code, an orphan abstraction). The visible duplication (orchestration + factory implementations) was confirmed; the load-bearing drift was found in items the audit hadn't initially highlighted, especially in MCP connection lifecycle and child-dispatch semantics.

This refactor unifies the two runtimes into **one runtime core in the api package**, with two thin entry-point drivers that adapt request shape, auth, and transport. All 11 audit findings are addressed in a single refactor.

## 2. Goals

- Eliminate parallel implementations of the orchestrator and the five builtin service factories (KV / RAG / Calendar / Forms / Lead Scoring).
- Establish one canonical SSE event vocabulary.
- Move MCP connection lifecycle into a backend-owned connection pool callable from both runtimes; eliminate the simulation-side eager-connect code path and the production-side embedded connection logic.
- Establish a clean simulation/production discriminator (`environment`) on `ProviderCtx` that tools branch on locally; the orchestrator never branches.
- Make OAuth resolution lazy (pull) with pre-flight checks at the two moments a user can actually act on failure (publish, first message of a simulation session).
- Provide a simulation state model that is FE-owned, JSON-typed, and propagated through the runtime as opaque data.
- Wire forms and lead-scoring tools into simulation (currently silently absent).
- Delete dead code identified by the audit.
- Make all of this architecturally additive when async sub-agent invocation eventually becomes a need — no runtime-core changes required for that future work.

## 3. Out of scope

- **Per-tool simulation semantics.** Every builtin tool gets a single early-return `if (ctx.environment === 'simulation')` returning a synthetic response with a `TODO`. Tools that need to read/write simulation state get their real implementations in follow-up PRs.
- **True async sub-agent invocation** (parent continues while child runs). The runtime contracts are typed to accommodate it; the implementation is deferred.
- **Cross-instance / multi-backend connection pooling** for MCP. Today's assumption is a single backend instance; if scaled horizontally, each instance maintains its own pool. Documented; not architectural blocker.
- **Migration of the FE Supabase auth flows** — auth boundary remains as-is.
- **Refactoring `simulationServicesResolver.ts`'s downstream callers** beyond what's required to consume the shared factories.

## 4. Audit baseline

The 11 duplication points the audit found, indexed for traceability throughout this spec:

| # | Concern | Notes |
|---|---|---|
| 1 | KV regex strategy | Simulation: 10k JS fetch + RE2; Production: Postgres `~`. **Silent drift.** |
| 2 | Forms + lead_scoring availability | Simulation: returns `undefined`; Production: full impls. **Silently absent in simulation.** |
| 3 | Child-dispatch loop | Two implementations; **finish-sentinel semantics already drifting.** |
| 4 | MCP connection lifecycle | Simulation: eager + header-auth-only; Production: lazy + OAuth-pushed. **Sim skips OAuth refresh entirely.** |
| 5 | Bundle preparers / ProviderCtx / Registry build | Parallel implementations. |
| 6 | Builtin factory impls (KV / RAG / Calendar / Forms / LS) | Parallel implementations; KV regex divergent; forms/LS missing in sim. |
| 7 | SSE event vocabulary + writers | Three distinct writers and shapes; FE consumers tuned to specific ones. |
| 8 | OAuth access pattern (calendar) | Push (production) vs pull (simulation). |
| 9 | MCP OAuth bundle resolution | **Missing entirely in simulation.** |
| 10 | Service-role Supabase client constructor | Verbatim duplication; env-source differs. |
| 11 | Runner logger | Verbatim duplication. |

**Surprises:**

- `routes/execute/executeAgentPath.ts` is **dead code** (zero callers anywhere). Marked for deletion.
- The api package's MCP `composeRegistry` is **used by both paths for registry composition** but not for connection itself — connection logic lives in `buildAgentToolsAtStart` (production) and `createMcpSession` (simulation). The unification makes `composeRegistry` the canonical connection composition point.

## 5. Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              packages/api                                     │
│                                                                               │
│   executeAgent(input, capabilities)        ← single runtime entry             │
│       ├── state machine + executeTurn                                         │
│       ├── tool resolution + dispatch                                          │
│       ├── childDispatch (sync recursion + capability-injected persistence)    │
│       ├── ExecutionEvent emitter (AsyncIterable)                              │
│       └── ProviderCtx (environment-discriminated)                             │
│                                                                               │
│   Capabilities (interfaces only — runtimes inject implementations)            │
└────────────┬────────────────────────────────────────────────┬─────────────────┘
             │                                                  │
   ┌─────────▼──────────┐                            ┌──────────▼──────────┐
   │  Production driver │                            │ Simulation driver   │
   │  (Edge function)   │                            │ (Node Express)      │
   │                    │                            │                     │
   │  • Real persistence│                            │  • No-op persistence│
   │  • Real OAuth      │  Both inject identical     │  • Real OAuth       │
   │  • Real MCP pool   │   OAuth + MCP pool         │  • Real MCP pool    │
   │  • Real rateLimit  │  (via backend endpoints)   │  • No-op rateLimit  │
   │  • Structured log  │                            │  • Console log      │
   └─────────┬──────────┘                            └──────────┬──────────┘
             │                                                   │
             └────────────────────────┬──────────────────────────┘
                                      │ HTTP /internal/*
                              ┌───────▼────────┐
                              │ Backend Node   │
                              │                │
                              │ • OAuth resolver
                              │ • MCP conn pool
                              │ • Vertex embed │
                              │ • RE2 validate │
                              └────────────────┘
```

Both runtimes call into the backend for OAuth resolution and MCP tool invocation. Backend owns the stateful machinery (OAuth grants in DB, MCP connection pool in memory). The runtime core stays oblivious to where state lives.

## 6. Runtime contracts

### 6.1 `RuntimeInput`

```ts
interface RuntimeBase {
  orgId: string;
  tenantId: string;
  userId: string;
  graph: AgentGraph;
  selectedTools: ToolRef[];
  storeBindings: StoreBindings;
  mcpServers: McpServerConfig[];
  oauthResolvers: OAuthResolvers;
  message: ChatMessage;
  dispatchDepth: number;             // 0 at top level; +1 per invoke_agent
  maxDispatchDepth: number;          // default 5
  maxChildRuntimeMs: number;         // default 24 * 60 * 60 * 1000 (1 day; revisit later)
}

type RuntimeInput =
  | (RuntimeBase & {
      environment: 'production';
      conversationId: string;
      executionId: string;
    })
  | (RuntimeBase & {
      environment: 'simulation';
      simulationState: DeepReadonly<Record<string, unknown>>;
      simulationStateWritable: boolean;   // true = sim panel; false = Play button
    });
```

### 6.2 `ProviderCtx` (mirrors `RuntimeInput.environment`)

```ts
interface ProviderCtxBase {
  orgId: string;
  tenantId: string;
  userId: string;
  isChildAgent: boolean;
  dispatchDepth: number;
  services<P extends BuiltinProviderId>(p: P): BuiltinBundles[P] | undefined;
}

type ProviderCtx =
  | (ProviderCtxBase & {
      environment: 'production';
      conversationId: string;
    })
  | (ProviderCtxBase & {
      environment: 'simulation';
      simulationState: DeepReadonly<Record<string, unknown>>;
      writeSimulationState: (path: string, value: unknown) => void;  // silent no-op if !writable
    });
```

Tools narrow correctly: `if (ctx.environment === 'simulation')` makes `simulationState` and `writeSimulationState` available; `if (ctx.environment === 'production')` makes `conversationId` available.

Compile-time immutability of `simulationState` is enforced via `DeepReadonly`. The existing ESLint ban on `as` type assertions catches the cast-escape hatch.

### 6.3 `RuntimeCapabilities`

```ts
interface RuntimeCapabilities {
  persistence: DispatchPersistence;       // §10 — production real; simulation no-op
  dispatch: DispatchStrategy;             // §10 — sync recursion today; async-ready
  notifications: DispatchNotifications;   // §10 — no-op today; reserved for async
  oauthResolver: OAuthResolver;           // §7  — same impl in both; backed by backend
  mcpPool: McpPoolClient;                 // §8  — same impl in both; backed by backend
  loadChildAgentGraph: (agentId: string) => Promise<AgentGraph>;
  observability: Observability;           // structured log/metrics; sim is no-op
  rateLimit: RateLimiter;                 // production token-bucket; sim no-op
  supabase: SupabaseClient;
  logger: RunnerLogger;
}
```

### 6.4 `ChildResult` envelope

```ts
type ChildResult =
  | { status: 'finished'; result: string }
  | { status: 'error'; code: ChildErrorCode; message: string }
  | { status: 'pending'; handle: DispatchHandle; hint: string };   // reserved for async

type ChildErrorCode =
  | 'max_depth_exceeded'
  | 'child_failed'
  | 'timeout'
  | 'agent_not_published'
  | 'aborted';
```

Mapping rules (canonical, both runtimes):

| Child terminates by | Returns |
|---|---|
| Explicit `finish({ message })` | `{ status: 'finished', result: message }` |
| State machine reaches END node without `finish` | `{ status: 'finished', result: <last assistant message text> }` |
| `dispatchDepth >= maxDispatchDepth` | `{ status: 'error', code: 'max_depth_exceeded', message }` |
| Child throws / state machine errors | `{ status: 'error', code: 'child_failed', message }` |
| Child exceeds `maxChildRuntimeMs` | `{ status: 'error', code: 'timeout', message }` |
| Child agent has no published version | `{ status: 'error', code: 'agent_not_published', message }` |
| User aborts (sim only) | `{ status: 'error', code: 'aborted', message }` |

### 6.5 `RuntimeOutput`

```ts
interface RuntimeOutputBase {
  events: AsyncIterable<ExecutionEvent>;
  finalResult: string;
}

type RuntimeOutput =
  | (RuntimeOutputBase & { environment: 'production' })
  | (RuntimeOutputBase & { environment: 'simulation' });
```

Updated simulation state is streamed via per-mutation SSE `simulation_state_patch` events, not as a return field.

### 6.6 Unified SSE event vocabulary

```ts
type ExecutionEvent =
  | { type: 'node_entered'; nodeId: string; depth: number }
  | { type: 'node_exited'; nodeId: string; depth: number }
  | { type: 'assistant_message'; text: string; depth: number }
  | { type: 'tool_call'; toolName: string; toolCallId: string; args: unknown; depth: number }
  | { type: 'tool_result'; toolCallId: string; result: unknown; depth: number }
  | { type: 'simulation_state_patch'; tool: string; path: string; value: unknown }      // sim only
  | { type: 'child_dispatched'; childExecutionId: string; depth: number }
  | { type: 'child_finished'; childExecutionId: string; result: ChildResult; depth: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'finished'; result: string };
```

`child_dispatched` is emitted whenever any dispatch fires (sync or future-async). `child_finished` is emitted when the child's runtime returns or its error envelope is constructed. Both runtimes emit both events for every dispatch — this is what the FE uses to render the nested call structure with `depth`.

Per-runtime transport adapters (`ssePublicAdapter` for production, `sseSimulationAdapter` for simulation) map this vocabulary onto whatever the FE consumes today, then converge over time as FE consumers are updated.

## 7. OAuth resolver

### 7.1 Interface

```ts
type OAuthProvider = 'google' | 'mcp';

interface OAuthSubject {
  provider: OAuthProvider;
  subjectId: string;        // google → orgId; mcp → mcpBindingId
  tenantId: string;
}

interface OAuthResolver {
  resolve(subject: OAuthSubject): Promise<string>;
  preflight(subjects: OAuthSubject[]): Promise<PreflightReport>;
}

type PreflightReport =
  | { ok: true }
  | { ok: false; failures: PreflightFailure[] };

interface PreflightFailure {
  subject: OAuthSubject;
  reason: 'missing_grant' | 'refresh_failed' | 'revoked' | 'invalid_config' | 'unknown';
  message: string;
}
```

### 7.2 Behavior

- `resolve` is memoized per-(subject × run-context); identical to today's Redis-cached `tokenResolver.ts` behavior with one extra HTTP hop for the edge function.
- `preflight` runs the same operation in batch and returns structured failures.
- Both runtimes inject an `InternalApiOAuthResolver` that HTTP-calls backend `/internal/oauth/resolve` + `/internal/oauth/preflight`. The actual logic lives once in backend `tokenResolver.ts`.

### 7.3 Pre-flight surfaces

- **FE publish button** → `POST /api/agents/[agentId]/preflight-publish` → backend `/internal/oauth/preflight`. Renders failures inline; blocks publish until resolved.
- **Simulation handler first-message-of-session** → `POST /api/simulation/preflight` → backend `/internal/oauth/preflight`. Same modal surface in the sim panel.
- **Production runtime invocation** → no pre-flight. Resolution is lazy on first tool use.

### 7.4 Failure UX

Each failure has a user-facing string:

| Reason | Render |
|---|---|
| `missing_grant` | "Connect Google to publish this agent." |
| `refresh_failed` | "Reconnect Google." |
| `revoked` | "Google access was revoked. Reconnect." |
| `invalid_config` | "MCP server 'Linear' has invalid configuration." |
| `unknown` | Fall back to the message string. |

## 8. MCP connection pool — Option W

Backend owns a single connection pool serving both runtimes via HTTP.

### 8.1 Endpoints (added to backend)

```
POST /internal/mcp/invoke
     body: { agentId, tenantId, mcpBindingId, toolName, args }
     → tool result (or transport error → 502)

POST /internal/mcp/preflight
     body: { agentId, tenantId, mcpBindingId }
     → 200 ok | 400 connection failure
     (also warms the pool entry so it's hot for subsequent invokes)
```

### 8.2 Pool key

```
poolKey = `${agentId}::${tenantId}::${mcpBindingId}`
```

- **Agent** owns the MCP config.
- **Tenant** owns the OAuth credentials.
- **mcpBindingId** is the per-agent configuration record id (the `id` field on `McpServerConfig`), not a server identity — two different bindings can point at the same external service URL and they get different pool entries.
- **Org** is implicit (agents are org-scoped).

### 8.3 Eviction + lifecycle

- **TTL:** 1 hour since last use (configurable).
- **LRU cap:** 500 entries (configurable).
- **Health check:** background sweep pings idle entries every 30 seconds; prunes dead connections from the pool proactively.
- **On graceful shutdown:** close-all before exit.
- **Concurrent same-key borrows:** entry holds a `Promise` — second borrower awaits the in-flight connection.

### 8.4 Fault tolerance

- **Transport failure mid-call:** the MCP protocol's JSON-RPC ids let us distinguish "failed before request was acknowledged" (safe to retry once, transparently) from "failed after" (surface as error — tool calls may be non-idempotent).
- **OAuth 401:** refresh token via `OAuthResolver`, reconnect, retry once.
- **Reconnect backoff:** exponential 100ms → 30s with ±25% jitter.
- **Circuit breaker per pool key:** 5 reconnect failures in 60 seconds → open for 60s → half-open → retry once.
- **State machine per entry:** `CONNECTING` / `OPEN` / `BROKEN`. Only `OPEN` is borrowable.
- **Observability:** per-entry metrics (connects, retries, errors, last-used).

The principle: tool callers never see retryable transport errors. They see real errors only.

### 8.5 What's deleted

- `mcp/lifecycle.ts` (`createMcpSession`, `closeMcpSession`).
- All callers of `createMcpSession` go through `capabilities.mcpPool` instead.
- The Redis-backed tool-catalog cache stays as-is (separate layer; serves a different purpose).

## 9. Simulation state mechanics

### 9.1 Type and FE ownership

```ts
type SimulationState = Record<string, unknown>;
```

Lives in FE memory (`useSimulationState.ts`), kept across runs within a tab session, cleared on reload or explicit user action.

### 9.2 Read contract

Tools read directly via property access against `ctx.simulationState`. `DeepReadonly` prevents direct mutation at compile time. ESLint's no-`as`-cast rule prevents the escape hatch.

### 9.3 Write contract

```ts
writeSimulationState: (path: string, value: unknown) => void;
```

- **Path syntax:** JSON Pointer (RFC 6901), e.g. `/forms/contact/email`.
- Tools call it unconditionally; the runtime decides what happens based on `simulationStateWritable`:
  - **Sim panel (`writable: true`):** mutation applied to runtime-internal copy; emits `simulation_state_patch` SSE event; FE accumulates patches into its local copy.
  - **Play button (`writable: false`):** silent no-op; no SSE event; tool's other return values are unchanged. Invisible to the tool implementer.

### 9.4 Per-mutation SSE shape

```ts
{
  type: 'simulation_state_patch',
  tool: 'set_form_fields',
  path: '/forms/contact/email',
  value: 'a@b.com'
}
```

FE applies via set-by-path. Renders the mutation alongside the originating tool-call card.

### 9.5 Request shape from FE

```jsonc
POST /api/simulation/run
{
  "tenantId": "...",
  "userId": "...",
  "agentDraftGraph": { ... },
  "selectedTools": [ ... ],
  "storeBindings": { ... },
  "simulationState": { /* current FE state */ },
  "simulationStateWritable": true,        // false from Play button
  "message": { "text": "..." }
}
```

### 9.6 Lifecycle (FE)

| Trigger | Effect |
|---|---|
| Tab opened | `{}` initial state |
| Run completes | State retained in FE memory |
| New user message | Same state passed through |
| User clicks "Reset simulation state" | Confirmation modal → reset to `{}` + clear sim messages |
| User changes `tenantId` in testing presets | Confirmation modal → reset state + sim messages |
| Page reload | State gone (never persisted) |

## 10. Dispatch capabilities — sync today, async-ready

### 10.1 Sync recursion as the canonical model

Today's production runtime uses synchronous mutual recursion (`executeAgentCore` → `handleInlineDispatch` → `executeAgentCore` for child → `handleChildFinish` → `executeAgentCore` for parent resume). The durable stack and placeholder messages serve crash recovery and observability, not concurrent execution. Simulation is also sync.

The unified runtime uses sync recursion. Persistence becomes an injected capability:

```ts
interface DispatchPersistence {
  beforeDispatch(args: { executionId; parentSnapshot; childInput }): Promise<DispatchHandle>;
  onChildFinish(args: { handle; childResult }): Promise<void>;
  onChildError(args: { handle; error }): Promise<void>;
  listPending(executionId: string): Promise<DispatchHandle[]>;     // collection, not stack
}
```

Production injects `SupabaseDispatchPersistence` (stack/placeholder/suspend semantics today). Simulation injects `NoopPersistence`.

### 10.2 Async-ready scaffolding

The runtime's dispatch code uses these interfaces today even though no async path exists:

```ts
interface DispatchStrategy {
  dispatch(args: DispatchArgs): Promise<DispatchOutcome>;
}

type DispatchOutcome =
  | { kind: 'completed'; childResult: ChildResult }
  | { kind: 'pending'; handle: DispatchHandle };           // never emitted today

interface DispatchNotifications {
  waitFor(handle: DispatchHandle): Promise<ChildResult>;
  onComplete(handle: DispatchHandle, callback: (result: ChildResult) => void): void;
}
```

At the dispatch site:

```ts
const outcome = await capabilities.dispatch.dispatch(args);
if (outcome.kind === 'completed') {
  return injectChildResultIntoParent(outcome.childResult);
}
// outcome.kind === 'pending' — TODO: async dispatch path
throw new Error('Pending dispatch not yet supported');
```

The `pending` branch throws today because no strategy emits it. Adding `AsyncDispatchStrategy` later is additive — runtime core untouched.

### 10.3 Capability matrix

| Capability | Production | Simulation |
|---|---|---|
| `persistence` | `SupabaseDispatchPersistence` | `NoopPersistence` |
| `dispatch` | `SyncRecurseStrategy` | `SyncRecurseStrategy` |
| `notifications` | `NoopNotifications` (reserved) | `NoopNotifications` |
| `oauthResolver` | `InternalApiOAuthResolver` | `InternalApiOAuthResolver` |
| `mcpPool` | `BackendMcpPoolClient` | `BackendMcpPoolClient` |
| `loadChildAgentGraph` | Published version reader | Published version reader |
| `observability` | OTel / structured | Console |
| `rateLimit` | Token-bucket per tenant | `NoopRateLimit` |
| `supabase` | service-role (process.env in backend; Deno.env in edge function) | service-role (process.env) |
| `logger` | Structured | Console |

## 11. Implementation layout

### 11.1 New `packages/api/` modules

```
packages/api/src/
├── runtime/
│   ├── executeAgent.ts                  ← recursive entry
│   ├── executeTurn.ts                   ← one-turn step machine
│   ├── childDispatch.ts
│   ├── resolveChildConfig.ts            ← from backend simulateChildResolver.ts
│   ├── childResult.ts
│   └── types.ts                         ← RuntimeInput / RuntimeOutput / ProviderCtx unions
├── capabilities/
│   ├── dispatchPersistence.ts
│   ├── dispatchStrategy.ts
│   ├── dispatchNotifications.ts
│   ├── oauthResolver.ts
│   ├── mcpPoolClient.ts
│   ├── observability.ts
│   ├── rateLimiter.ts
│   └── index.ts                         ← RuntimeCapabilities aggregate
├── events/
│   ├── types.ts                         ← ExecutionEvent union
│   └── emitter.ts
└── providers/                           ← existing
    ├── types.ts                          ← extends ProviderCtx with environment discriminant
    ├── registry.ts                       ← composeRegistry becomes canonical connection point
    └── */buildTools.ts                   ← per-tool env=simulation early-return guard
```

### 11.2 New `packages/shared-store-services/` module

```
packages/shared-store-services/src/
├── kvStoreServices.ts                   ← PostgREST + Postgres `~`
├── kvQueries.ts
├── ragStoreServices.ts
├── ragQueries.ts
├── ragSearchCores.ts
├── calendarServices.ts                  ← from backend google/calendar/service.ts
├── formsServices.ts                     ← from backend services/formsService.ts
├── leadScoringServices.ts               ← from backend services/leadScoring*
├── internalApiClient.ts                 ← /internal/embed + /internal/regex/validate
└── index.ts
```

Works in both Node and Deno via `@supabase/supabase-js`. Imported by `packages/backend/` and `supabase/functions/_shared/`.

### 11.3 `packages/backend/` changes

**New:**
```
packages/backend/src/
├── routes/internal/
│   ├── mcpInvoke.ts                     ← POST /internal/mcp/invoke
│   ├── mcpPreflight.ts                  ← POST /internal/mcp/preflight
│   ├── oauthResolve.ts                  ← POST /internal/oauth/resolve
│   └── oauthPreflight.ts                ← POST /internal/oauth/preflight
├── mcp/
│   ├── connectionPool.ts                ← keyed by (agentId, tenantId, mcpBindingId)
│   ├── poolEntry.ts                     ← state machine
│   ├── circuitBreaker.ts
│   ├── healthCheck.ts
│   └── reconnect.ts
├── runtime/
│   ├── productionDriver.ts              ← thin: calls executeAgent
│   ├── productionCapabilities.ts
│   └── ssePublicAdapter.ts
└── simulation/
    ├── simulationDriver.ts
    ├── simulationCapabilities.ts
    └── sseSimulationAdapter.ts
```

**Deleted:**

- `routes/simulationOrchestrator.ts`
- `routes/simulationOrchestratorHelpers.ts`
- `routes/simulationProviderCtx.ts`
- `routes/simulationServicesResolver.ts`
- `routes/simulateChildResolver.ts`
- `routes/simulateAgentSse.ts`
- `routes/simulateHandler.ts` becomes a thin Express handler that delegates to `simulationDriver`
- `routes/execute/executeCore.ts`
- `routes/execute/executeCoreInlineDispatch.ts`
- `routes/execute/executeCoreChildFinish.ts`
- `routes/execute/executeAgentPath.ts` (dead code; verify before deletion)
- `mcp/lifecycle.ts` (`createMcpSession` / `closeMcpSession`)
- `services/kvStoreService.ts` (LLM tool methods only; keep parts used by `simulationServicesResolver`'s downstream callers if any)
- `services/ragStoreService.ts` (same)
- `services/noStoreBoundServices.ts`

Files like `tokenResolver.ts`, `executeOAuthResolver.ts`, persistence query modules — STAY. Become injected via `productionCapabilities`.

### 11.4 `packages/web/` (FE proxy route additions)

```
packages/web/app/api/
├── agents/[agentId]/preflight-publish/
│   └── route.ts                         ← POST → backend /internal/oauth/preflight
└── simulation/preflight/
    └── route.ts                         ← POST → backend /internal/oauth/preflight
```

Both proxy to backend with master-key auth. Used by the publish dialog and by the sim handler on first-message-of-session respectively.

### 11.5 `supabase/functions/` changes

**Reorganized:**
```
supabase/functions/
├── _shared/
│   ├── edgeCapabilities.ts
│   ├── edgeOAuthResolver.ts
│   ├── edgeMcpPoolClient.ts
│   ├── edgeSupabase.ts
│   └── runtimeImports.ts
├── execute-agent/
│   ├── index.ts                         ← entry
│   └── ssePublicAdapter.ts
└── execute-tool/
    └── index.ts
```

**Deleted:**
- `execute-agent/toolBuilder.ts`
- `execute-agent/{kv,rag}StoreServices.ts`
- `execute-agent/{kv,rag}Queries.ts`
- `execute-agent/ragSearchCores.ts`
- `execute-agent/internalApiClient.ts`
- `execute-agent/storeServices.ts`

## 12. FE UX changes

### 12.1 Toolbar surface

Two new icon buttons in the toolbar (right edge, near other simulation-related controls):

1. **Testing presets icon** — opens the existing `TestingPresetsSection` UI in a popover. Tenant text input replaced with `TenantPicker` (from `PublishButtonTenantPicker.tsx`).
2. **Simulation state icon** — opens a panel showing the current `simulationState` rendered via `JsonBlock` (from `JsonDisplay.tsx`). Footer: single "Reset simulation" button.

### 12.2 Modals

Use shadcn `<AlertDialog>` (already in use):

| Trigger | Effect on confirm |
|---|---|
| Reset simulation button | Reset `simulationState = {}`, clear sim messages and tokens, reset to start node |
| Tenant change (when simulationState non-empty OR sim messages exist) | Same as above; then apply tenant change |

### 12.3 `useSimulationState.ts` additions

```ts
const [simulationState, setSimulationState] = useState<Record<string, unknown>>({});

const applyPatch = useCallback((path: string, value: unknown) => {
  setSimulationState((prev) => setByJsonPointer(prev, path, value));
}, []);

const resetSimulationState = useCallback(() => {
  setSimulationState({});
}, []);
```

`setByJsonPointer` lives in a new `app/utils/jsonPointer.ts`.

### 12.4 Translations to add

```
simulation.resetState.title
simulation.resetState.description
simulation.resetState.confirm
simulation.resetState.cancel
simulation.tenantSwitchReset.title
simulation.tenantSwitchReset.description
simulation.tenantSwitchReset.confirm
simulation.tenantSwitchReset.cancel
simulation.toolbar.testingPresetsLabel
simulation.toolbar.simulationStateLabel
simulation.toolbar.openPanel
simulation.statePanel.empty
simulation.statePanel.resetButton
```

## 13. Per-tool migration plan

Every **side-effecting** builtin tool's `execute` function gains:

```ts
async execute(args: unknown, ctx: ProviderCtx) {
  if (ctx.environment === 'simulation') {
    return { simulated: true, note: 'No action performed (simulation)' };
    // TODO(SIM-<provider>-<tool>): implement actual simulation semantics
  }
  // ... existing production logic
}
```

**Coverage by guard kind:**

| Provider | Tool | Guard kind | Notes |
|---|---|---|---|
| `kv_store` | `list_keys` | early-return | |
| `kv_store` | `get_values` | early-return | |
| `kv_store` | `search` | early-return | |
| `kv_store` | `update_value` | early-return | |
| `rag` | `search` | early-return | |
| `calendar` | `list_calendars` | early-return | |
| `calendar` | `check_availability` | early-return | |
| `calendar` | `list_events` | early-return | |
| `calendar` | `get_event` | early-return | |
| `calendar` | `book_appointment` | early-return | |
| `calendar` | `update_event` | early-return | |
| `calendar` | `cancel_appointment` | early-return | |
| `forms` | `set_form_fields` | early-return | |
| `forms` | `get_form_field` | early-return | |
| `lead_scoring` | `set_lead_score` | early-return | |
| `lead_scoring` | `get_lead_score` | early-return | |
| `composition` | `create_agent` | early-return (synthetic agent id) | Creates a DB record in production; in simulation returns `{ simulated: true, agentId: '<sim-uuid>' }` so the LLM can reference the "created" agent later in the run |
| `composition` | `invoke_agent` | **NO guard — recurse normally** | Recursion propagates `environment: 'simulation'` to the child; child's tools early-return as needed |
| `composition` | `invoke_workflow` | **NO guard — recurse normally** | Same as `invoke_agent` |
| `composition` | `finish` | **NO guard — sentinel works in both** | Returns the child's final message to the parent's dispatch result |

20 tools get the guard. 3 composition tools (`invoke_agent`, `invoke_workflow`, `finish`) intentionally don't — their semantics in simulation come from the runtime's recursion machinery and environment propagation, not from per-tool branching.

**MCP tools are NOT wrapped** — they have real side effects in simulation. The user understands this; no UI badge.

## 14. Migration phasing

Phased commits matching the prior refactor cadence on this branch:

1. **Phase 1:** Extract factories to `packages/shared-store-services/`. Both runtimes re-export from old locations during this phase for behavior equivalence.
2. **Phase 2:** Add runtime + capability interfaces to `packages/api/`. Move `prepareAllBundles` / `buildProviderCtx` / `buildRegistry`. No driver changes yet.
3. **Phase 3:** Add the 4 new `/internal/*` backend endpoints (mcp/invoke, mcp/preflight, oauth/resolve, oauth/preflight).
4. **Phase 4:** Implement backend MCP connection pool.
5. **Phase 5:** Migrate production driver to consume the new api runtime + capabilities.
6. **Phase 6:** Migrate simulation driver.
7. **Phase 7:** Per-tool early-return guard added to all 24 builtin tools.
8. **Phase 8:** SSE event vocabulary unified across drivers.
9. **Phase 9:** FE toolbar + sim state panel + tenant dropdown + modals.
10. **Phase 10:** Delete dead code (`executeAgentPath.ts`, `createMcpSession`/`closeMcpSession`, all replaced modules listed in §11.3 / §11.4).

Each phase commits independently with `npm run check` + tests green. Phase 10 is non-reversible; everything before is.

## 15. Risks and open questions

- **Calendar OAuth resolution in simulation.** Mechanism is in place via the unified resolver, but live-stack verification is required.
- **`executeAgentPath.ts` dead-code verification.** Re-grep for dynamic imports and string references before deletion.
- **MCP connection pool memory growth.** Bound + LRU + TTL handle this; surface metrics so we know if 500-entry cap is appropriate at scale.
- **SSE vocabulary convergence forces FE consumer updates.** Sim panel and execution viewer currently listen to different shapes; FE adapters bridge during transition, then we converge.
- **Per-tool simulation semantics deferred to follow-up PRs.** Today every builtin tool no-ops in simulation. This is acceptable because the runtime unification's success criterion is structural, not behavioral fidelity of every tool.
- **Backend becomes more stateful** (MCP connection pool). Document operational implications (restart drops connections, fault-tolerance via reconnect handles transients).
- **Multi-backend deployment.** Today's assumption is single backend instance; horizontal scaling produces minor pool inefficiency, not correctness issue.
- **The simulation `composition.invoke_workflow`** may not complete meaningfully when the child is a workflow with its own runtime expectations — defer to per-tool semantics iteration.

## 16. Future work (explicitly out of scope here)

- Per-tool simulation semantics for the 24 builtins.
- True async sub-agent invocation (parent continues while child runs). Runtime contracts already accommodate; protocol decision (pending tool result vs. polling) is the harder choice.
- Cross-backend MCP connection pooling (Redis-mediated).
- MCP transport pre-flight at publish (currently only OAuth pre-flight; MCP transport is best-effort at first call).

## 17. References

- Audit findings (recorded in conversation; reproduced in §4).
- Prior refactors that this builds on:
  - `97a26c91` extract `toolBuilder.ts`
  - `f5d5977f` new `execute-tool` edge function
  - `682cbc43` proxy Play button through edge function
  - `6b0a46e2` add `/internal/embed` and `/internal/regex/validate`
  - `fac37520` Deno-side KV/RAG factories with direct Postgres
  - `ad5bd3a0` rewire `prepareAllBundles`
  - `a61bf3fc` delete `/internal/tools/{kv-store,rag}/*`
- Affected file paths (selection — full list in §11):
  - `packages/api/src/providers/types.ts`
  - `packages/api/src/providers/registry.ts`
  - `packages/api/src/core/buildAgentToolsAtStart.ts`
  - `packages/backend/src/routes/execute/executeCoreInlineDispatch.ts`
  - `packages/backend/src/routes/execute/executeCoreChildFinish.ts`
  - `packages/backend/src/mcp/lifecycle.ts`
  - `packages/backend/src/services/{kvStoreService,ragStoreService}.ts`
  - `packages/web/app/hooks/useSimulationState.ts`
  - `packages/web/app/hooks/useSimulation.ts`
  - `packages/web/app/components/panels/{TestingPresetsSection,PublishButtonTenantPicker,JsonDisplay}.tsx`
  - `supabase/functions/execute-agent/toolBuilder.ts`
  - `supabase/functions/execute-tool/index.ts`
