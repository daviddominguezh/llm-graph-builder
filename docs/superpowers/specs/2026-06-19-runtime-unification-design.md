# Runtime unification — design

**Date:** 2026-06-19
**Branch context:** `feat/data-tools`
**Status:** Design approved; pending implementation plan.

## 1. Context

The repository runs the agent state machine in **two execution runtimes**:

- **Production:** Cloudflare Worker (`packages/worker`), migrating off the legacy Supabase Deno edge function whose 400s execution cap cannot hold hours-long agent runs
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
- Establish the per-tool simulation seam (today a shared default no-op) so forms, lead-scoring, and the other builtins can each define real simulation behavior over time; today they are silently absent in simulation. Simulation behavior is simulation-only — production tools never read or write simulation state.
- Delete dead code identified by the audit.
- Production dispatch is durable (suspend/resume) from the start, because hours-long runs on a CPU-capped host (Cloudflare Workers) cannot block in a single invocation; simulation keeps synchronous recursion. Genuine concurrent sub-agent execution (parent continues *in parallel* while child runs) remains future work, but the durable seam is in place.

## 3. Out of scope

- **Bespoke per-tool simulation behavior.** The per-tool simulation seam (the `if (ctx.environment === 'simulation')` branch, §13) ships now, but for the initial cut every builtin returns a **shared default no-op** — no external side-effect, no state write. Each tool's real simulation behavior (returning realistic synthetic data and reading/writing the §9 simulation state) is implemented per tool afterwards. This is a deliberate, permanent extension point, not throwaway scaffolding: simulation semantics legitimately differ per tool, so each tool owns its own branch.
- **Concurrent sub-agent execution** (parent continues *in parallel* while child runs). Production dispatch is durable (suspend/resume) per §10, but the parent still resumes only after the child completes; genuine parallelism is deferred.
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
   │ (Cloudflare Worker)│                            │ (Node Express)      │
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

`simulationState`'s immutability is a **runtime guarantee**, not just a type. `DeepReadonly` + the ESLint `as`-ban are the compile-time layer, but they are bypassable on their own (object spread, `structuredClone`, array mutators like `.push`/`.sort`, `satisfies`, `@ts-expect-error`, function-param widening). So the runtime **deep-`Object.freeze`s `simulationState` at the `ProviderCtx` boundary** before handing it to tools — a stray mutation throws (strict mode) instead of silently corrupting state the runtime believes is frozen. `DeepReadonly` stays as the developer-facing type.

### 6.3 `RuntimeCapabilities` and `RuntimeServices`

Only the capabilities that genuinely differ per runtime are injected by the driver. Everything else is shared infrastructure with one implementation in both runtimes, constructed once from environment config — it is NOT a per-runtime behavioral seam and must not be duplicated per driver.

```ts
// Genuinely runtime-specific behavior — the driver injects these (5 seams).
interface RuntimeCapabilities {
  persistence: DispatchPersistence;   // §10 — prod: durable (DB); sim: no-op
  dispatch: DispatchStrategy;         // §10 — prod: durable suspend/resume; sim: sync recursion
  observability: Observability;       // prod: structured/OTel; sim: console
  rateLimit: RateLimiter;             // prod: token-bucket per tenant; sim: no-op
  logger: RunnerLogger;               // prod: structured; sim: console
}

// Shared services — identical in both runtimes; the core wires these once from
// config. Listed separately so they are not mistaken for per-runtime seams.
interface RuntimeServices {
  mcpPool: McpPoolClient;             // §8 — BackendMcpPoolClient in both
  loadChildAgentGraph: (agentId: string) => Promise<AgentGraph>;
  supabase: SupabaseClient;           // service-role; only the env source differs at construction
}
```

There is **no `oauthResolver` capability**: MCP is the only OAuth provider and the backend pool owns MCP connections, so the pool resolves/attaches/refreshes tokens internally on connect (§7). The runtime/Worker never resolves an MCP token.

`DispatchNotifications` is removed: under the durable production model (§10) a suspended parent is resumed by an external re-invocation that reads persisted state, not by an in-process `waitFor`/`onComplete` callback.

### 6.4 `ChildResult` envelope

Re-derived from the two runtimes' actual termination paths (`executeCore.ts` / `executeCoreChildFinish.ts` for production, `simulationOrchestrator.ts` for simulation), not assumed. Two corrections vs the original draft: (a) `finish` carries a `success | error` status (the `FinishSentinel`) that must be preserved, and (b) simulation produces a real **awaiting-input** outcome today (its `child_waiting` state) that had no envelope.

```ts
type ChildResult =
  | { status: 'finished'; result: string; outcome: 'success' | 'error' }
  | { status: 'awaiting_input'; partial: string }   // child paused for user input (sim child_waiting)
  | { status: 'error'; code: ChildErrorCode; message: string };

type ChildErrorCode =
  | 'max_depth_exceeded'
  | 'child_failed'
  | 'no_result'          // child ended without finish and produced no assistant text
  | 'timeout'
  | 'agent_not_published'
  | 'aborted';
```

Suspension of a durable production parent is NOT a `ChildResult` — it is a `DispatchOutcome` (§10.2). `ChildResult` is always a terminal envelope.

Mapping rules (re-derived; the one environment-aware row is END-without-finish, and deliberately so):

| Child terminates by | ChildResult |
|---|---|
| Explicit `finish({ message, status: 'success' })` | `{ status: 'finished', result: message, outcome: 'success' }` |
| Explicit `finish({ message, status: 'error' })` | `{ status: 'finished', result: message, outcome: 'error' }` |
| END node without `finish` — **simulation** (interactive) | `{ status: 'awaiting_input', partial: <last assistant text> }` |
| END node without `finish` — **production** (autonomous), has assistant text | `{ status: 'finished', result: <last assistant text>, outcome: 'success' }` |
| END node without `finish` — **production**, no assistant text | `{ status: 'error', code: 'no_result', message }` |
| `dispatchDepth >= maxDispatchDepth` | `{ status: 'error', code: 'max_depth_exceeded', message }` |
| Child throws / state machine errors | `{ status: 'error', code: 'child_failed', message }` |
| Child exceeds `maxChildRuntimeMs` | `{ status: 'error', code: 'timeout', message }` |
| Child agent has no published version | `{ status: 'error', code: 'agent_not_published', message }` |
| User aborts (sim only) | `{ status: 'error', code: 'aborted', message }` |

END-without-finish legitimately differs by environment: production has no user to supply input to a suspended child, so it terminates (with text, or `no_result` if there is none); simulation surfaces the interactive pause. This replaces the original draft's "last assistant text, canonical both runtimes" row, which matched neither runtime.

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

The **runtime is the single source of truth** for simulation state during a run. It streams display-only `simulation_state_patch` events for live rendering and a terminal, authoritative `simulation_state_snapshot` the FE adopts — not a return field, and the FE never rebuilds authoritative state from the patch stream (§9.4).

### 6.6 Unified SSE event vocabulary

```ts
type ExecutionEvent =
  | { type: 'node_entered'; nodeId: string; depth: number }
  | { type: 'node_exited'; nodeId: string; depth: number }
  | { type: 'assistant_message'; text: string; depth: number }
  | { type: 'tool_call'; toolName: string; toolCallId: string; args: unknown; depth: number }
  | { type: 'tool_result'; toolCallId: string; result: unknown; depth: number }
  | { type: 'simulation_state_patch'; tool: string; path: string; value: unknown }      // sim only — display only, not authoritative
  | { type: 'simulation_state_snapshot'; state: Record<string, unknown> }               // sim only — terminal, authoritative
  | { type: 'child_dispatched'; childExecutionId: string; depth: number }
  | { type: 'child_suspended'; childExecutionId: string; depth: number }                       // prod durable: parent persisted, awaiting external resume
  | { type: 'child_awaiting_input'; childExecutionId: string; partial: string; depth: number } // sim: child paused for user input
  | { type: 'child_finished'; childExecutionId: string; result: ChildResult; depth: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'finished'; result: string };
```

`child_dispatched` is emitted whenever any dispatch fires (sync or future-async). `child_finished` is emitted when the child's runtime returns or its error envelope is constructed. Both runtimes emit both events for every dispatch — this is what the FE uses to render the nested call structure with `depth`.

Per-runtime transport adapters (`ssePublicAdapter` for production, `sseSimulationAdapter` for simulation) map this vocabulary onto whatever the FE consumes today, then converge over time as FE consumers are updated.

## 7. OAuth for MCP servers

**What it's for:** an OAuth-protected MCP server an agent connects to (e.g. a Notion, Snowflake, or Square MCP server) needs a valid access token before its tools can run on the org/tenant's behalf. Resolution turns a stored OAuth grant (a long-lived refresh token) into a fresh, short-lived access token.

> **Scope note.** MCP is the **only** OAuth provider (Google Calendar was removed), and MCP OAuth is **live today** — OAuth library servers work via `resolveAccessToken` (full discovery / dynamic registration / PKCE / refresh, Redis-cached), which `resolveOAuthForExecution` currently injects as `Authorization: Bearer` into the server's `transport.headers` at execute time. So this section is **not** about building OAuth — it's about *where resolution lives* once the BE owns the MCP pool.

**Decision — the pool owns MCP OAuth; there is no runtime-facing OAuth resolver.** Because MCP is the only OAuth consumer and the **backend pool owns every MCP connection (§8)**, token resolution moves *inside the pool's connect path* — the production Worker never resolves an MCP token. It calls `/internal/mcp/invoke`, and the pool attaches/refreshes auth internally. Consequences:

- **No `oauthResolver` runtime capability, no `/internal/oauth/resolve` endpoint, no `InternalApiOAuthResolver`.** They had no caller once calendar (the only *runtime-side* OAuth consumer) was removed. Dropped from §6.3.
- **Resolution is lazy, per-binding, on connect.** The pool only connects a `poolKey` (`agentId::tenantId::mcpBindingId`) when one of its tools is first invoked, so the token is resolved then — not pushed up front for every selected server (today's `resolveOAuthForExecution` behavior). Reuses the existing `resolveAccessToken` (Redis cache + refresh-on-expiry + single-flight); the cache lives BE-side, so it survives the Worker's suspend/resume (§10.4) → ~1 generation per binding per token-lifetime, regardless of message count.
- **Dynamic auth on the pooled connection.** A long-lived pooled connection outlives a token, so the bearer can't be a static header baked in at start. The pool attaches the current token at connect and, on **401 / pre-expiry, refreshes and reconnects** (§8.4 — retry the *connect*, never the invoke). This 401-mid-session recovery is the only net-new logic.
- **Keying.** Today the store is keyed **org + `libraryItemId`**; the `tenantId` dimension is the SP4 change. The OAuth subject (§7.1) and the pool key are the **same** concept — keep one, not two.

### 7.1 Preflight interface

The only OAuth surface the runtime/FE calls is **preflight** — a publish / first-message validity check, not a hot-path resolve (resolution itself is pool-internal, above):

```ts
interface OAuthSubject {
  provider: 'mcp';          // MCP is the only provider; widen if a new OAuth integration is added
  mcpBindingId: string;
  tenantId: string;         // reconcile with today's org + libraryItemId store as SP4 lands
}

interface OAuthPreflight {
  preflight(subjects: OAuthSubject[]): Promise<PreflightReport>;
}

type PreflightReport =
  | { ok: true }
  | { ok: false; failures: PreflightFailure[] };

interface PreflightFailure {
  subject: OAuthSubject;
  reason: 'missing_grant' | 'refresh_failed' | 'revoked' | 'invalid_config' | 'backend_unavailable' | 'unknown';
  message: string;
}
```

`OAuthSubject` is the **same key the pool uses** (`mcpBindingId` + `tenantId`) — deliberately one concept, not two.

### 7.2 Behavior

- **Runtime tool call:** the Worker calls `/internal/mcp/invoke`; the pool resolves / attaches / refreshes the token internally (per the decision above). No OAuth call from the Worker.
- **Preflight** runs `resolveAccessToken` in batch over the OAuth-protected MCP bindings the agent's **selected tools declare**, returning structured failures — used by the surfaces in §7.3, off the per-turn hot path.
- All OAuth logic + cache live once in the backend, sharing the pool's server-side tenant/binding authorization (§8.1) — the caller never asserts the principal.

### 7.3 Pre-flight surfaces

- **FE publish button** → `POST /api/agents/[agentId]/preflight-publish` → backend `/internal/oauth/preflight`. Batch-checks the OAuth-protected MCP bindings the agent's selected tools declare; renders failures inline; blocks publish until resolved.
- **Simulation handler first-message-of-session** → `POST /api/simulation/preflight` → backend `/internal/oauth/preflight`. Same modal surface in the sim panel.
- **Production runtime invocation** → no pre-flight. Resolution is lazy on first tool use (per §7.2).

### 7.4 Failure UX

Each failure has a user-facing string. Transient/infra failures are a **distinct category** from grant failures — a backend blip must never render as a "reconnect this server" prompt:

| Reason | Render |
|---|---|
| `missing_grant` | "Connect the '{server}' MCP server to publish this agent." |
| `refresh_failed` | "Reconnect the '{server}' MCP server." |
| `revoked` | "Access to '{server}' was revoked. Reconnect." |
| `invalid_config` | "MCP server '{server}' has invalid configuration." |
| `backend_unavailable` | "Couldn't verify connections right now — try again." (transient; not a grant problem) |
| `unknown` | Fall back to the redacted error category (never a raw message — SP3 redaction discipline). |

## 8. MCP connection pool (backend-owned)

**Decision:** the **backend owns all MCP connections and tool invocation**. The production Cloudflare Worker and the simulation runtime both reach MCP **only** through backend `/internal/mcp/*` endpoints. Rationale:

- A **stateless Worker cannot hold a connection pool** — it is ephemeral per-invocation, so warm connections and caching must live in a long-running process.
- **stdio MCP servers are subprocesses** and cannot run on a Worker at all; the backend must own them regardless, so owning *all* MCP transports is consistent rather than split-brained.
- The backend **already fronts every Worker invocation** (it invokes the Worker on each message), so routing MCP through it adds **no new availability dependency** — it rides one that already exists.
- **Connection reuse is a latency win:** a Worker dialing fresh per call would pay the full handshake every time; the pool amortizes it. The extra Worker→backend hop is small next to the MCP-server round-trip.
- The backend is the only place that can run the **SP3 DNS-based egress guard** (the Worker has no `node:dns`), so centralizing MCP here gives **one guarded egress choke point**.
- It composes with the durable model (§10.4): MCP connections live in the backend pool independent of the ephemeral Worker's suspend/resume lifecycle.

**Where it lives:** start with the pool as a module **inside the backend** (`packages/backend/src/mcp/`). It is designed to be extracted into a dedicated, horizontally-scalable MCP gateway later; the pool key and sticky routing (§8.2) are built for that from day one, so extraction needs no retrofit.

### 8.1 Endpoints (added to backend)

```
POST /internal/mcp/invoke
     body: { agentId, mcpBindingId, toolName, args }
     → tool result | typed tool-level error (never crashes the caller's turn)

POST /internal/mcp/preflight
     body: { agentId, mcpBindingId }
     → 200 ok | 400 connection failure
     (also warms the pool entry so it's hot for subsequent invokes)
```

- **Server-side authorization (required).** The caller does **not** assert the security principal. `tenantId` and binding ownership are **derived server-side** from `agentId` against the DB (verify the binding belongs to the agent and the agent is authorized for the tenant). Master-key auth on `/internal/*` is an infrastructure boundary, not a tenant boundary — without server-side derivation, a caller passing an arbitrary `tenantId`/`mcpBindingId` is a confused-deputy hole across tenants.
- **Graceful degradation.** If the pool/gateway is unreachable or the transport fails, the endpoint returns a **typed tool-level error** the LLM can react to — it never aborts the run.

### 8.2 Pool key and sticky routing

```
poolKey = `${agentId}::${tenantId}::${mcpBindingId}`
```

- **Agent** owns the MCP config; **tenant** scopes the credentials; **mcpBindingId** is the per-agent config record id (`McpServerConfig.id`), not a server identity — two bindings to the same URL get separate entries. **Org** is implicit (agents are org-scoped).
- **Sticky routing (decided).** When the backend/gateway is horizontally scaled, a given `poolKey` is **consistent-hash routed to a single instance**, so connection reuse holds, session-stateful MCP servers keep continuity, and upstreams don't see N× connections. This is mandatory before scaling out — in-memory pools without stickiness fracture (split-brain sessions, duplicate connections). We start with the pool in the backend directly; routing is sticky-by-`poolKey` from day one so scaling out is additive.
- **Tenant-keying caveat.** Today MCP OAuth is keyed `orgId + libraryItemId` (no tenant dimension). The `tenantId` in the key anticipates SP1/SP4 tenant-scoping and must be reconciled with that work — the credential store needs the tenant dimension before this key is fully meaningful.

### 8.3 Eviction + lifecycle

- **TTL:** 1 hour since last use (configurable).
- **LRU cap:** per-instance, sized from the socket/fd budget (not a round number); surface metrics to tune.
- **Health check:** background sweep pings entries idle beyond TTL/2 (jittered, concurrency-capped) and prunes dead connections; must **not** evict a leased/in-flight entry (refcount borrows).
- **Concurrent same-key borrows:** entry holds a `Promise` — second borrower awaits the in-flight connection. **On connect rejection, evict the entry and allow one fresh retry** rather than poisoning all awaiters until TTL.
- **On graceful shutdown:** drain in-flight invokes, then close-all.

### 8.4 Fault tolerance

- **Retry only the connect/handshake phase — never an invoke that may have hit the wire.** A transport drop *after* bytes are sent is indistinguishable from never-sent at the JSON-RPC layer, so retrying a `callTool` can double-execute a non-idempotent tool (book/charge/send). Treat all tool calls as non-idempotent unless the tool declares otherwise, and thread an **idempotency key** so connect-retries and durable-resume retries (§10.4) dedupe.
- **OAuth 401:** refresh the token via `resolveAccessToken`, reconnect, retry the **connect** (not a mid-call invoke).
- **Reconnect backoff:** exponential 100ms → 30s with ±25% jitter.
- **Circuit breaker per pool key:** counts **connect attempts** (not borrowers) — 5 failures in 60s → open 60s → half-open → retry once. Breaker-open is surfaced to the caller as an explicit **transient/unavailable** category, distinct from a permanent error — not silently swallowed.
- **Egress re-validation (TOCTOU):** the SP3 egress guard runs on connect **and** is re-validated on borrow — a pooled connection lives up to the TTL while DNS can rebind, so connect-time guarding alone is insufficient for a pool. Pin the resolved IP or re-check on reuse.
- **State machine per entry:** `CONNECTING` / `OPEN` / `BROKEN`. Only `OPEN` is borrowable.
- **Observability:** per-entry metrics (connects, retries, errors, last-used).

The principle: a tool caller never gets a retryable transport error *silently swallowed in a way that double-executes a side effect* — it gets either a real result or a typed transient/permanent error it can act on.

### 8.5 What's deleted / reconciled

- `mcp/lifecycle.ts` (`createMcpSession`, `closeMcpSession`) — deleted; all callers go through the backend pool. Delete **only after** the pool wires the SP3 egress guard, so the guarded path is never removed first.
- The api-package **session-id cache** (`ensureSession` / `sessionCache`, keyed `orgId+serverUrl`) is **reconciled into the pool** — it caches a session *id* (shareable via Redis) while the pool holds the live transport; the two must not hand out conflicting sessions. One owner: the pool holds connections, and the session-id cache, if kept, lives inside it.
- The Redis-backed tool-catalog cache stays as-is (separate layer; serves a different purpose).

## 9. Simulation state mechanics

### 9.1 Type and FE ownership

```ts
type SimulationState = Record<string, unknown>;
```

Lives in FE memory (`useSimulationState.ts`), kept across runs within a tab session, cleared on reload or explicit user action.

### 9.2 Read contract

Tools read directly via property access against `ctx.simulationState`. Immutability is enforced at **runtime**: the runtime deep-`Object.freeze`s `simulationState` at the ctx boundary (§6.2), so a mutation throws rather than silently corrupting state. `DeepReadonly` + the ESLint `as`-ban are the compile-time layer but are bypassable on their own (spread / `structuredClone` / array mutators), which is why the freeze — not the type — is the actual guarantee.

### 9.3 Write contract

```ts
writeSimulationState: (path: string, value: unknown) => void;
```

- **Path syntax:** JSON Pointer (RFC 6901), e.g. `/forms/contact/email`.
- **`value` is deep-cloned on write** (`structuredClone`) before it enters the state, so a tool that retains a reference to what it passed cannot mutate committed state afterward — the same integrity concern as the read-side freeze (§6.2), on the write path.
- Tools call it unconditionally; the runtime decides what happens based on `simulationStateWritable`:
  - **Sim panel (`writable: true`):** mutation applied to the runtime's authoritative copy (the single source of truth during a run); emits a **display-only** `simulation_state_patch` SSE event so the FE can render the change live. The FE does **not** reconstruct authoritative state from patches (§9.4).
  - **Play button (`writable: false`):** silent no-op; no SSE event; tool's other return values are unchanged. Invisible to the tool implementer.

### 9.4 State ownership: one source of truth

During a run the **runtime owns simulation state and is the only writer.** The FE never rebuilds authoritative state from the event stream — it holds the last snapshot it received and renders patches optimistically. This removes the dual-ownership fragility where a dropped SSE patch or a mid-run abort would silently desync (and then persist, because the FE feeds its state back on the next turn).

- **`simulation_state_patch` — per mutation, display-only:**
  ```ts
  { type: 'simulation_state_patch', tool: 'set_form_fields', path: '/forms/contact/email', value: 'a@b.com' }
  ```
  The FE applies it by set-by-path **for live rendering only** (alongside the originating tool-call card). A dropped patch is purely cosmetic — it cannot corrupt authoritative state, because patches are not the source of truth.

- **`simulation_state_snapshot` — terminal, authoritative:** when the run finishes, the runtime emits the full final state. The FE **replaces** its copy with this snapshot. This is the *only* thing that updates the FE's authoritative state, so a lost patch is self-correcting (the snapshot reconciles).

- **Abort:** if the user stops the run, no terminal snapshot is emitted. The FE discards its optimistic patch rendering and keeps the **last committed snapshot** (the pre-run state) — a stopped run never leaves a half-mutated FE.

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
| Run completes | FE adopts the terminal `simulation_state_snapshot` as its authoritative state |
| Run aborted | FE keeps the last snapshot (pre-run); optimistic patch rendering discarded |
| New user message | Last snapshot passed through (seeds the runtime's working copy) |
| User clicks "Reset simulation state" | Confirmation modal → reset to `{}` + clear sim messages |
| User changes `tenantId` in testing presets | Confirmation modal → reset state + sim messages |
| Page reload | State gone (never persisted) |

## 10. Dispatch capabilities — sync today, async-ready

### 10.1 Two dispatch strategies: durable (production) and sync recursion (simulation)

The two runtimes have genuinely different execution models, and the design reflects that instead of forcing one:

- **Production — durable suspend/resume.** Agent runs can last hours (slow tools, long LLM chains, human-in-the-loop pauses) and run on a CPU-capped host (Cloudflare Workers), so a run cannot block in a single invocation. On child dispatch the parent's state is persisted and the invocation ends; an external trigger (queue / Durable Object alarm / cron sweeping suspended runs from Postgres — see § Production host) re-invokes the runtime to resume the parent once the child's result is durably written. Production already half-does this: `executeCoreInlineDispatch` suspends to the DB and `executeCoreChildFinish` resumes by re-invoking with `continueExecutionId`. This generalizes it into the canonical production model.
- **Simulation — synchronous recursion.** Sim runs are short, interactive, single-session, and ephemeral. It keeps in-process mutual recursion (`executeAgentCore` → child → resume). No durability, no external re-invocation.

Persistence is the injected seam that backs durability:

```ts
interface DispatchPersistence {
  beforeDispatch(args: { executionId; parentSnapshot; childInput }): Promise<DispatchHandle>;
  onChildFinish(args: { handle; childResult }): Promise<void>;
  onChildError(args: { handle; error }): Promise<void>;
  listPending(executionId: string): Promise<DispatchHandle[]>;     // collection, not stack
}
```

Production injects `SupabaseDispatchPersistence`. Simulation injects `NoopPersistence` (sync recursion needs no persisted handles).

### 10.2 `DispatchStrategy`

```ts
interface DispatchStrategy {
  dispatch(args: DispatchArgs): Promise<DispatchOutcome>;
}

type DispatchOutcome =
  | { kind: 'completed'; childResult: ChildResult }    // sim: child ran inline (sync recursion)
  | { kind: 'suspended'; handle: DispatchHandle };     // prod: parent persisted, resumes on external re-invocation
```

Both branches are real and exercised — production emits `suspended`, simulation emits `completed`:

```ts
const outcome = await capabilities.dispatch.dispatch(args);
if (outcome.kind === 'completed') {
  return injectChildResultIntoParent(outcome.childResult);   // simulation: continue in-process
}
// outcome.kind === 'suspended' — production durable path:
//   parent state was persisted via capabilities.persistence; this invocation now returns.
//   The resume trigger re-invokes the runtime; on resume the child's ChildResult is read
//   from persistence and injected into the parent exactly as the 'completed' branch would.
return endInvocationSuspended(outcome.handle);
```

`SyncRecurseStrategy` (simulation) runs the child inline and always returns `completed`. `DurableDispatchStrategy` (production) persists via `DispatchPersistence`, returns `suspended`, and relies on the resume trigger (§ Production host) to continue. The two strategies share the child-result injection logic; only what happens between dispatch and result differs. (This replaces the original draft's reserved `pending`-throws scaffolding, which modelled an in-process async path that no longer fits the durable model.)

### 10.3 Capability matrix

Runtime-specific seams (driver-injected) — these genuinely differ:

| Capability | Production | Simulation |
|---|---|---|
| `persistence` | `SupabaseDispatchPersistence` | `NoopPersistence` |
| `dispatch` | `DurableDispatchStrategy` (suspend/resume) | `SyncRecurseStrategy` (in-process recursion) |
| `observability` | OTel / structured | Console |
| `rateLimit` | Token-bucket per tenant | `NoopRateLimit` |
| `logger` | Structured | Console |

Shared services (`RuntimeServices`, wired once from config) — identical in both runtimes, NOT per-runtime seams:

| Service | Implementation (both runtimes) |
|---|---|
| `mcpPool` | `BackendMcpPoolClient` |
| `loadChildAgentGraph` | Published version reader |
| `supabase` | service-role client (only the env source differs at construction: Workers binding in prod, `process.env` in the sim backend) |

### 10.4 Production host & durable resume (DB-backed)

Production runs on a **Cloudflare Worker** (`packages/worker`) with **DB-backed suspend/resume** — Supabase Postgres is the system of record for run state, reached through **Hyperdrive** (or the Supabase pooler) so stateless Workers don't exhaust connections. Chosen over Cloudflare Workflows and Durable-Object/Queue orchestration because ~1M concurrently-suspended conversations are just Postgres rows (no concurrency ceiling), it reuses the suspend/resume pattern production already implements, it is the cheapest at scale, and it stays portable (not welded to a Cloudflare primitive).

Two resume paths:

- **Human-in-the-loop (the common case).** A run suspended waiting for the next user message is resumed when that message arrives through the backend: the BE re-invokes the Worker with `continueExecutionId`; the Worker loads persisted state from Postgres via `DispatchPersistence` and continues. **No queue or external trigger** — the inbound message *is* the trigger.
- **Autonomous (child finished / timeout).** When a durable parent must resume without user action, a thin driver re-invokes the Worker: **Cloudflare Queues** (sharded across queues to meet peak throughput) or a **cron sweep over a `pending_resumes` table**. `DurableDispatchStrategy` (§10.2) writes the pending handle; the driver consumes it.

**Idempotency.** Every resume carries an idempotency key. A retried autonomous resume (queue redelivery, cron overlap, Worker restart) must not re-run a turn or re-fire a non-idempotent tool — the Worker checks the key against persisted run state before continuing.

**Requirements:** Hyperdrive/pooler in front of Postgres from day one; a Postgres tier sized for peak suspend/resume read+write throughput; idempotency keys on all resumes.

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

Works in Node and the Cloudflare Workers runtime via `@supabase/supabase-js` (pure JS/TS, no native addons — `re2js` replaces native `re2`). Imported by `packages/backend/` and `packages/worker/`.

### 11.3 `packages/backend/` changes

**New:**
```
packages/backend/src/
├── routes/internal/
│   ├── mcpInvoke.ts                     ← POST /internal/mcp/invoke
│   ├── mcpPreflight.ts                  ← POST /internal/mcp/preflight
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

The MCP OAuth machinery — `mcp/oauth/*` (`resolveAccessToken`, refresh, PKCE, registration) and the MCP-bundle resolution in `executeOAuthResolver.ts` — STAYS, and moves **inside the pool's connect path** (§7), not a runtime capability. Persistence query modules also STAY, injected via `productionCapabilities`. (The Google-only `tokenResolver.ts` was already deleted with the calendar integration.)

### 11.4 `packages/web/` (FE proxy route additions)

```
packages/web/app/api/
├── agents/[agentId]/preflight-publish/
│   └── route.ts                         ← POST → backend /internal/oauth/preflight
└── simulation/preflight/
    └── route.ts                         ← POST → backend /internal/oauth/preflight
```

Both proxy to backend with master-key auth. Used by the publish dialog and by the sim handler on first-message-of-session respectively.

### 11.5 Production Cloudflare Worker (`packages/worker/`)

Production execution moves from the Supabase Deno edge function to a **Cloudflare Worker**. Rationale: Supabase edge functions cap execution at 400s (wall-clock), which cannot hold hours-long agent runs; Workers cap CPU time, not wall-clock, so the I/O-bound agent loop (waiting on the LLM and tools) is not penalized — see § Production host. The Worker is a thin driver over the shared runtime core.

**New:**
```
packages/worker/
├── src/
│   ├── index.ts                  ← fetch handler / entry; invoked by the backend
│   ├── productionCapabilities.ts ← wires DurableDispatchStrategy, SupabaseDispatchPersistence, observability, rateLimit
│   ├── ssePublicAdapter.ts       ← maps ExecutionEvent → public SSE
│   ├── resume.ts                 ← resume entry for suspended runs (queue / Durable Object alarm / cron)
│   └── workerSupabase.ts         ← service-role client via a Workers binding (Hyperdrive or @supabase/supabase-js)
└── wrangler.toml                 ← Worker config / bindings (no WASM needed — re2js is pure JS)
```

Imports the runtime core from `packages/api` and the builtin factories from `packages/shared-store-services` — both Workers-compatible (pure JS/TS, no native addons; `re2js` replaces native `re2`). Single-tool execution (the former `execute-tool` function, used by the Play button) folds into this Worker.

**No Deno-side duplicates are re-created.** The former `execute-agent/{toolBuilder, kvStoreServices, ragStoreServices, kvQueries, ragQueries, ragSearchCores, internalApiClient, storeServices}.ts` are not ported — that logic lives once in `packages/api` + `packages/shared-store-services`.

**Deleted (legacy Supabase edge function):**
- The entire `supabase/functions/execute-agent/` and `supabase/functions/execute-tool/` Deno runtime, once the Worker is live and cut over.

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

## 13. Per-tool simulation seam

Simulation behavior is **per-tool and tool-owned** — each side-effecting builtin defines what it does in simulation via an `if (ctx.environment === 'simulation')` branch. This is the deliberate extension point, **not** duplication to be abstracted away: a KV write, a calendar booking, and a form update have genuinely different "what should this do in a simulation" answers, so each tool owns its branch.

`ctx.simulationState` / `ctx.writeSimulationState` (§6.2, §9) are available **only** inside this branch — they exist on `ProviderCtx` solely when `environment === 'simulation'`, so production tools cannot read or write simulation state by construction. Simulation state is a simulation-only concept; it never exists in production.

**Initial cut — shared default no-op.** For now, every side-effecting builtin's simulation branch returns a single shared `simulatedNoop` helper: no external side-effect, no state mutation. This unblocks the unification without implementing 20 bespoke behaviors at once, and the shared helper keeps the interim branches from drifting while they all behave identically.

```ts
import { simulatedNoop } from '@api/runtime/simulatedNoop';

async execute(args: unknown, ctx: ProviderCtx) {
  if (ctx.environment === 'simulation') {
    return simulatedNoop(args, ctx);   // interim default — replaced per tool over time
    // Eventually, each tool implements its own simulation behavior, e.g.
    //   forms.set_form_fields:
    //     ctx.writeSimulationState(`/forms/${args.formId}`, args.fields);
    //     return { ok: true, fields: args.fields };
  }
  // ... existing production logic (unchanged)
}
```

Each tool later replaces the `simulatedNoop` call with its own logic against `simulationState` — that bespoke per-tool behavior is deferred (§3), but the seam and the state model (§9) ship now.

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
3. **Phase 3:** Add the 3 new `/internal/*` backend endpoints (mcp/invoke, mcp/preflight, oauth/preflight). OAuth token *resolution* is pool-internal (§7), not a separate endpoint.
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
  - `packages/worker/src/index.ts` (Cloudflare Worker; replaces `supabase/functions/execute-agent` + `execute-tool`)
