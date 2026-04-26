# Executor refactor — plugin registry & per-mode tool resolution

**Date**: 2026-04-26
**Status**: v2 — staff-engineer + UX dual review incorporated; awaiting final user review
**Sub-projects covered**: B (plugin registry), C (workflow per-node lazy resolution), D (agent eager full-set resolution)
**Depends on**: Sub-project A (`selected_tools` storage)
**Followed by**: Sub-project E (Redis caching)
**Revisions**: see "Revisions" log at bottom.

---

## Purpose

Replace the current "every new integration adds a new param to four type definitions and two route handlers" pattern with a plugin registry. Make the registry the single point through which the executor (workflows and agents alike) resolves what tools exist, what they execute, and how they authenticate. The current code path is functional for one OAuth integration (Google Calendar) but does not scale to OF-6's CRM (HubSpot, Shopify) without further per-integration plumbing across the codebase.

## Non-goals

- Adding new OAuth providers (HubSpot, Shopify, Google Sheets) — that's OF-6 work that *consumes* this refactor.
- Redis caching of OAuth tokens, MCP `tools/list` results, or MCP session IDs — that's sub-project E.
- Workflow graph publish-time validation against the registry (today's behaviour stays: invalid graph references fail at runtime).
- Tool-selection UX for autonomous agents — sub-project A.
- Tool-search / hierarchical drill-down for very large registries — out of scope; we're committed to per-agent tool counts in the tens, not thousands.

## Success criteria

1. Adding a new built-in provider is one new folder under `packages/api/src/providers/<name>/` plus an entry in the providers index — no edits to executor params, payload types, route handlers, or `injectSystemTools`.
2. Workflows resolve a single tool per `tool_call` node, only when reaching that node — agents that never enter the node pay zero OAuth/MCP cost for that tool.
3. Autonomous agents resolve every tool referenced by `selected_tools` exactly once at execution start, in parallel across providers.
4. The edge function payload carries one generalized `oauth.byProvider` map instead of per-provider fields like `googleCalendar`.
5. Stateless backend and stateless edge function preserved — no global mutable state introduced.
6. Existing tests continue to pass after the migration; new registry-level tests cover composition, lookup, and multi-provider build.

---

## Decisions made during brainstorming

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Unified registry; MCPs are first-class providers** (option α) | Same surface for built-ins and MCPs; executor doesn't branch on provider type; lazy-resolution and observability solved once |
| Q2 | **Per-execution composition with built-ins as static module exports** (option c) | No global mutable state; safe in stateless backend + edge function; trivial to test; cross-tenant leak structurally impossible |
| Q3 (graph) | **Workflows reference tools by qualified ref** — graph schema for `tool_call` preconditions changes from `value: string` to `tool: { providerType, providerId, toolName }`. *Amended after staff-engineer review: tool-name-only is a third-party-controlled global namespace; MCP renames silently break workflows.* | One-time graph migration (curated, since no production data); aligns with sub-project A's storage shape; eliminates the global-name-uniqueness fragility |
| Q3 (agent) | **Agents reference tools by qualified ref** (`{providerType, providerId, toolName}` from sub-project A) | User-curated set; multiple providers may have overlapping names eventually; ref is unambiguous |
| Tool-name collision | **At MCP-install time, reject. At per-execution composition, prefer built-in + emit metric.** *Amended after staff-engineer review: throwing per-execution is a DOS vector — one bad MCP breaks every execution.* | Install-time fail-fast keeps the system safe; per-execution recovers gracefully if anything slipped through |
| Migration | **Big bang in one PR** | Bounded surface (4 in-tree providers), no production data, parallel code paths multiply bugs |

---

## Architecture overview

```
                      ┌─────────────────────────────┐
                      │  packages/api/src/providers │
                      │  (built-ins as exports)     │
                      │   ─ calendar                │
                      │   ─ forms                   │
                      │   ─ composition             │
                      │   ─ lead_scoring            │
                      └────────────┬────────────────┘
                                   │ (static)
                                   ▼
            ┌──────────────────────────────────────────────┐
            │   composeRegistry({ builtIns, mcpProviders })│
            │   per-execution; returns Registry view       │
            └──────────────────────┬───────────────────────┘
                                   │
                ┌──────────────────┴─────────────────┐
                │ orgMcpServers → buildMcpProviders  │
                │  (from agent.graph.mcpServers,     │
                │   already in fetched record)       │
                └────────────────────────────────────┘

Registry exposes 3 methods:
  ─ providers (read-only list)
  ─ findToolByName  (workflow path: tool_call resolution)
  ─ buildSelected   (agent path: eager full-set resolution)
  ─ describeAll     (editor catalog endpoint)

         Workflow (C, lazy)              Agent (D, eager)
              │                                │
              ▼                                ▼
    Per node with tool_call:        At execution start:
       resolve precondition.value   read selected_tools from
       → registry.findToolByName    agent record →
       → provider.buildTools(       registry.buildSelected(refs)
            [oneName], ctx)         → all tools resolved in parallel
       → pass single tool to LLM    → pass full Record<string, Tool>
                                      to executeAgentLoop
```

**Single point of truth**: built-in providers are the static module, the org's MCPs are the dynamic input, the registry is the ephemeral composition. No global mutable state. No provider knows about another.

---

## Provider & Registry interfaces

### `ProviderCtx`

The execution context every provider's methods receive. Universal fields only — anything provider-specific lives in a `services` factory that providers query for what they need.

*Amended after staff-engineer review: the previous shape (universal + per-provider optional fields) was just the param-soup with a different shape. New providers would still need to extend the struct. The factory pattern moves provider-specific data ownership out of the central type.*

```ts
interface OAuthTokenBundle {
  accessToken: string;
  expiresAt: number;        // epoch ms; lets E and circuit-breakers reason about freshness
  scopes?: string[];        // for forward-compat with scope-aware providers
  tokenIssuedAt: number;    // epoch ms
}

interface ProviderCtx {
  // Universal — always present
  readonly orgId: string;
  readonly agentId: string;
  readonly isChildAgent: boolean;
  readonly logger: Logger;

  // Per-conversation — present when invoked from a chat session
  readonly conversationId?: string;
  readonly contextData?: Readonly<Record<string, unknown>>;

  // OAuth bundle — keyed by providerId. ReadonlyMap, frozen.
  // Pre-resolved by backend; passed in payload.oauth.byProvider for the edge function.
  readonly oauthTokens: ReadonlyMap<string, OAuthTokenBundle>;

  // MCP transport configs — keyed by mcp provider UUID. ReadonlyMap, frozen.
  // Sourced from agent.graph.mcpServers; the backend never mutates after composing.
  readonly mcpTransports: ReadonlyMap<string, McpTransportConfig>;

  // Service factory — providers ask for the services they need.
  // Returns undefined when the requested service isn't available in this execution.
  // Each provider knows its own service type; the central type doesn't.
  readonly services: <T>(providerId: string) => T | undefined;
}
```

`services` is the escape hatch for provider-specific runtime dependencies. The forms provider asks `ctx.services<FormsService>('forms')`; the lead-scoring provider asks `ctx.services<LeadScoringServices>('lead_scoring')`; composition asks `ctx.services<{ apiKey: string; modelId: string }>('composition')`. Each provider declares its own `Services` type next to its `buildTools` implementation. **No provider-specific fields on `ProviderCtx`.** Adding a new built-in provider is genuinely one folder, no `ProviderCtx` edit.

The executor entry point assembles `services` from whatever it has (forms list, conversation id, lead scoring data, child-dispatch credentials). Providers ignore unrelated services.

`oauthTokens` and `mcpTransports` are `ReadonlyMap<...>` (TypeScript type) and `Object.freeze`d at construction (runtime defense). Provider implementations cannot mutate them. The "no shared state" claim becomes structurally enforced rather than convention.

`OAuthTokenBundle` carries `expiresAt`, `scopes`, `tokenIssuedAt` so sub-project E (caching) can reason about freshness, and circuit-breakers (required follow-up #4) can detect repeated near-expiry refreshes. Adding the fields now is free; bolting them on later is a payload-schema change across in-flight sessions.

### `Provider`

```ts
type ProviderType = 'builtin' | 'mcp';

interface ToolDescriptor {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;   // JSON Schema
}

interface Provider {
  type: ProviderType;
  id: string;                              // stable slug for builtin, UUID for mcp
  displayName: string;                     // for editor UI
  description?: string;                    // for provider header in UI

  /** Catalog: what tools does this provider expose? Cheap for built-ins (static),
   *  potentially network for MCPs (mitigated by E's Redis cache). */
  describeTools(ctx: ProviderCtx): Promise<ToolDescriptor[]>;

  /** Per-execution: produce ready-to-call AI SDK tools for a subset of names.
   *  Provider handles auth, MCP connection, framing internally. */
  buildTools(args: {
    toolNames: string[];
    ctx: ProviderCtx;
  }): Promise<Record<string, Tool>>;
}
```

**Two methods, two purposes.** `describeTools` is for the catalog (editor display, registry endpoint). `buildTools` is for execution — returns a tool dict in AI SDK shape that the executor can pass directly to `executeAgentLoop` / `executeWithCallbacks`.

The provider owns *all* its complexity internally: auth, MCP `initialize` handshake, `tools/list`, error mapping. The executor doesn't unpack any of that.

### `Registry`

```ts
interface RegistryBuildResult {
  tools: Record<string, Tool>;
  staleRefs: SelectedTool[];          // refs no provider could resolve
  failedProviders: Array<{
    providerType: ProviderType;
    providerId: string;
    reason: 'auth_failed' | 'timeout' | 'protocol_error' | 'unknown';
    detail: string;
  }>;
}

interface Registry {
  /** All providers in composition order. Read-only. */
  providers: ReadonlyArray<Provider>;

  /** Resolve a single tool by name (workflow path). Returns null if missing. */
  findToolByName(toolName: string): { provider: Provider; descriptor: ToolDescriptor } | null;

  /** Build executable tools for a list of qualified refs (agent path). */
  buildSelected(args: {
    refs: SelectedTool[];
    ctx: ProviderCtx;
  }): Promise<RegistryBuildResult>;

  /** Editor catalog: every provider's described tools, parallelized. */
  describeAll(ctx: ProviderCtx): Promise<Array<{
    provider: Provider;
    tools: ToolDescriptor[];
    error?: { reason: string; detail: string };  // when describeTools failed
  }>>;
}
```

`findToolByName` does an O(N×M) scan (N providers, M tools per provider) — for N≈15 total providers and M≈20 tools each, it's ~300 string comparisons. Negligible. We don't precompute an index because composition is per-execution; the cost of building the index would dominate.

`buildSelected` groups refs by provider, calls each provider's `buildTools` in parallel, merges results. Per-provider isolation: failure in one provider populates `failedProviders` without preventing others from succeeding (agent path).

### Composition

```ts
function composeRegistry(args: {
  builtIns: ReadonlyMap<string, Provider>;     // packages/api/src/providers index
  orgMcpServers: McpServerConfig[];            // from agent.graph.mcpServers
  logger: Logger;
}): Registry {
  const mcpProviders = args.orgMcpServers.map(buildMcpProvider);
  const all = [...args.builtIns.values(), ...mcpProviders];
  // findToolByName index — built once per execution, no scan per lookup
  const toolIndex = buildToolIndex(all, args.logger);   // built-in wins on collision
  return Object.freeze({
    providers: Object.freeze([...all]) as ReadonlyArray<Provider>,
    findToolByName: (name) => toolIndex.get(name) ?? null,
    describeAll: (ctx) => Promise.all(all.map(...)),
    buildSelected: ({ refs, ctx }) => /* group by qualified ref, fan out */,
  });
}
```

**Collision handling.** *Amended after staff-engineer review: throwing per-execution is a DOS vector.* The defense is split:

- **At MCP install time** (when a user adds an MCP server in the editor and runs Discover Tools): if the discovered tool list contains any name that collides with an in-tree built-in or any other MCP already installed for that org, the install is rejected with a clear error naming both sides. The user sees this immediately and can either rename in the MCP server's config or pick a different server. *This is the user-facing fail-fast.*
- **At per-execution composition** (`composeRegistry`): if a collision somehow slipped through (race between concurrent installs, schema drift on the MCP server side, etc.), the built-in wins, the colliding MCP tool is dropped from the registry, and a `registry.tool_name_conflict` metric increments with both identities. **The execution proceeds.** *This is the runtime safety net.*

The previous spec's `assertNoDuplicateToolNames` (throw at compose time) is deleted. `buildToolIndex` is the new helper — preferring built-ins on conflict, logging via the provided `logger`, returning a frozen `Map<toolName, { provider, descriptor }>`.

This solves a class of bugs where a single bad MCP install would otherwise break every tool resolution for that org. Production agents continue to function with their built-in tools intact.

### Built-in provider layout

Each built-in lives in its own folder under `packages/api/src/providers/`:

```
packages/api/src/providers/
  index.ts                  // exports the Map<string, Provider> of built-ins
  calendar/
    index.ts                // exports calendarProvider: Provider
    descriptors.ts          // returns the 7 calendar ToolDescriptors
    buildTools.ts           // takes ctx + toolNames → Record<string, Tool>
                            //   - resolves auth via ctx.oauthTokens.get('calendar')
                            //   - delegates to existing services/calendarService.ts
  forms/
    index.ts
    descriptors.ts
    buildTools.ts           // reads ctx.forms, ctx.formsService, ctx.conversationId
  lead_scoring/
    index.ts
    descriptors.ts
    buildTools.ts           // reads ctx.contextData, ctx.leadScoringServices
  composition/
    index.ts
    descriptors.ts
    buildTools.ts           // returns dispatch tools whose execute returns DispatchSentinel
                            //   - injects `finish` only when ctx.isChildAgent === true
```

The existing `tools/calendarTools.ts` factory becomes `calendar/buildTools.ts`. Same code, just plugged into the Provider interface instead of called from `injectSystemTools`. Same for forms, lead_scoring, composition.

### MCP provider builder

```ts
function buildMcpProvider(server: McpServerConfig): Provider {
  return {
    type: 'mcp',
    id: server.id,                  // UUID
    displayName: server.name,
    description: server.description,
    describeTools: async (ctx) => {
      // Calls tools/list. E will cache this in Redis keyed by (server.id, schemaVersion).
      // For now, in-memory cache for the lifetime of this provider instance (per execution).
    },
    buildTools: async ({ toolNames, ctx }) => {
      // 1. Resolve MCP session (cached by E later; per-execution otherwise)
      // 2. For each toolName, build an AI SDK tool whose `execute` calls tools/call
      // 3. Auth: ctx.oauthTokens.get(server.id) if the MCP requires OAuth
      // 4. Filter to only the requested toolNames
    },
  };
}
```

The existing `createMcpSession` / `validateAndConnectMcpServers` logic moves *into* `buildMcpProvider`. Other call sites lose direct knowledge of MCP wiring.

### Composition provider sentinel contract (special case)

`create_agent`, `invoke_agent`, `invoke_workflow`, and `finish` are **dispatch tools** — their `execute` returns a `DispatchSentinel` or `FinishSentinel` rather than a real result. The existing orchestrator (`packages/api/src/core/sentinelDetector.ts`) recognizes these and unpacks them externally to spawn child agents or terminate execution.

The registry layer treats them as ordinary tools — they conform to the `Tool` interface; the `execute` returns *something*. The orchestrator's existing sentinel detection code is unchanged. The composition provider is just where these tools live now (instead of being injected unconditionally by `injectSystemTools`).

**Selection rules** *(amended for clarity after staff-engineer review)*:

| Tool | In `selected_tools`? | Auto-injected? | Notes |
|---|---|---|---|
| `create_agent`, `invoke_agent`, `invoke_workflow` | **Yes** — gated like any other tool per A's Q3 | No | If a user wants their agent to dispatch, they check the box. |
| `finish` | **No** — never appears in `selected_tools` | **Yes**, when `ctx.isChildAgent === true` | Runtime contract: every child agent needs a way to terminate; not a user choice. |

`finish` is excluded from `selected_tools` even on child agents. It's added by the composition provider's `buildTools` regardless of selection when `ctx.isChildAgent === true`, and excluded otherwise. The frontend `ToolsPanel` filters `finish` out of the catalog before rendering, so it never appears as a selectable option. This matches A's spec: tools the user doesn't pick aren't in `selected_tools`.

If a user somehow ends up with `finish` in their `selected_tools` (manual JSON edit, prior-version data), the composition provider's `buildTools` ignores the entry on a non-child agent and adds `finish` only when `isChildAgent === true`. The entry is treated as stale on non-child agents and surfaced in the editor's Stale group.

### Sub-agent tool inheritance

When a parent agent calls `create_agent({ tools: 'all' | string[] })`, the child agent's tool surface is computed at dispatch time:

- `tools: 'all'` → child's `selected_tools` = parent's resolved set at dispatch time. (For workflow parents — which don't have `selected_tools` — this means the tool of the dispatching node, plus composition tools the workflow node could itself reach. Effectively a one-tool inheritance for workflows.)
- `tools: ['name1', 'name2']` → child's `selected_tools` = subset matching the requested names against the parent's resolved set. Names not found are dropped, with a *visible* warning (not silent) — see the debug surface below.
- Child's `ProviderCtx` inherits parent's `oauthTokens` and `mcpTransports` directly.

Child's `isChildAgent` flag is true, so the composition provider injects `finish` for them.

Same logic for `invoke_agent` and `invoke_workflow` — they accept an optional `tools` parameter; if omitted, the invoked agent uses its own `selected_tools`.

#### Token-refresh-on-inherit

*Amended after staff-engineer review.* If a parent agent runs for an extended period, the inherited `oauthTokens` may carry tokens that have expired by the time the child runs. The child cannot transparently refresh — it has no DB access (stateless edge function).

Resolution: each `OAuthTokenBundle` carries `expiresAt`. At child-dispatch time, the orchestrator compares each token's `expiresAt` against the current time + a safety margin (60 s). For any token nearing expiry, the orchestrator either:

- Calls back to the backend to refresh (preferred — single round-trip in the parent execution flow), or
- Marks the token as `'expired'` in the child's bundle so the child provider's `buildTools` fails fast with `auth_failed` reason (the child agent then degrades — same semantics as agent path).

Sub-project E will fold this into its caching layer; for now, the orchestrator handles it inline.

#### Debug surface for child dispatch

*Amended after UX review.* The user has no way to see what tools a child agent actually receives without running and reading raw logs. Resolution: every child-dispatch event emits a structured run-trace entry consumed by the simulator and the agent's run-history view:

```ts
{
  type: 'child_dispatched',
  parentDepth: number,
  childDepth: number,
  toolName: 'create_agent' | 'invoke_agent' | 'invoke_workflow',
  resolved: {
    tools: SelectedTool[];          // what the child actually got
    droppedFromInherit: SelectedTool[]; // names requested by `tools` arg but not in parent's set
    inheritStrategy: 'all' | 'subset' | 'own';
  };
}
```

The simulator panel renders this as an inline expansion under the dispatch event: *"Child dispatched with 3 tools: x, y, z. Dropped: w (not in parent's selection)."* Production agent run logs include the same payload.

This makes the inheritance contract observable instead of having to be reasoned about from documentation.

---

## Workflow path (sub-project C — lazy per-node)

### Today

The state machine traverses a graph. When entering a node whose outgoing edge has a `tool_call` precondition, the executor needs that tool. Currently all tools are pre-built and passed in via `executeWithCallbacks(toolsOverride: ...)` — wasteful: every LLM call carries the full tool dict, even though only one tool is reachable from the current node.

### Graph schema change

*Amended after staff-engineer review.* The current `Precondition` schema uses `value: string` for all precondition types. For `tool_call` specifically, that string is the tool name — putting workflows at the mercy of MCP-side renames and global-name-uniqueness. The new schema makes `tool_call` preconditions reference the tool by qualified ref:

```ts
// Before
{ type: 'tool_call', value: 'check_availability', toolFields?: ... }

// After
{ type: 'tool_call', tool: { providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' }, toolFields?: ... }
```

Implementation: convert `PreconditionSchema` to a Zod discriminated union on `type`. Existing `value` semantics for `user_said` and `agent_decision` unchanged.

**Migration**: there is no production data; only seed JSON files under `packages/web/app/data/`. Curate those by hand (small surface) to use the new shape. Sub-project A's seed-curation pass already exists; this rolls into the same step. Existing Zod validation rejects the old `value` shape on `tool_call` after migration — surfaced by typecheck if any seed is missed.

### After refactor (executor)

The executor receives a `Registry` instance + `ProviderCtx` instead of a pre-built tool dict. At each LLM-call step:

```ts
async function resolveToolsForCurrentNode(args: {
  registry: Registry;
  ctx: ProviderCtx;
  currentNodeOutgoingEdges: Edge[];
}): Promise<{ tools: Record<string, Tool>; toolName: string | null }> {
  const toolCallEdge = args.currentNodeOutgoingEdges.find((e) =>
    e.preconditions?.[0]?.type === 'tool_call'
  );
  if (toolCallEdge === undefined) {
    return { tools: {}, toolName: null };
  }

  const ref = toolCallEdge.preconditions[0].tool;  // { providerType, providerId, toolName }
  const provider = args.registry.providers.find(
    (p) => p.type === ref.providerType && p.id === ref.providerId
  );
  if (provider === undefined) {
    throw new ExecutionError({
      kind: 'provider_not_in_registry',
      providerType: ref.providerType,
      providerId: ref.providerId,
      toolName: ref.toolName,
      // Note: NO availableNames field. *Amended after review:* describeTools for
      // every provider in an error path = N network round-trips for diagnostics.
      // Logged identifiers are enough for support; the user-facing error is short.
    });
  }

  const built = await provider.buildTools({ toolNames: [ref.toolName], ctx: args.ctx });
  return { tools: built, toolName: ref.toolName };
}
```

This runs **at the moment we're about to call the LLM for that step**, not at execution start. Implications:

- Steps without `tool_call` edges incur **zero** OAuth/MCP cost.
- An MCP for tool X is connected only when entering the node that uses tool X.
- If the node never executes (graph branches elsewhere), the cost is never paid.

### LLM call shape

```ts
const result = await executeAgentLoop({
  ...,
  tools: builtTools,          // { [toolName]: tool }   — exactly one tool, or zero
  ...
});
```

Single-entry tools dict: the LLM essentially can't do anything other than call that tool. This is the desired semantic — workflows are deterministic at each node.

### Where this gets wired in

| File | Change |
|---|---|
| `packages/api/src/core/...` (state machine) | New hook: at each LLM-call step, call `resolveToolsForCurrentNode`. Registry passed via `Context`. |
| `simulateHandler.ts` | Builds `Registry` via `composeRegistry` once at simulation start; passes through Context. Drops `injectSystemTools`. |
| `simulationOrchestrator.ts` | Same. |
| `supabase/functions/execute-agent/index.ts` (workflow branch — `runWorkflowExecution`) | Same. Constructs registry from payload; passes through. |

### Latency profile

A workflow with N `tool_call` nodes pays each node's resolution cost only when reached. Each per-node cost is bounded by the slowest of:
- OAuth lookup + decrypt + (rare) refresh — typically 5–500 ms cold, <5 ms warm under E
- MCP `initialize` + `tools/list` — typically 200–800 ms cold, <5 ms warm under E

After E lands, this is unobservable per node. Before E lands, it's a per-node tax. Tradeoff accepted: the savings dominate when MCPs are used in only some branches; in the worst case (every node uses fresh MCP), this is N× the all-upfront cost. Workflows are not in tight loops — acceptable.

### Token-cost win

Previously the LLM saw every available tool's schema on every step (50+ entries). Now it sees 0 or 1. Substantial reduction in prompt tokens per step.

---

## Agent path (sub-project D — eager full set)

### Today (gap)

Sub-project A made `selected_tools` available on the agent record. Earlier wiring in `simulateHandler.ts` and `simulationOrchestrator.ts` always injects calendar (when configured) regardless of selection, and `injectSystemTools` exposes every always-on tool. There's no per-agent gating in the live executor.

### After refactor

At execution start (before the first LLM call):

```ts
async function buildAgentToolsAtStart(args: {
  registry: Registry;
  ctx: ProviderCtx;
  selectedTools: SelectedTool[];   // from agent record (sub-project A)
}): Promise<RegistryBuildResult> {
  if (args.selectedTools.length === 0) {
    return { tools: {}, staleRefs: [], failedProviders: [] };
  }

  const result = await args.registry.buildSelected({
    refs: args.selectedTools,
    ctx: args.ctx,
  });

  for (const stale of result.staleRefs) {
    args.ctx.logger?.warn('agent_tools.stale_drop', { /* per A's spec */ });
  }
  for (const failed of result.failedProviders) {
    args.ctx.logger?.warn('provider.build_tools.failure', { ...failed });
  }

  return result;
}
```

The agent loop receives the full tools dict and uses it for every step:

```ts
const { tools } = await buildAgentToolsAtStart(...);
const result = await executeAgentLoop({ ..., tools, ... });
```

### Why eager (and not lazy like workflows)

Workflows know which tool comes next from the graph. Agents are autonomous — the LLM picks. So the LLM must **see** all available tools' schemas at every step to choose. Lazy resolution doesn't fit. Eager is the only correct strategy for D.

What this *doesn't* mean: it doesn't mean every tool's MCP needs an active TCP connection at start time. The provider's `buildTools` produces tool *definitions* (description + schema + an `execute` closure) at start. The actual MCP `tools/call` happens inside `execute`. What we resolve eagerly is: token + tool schemas. Not an open TCP connection per MCP.

### Stale-entry handling

Per sub-project A: silently dropped + logged. Continued execution with a smaller surface. The editor's "Stale entries" group is the user-facing recovery path.

### Per-provider isolation on failure

If provider X's `buildTools` rejects (auth failed, MCP down), provider Y's tools still produce. The LLM sees a partial surface. Failed providers populate `failedProviders` for observability.

This is intentionally *different* from workflows: workflow `tool_call` referencing a failed provider fails the run (the graph's intent at that node is unambiguous). Agents degrade gracefully — they have alternatives.

### Empty selected_tools optimization

```ts
if (selectedTools.length === 0) {
  return { tools: {}, staleRefs: [], failedProviders: [] };
}
```

Agents with empty selection skip the registry entirely — no DB hit, no MCP discovery. Real cost saving across the platform: every agent created and abandoned mid-config costs nothing at execution.

### Where this gets wired in

| File | Change |
|---|---|
| `supabase/functions/execute-agent/index.ts` (`runAgentExecution`) | Replace `injectSystemTools(...)` with `buildAgentToolsAtStart`. |
| `simulateHandler.ts` (when simulating an agent) | Same. |
| `simulationOrchestrator.ts` (root agent path) | Same. |
| `executeAgentPath.ts` (currently dead code) | **Delete.** Confirmed unused; removing now removes confusion. |

### Generalized edge function payload

```ts
interface OAuthTokenBundle {
  accessToken: string;
  expiresAt: number;
  scopes?: string[];
  tokenIssuedAt: number;
}

interface ExecuteAgentParams {
  // ... existing ...
  selectedTools?: SelectedTool[];                              // for agents only
  oauth?: { byProvider: Record<string, OAuthTokenBundle> };
  // mcpServers already flows via graph.mcpServers
}
```

The previous `googleCalendar?: { accessToken, orgId }` field is removed; calendar's token now lives at `oauth.byProvider['calendar']` as a full `OAuthTokenBundle`. Backend pre-resolves all OAuth tokens for selected providers and packs them with their freshness metadata.

*Amended after staff-engineer review:* the bundle carries `expiresAt`, `scopes`, `tokenIssuedAt` from the start. Reasoning:
- Sub-project E (caching) needs `expiresAt` to compute cache TTLs.
- Required follow-up #4 (circuit-breakers) needs token freshness to detect refresh thrashing.
- `scopes` is forward-compat for scope-aware providers (e.g. distinguishing `calendar.readonly` from `calendar`).
- Adding fields to a payload schema later means a coordinated rollout across in-flight sessions; doing it now is free.

---

## Frontend tool catalog endpoint

The editor's `ToolsPanel` needs to know what tools exist for an agent. Today it computes this locally (frontend toolRegistry merging static built-ins + frontend MCP discovery). Post-refactor, the runtime registry is the source of truth — they must not drift.

### Decision: new endpoint backed by the runtime registry

```
GET /agents/:agentId/registry                 (gated by requireAuth)
Resp: 200 {
  providers: Array<{
    type: 'builtin' | 'mcp';
    id: string;
    displayName: string;
    description?: string;
    tools: ToolDescriptor[];
    error?: { reason: 'auth_required' | 'unreachable' | 'timeout' | 'circuit_open' | 'rate_limited' | 'unknown'; detail: string };
  }>;
}
       403 user not in agent's org
       404 agent not found
       5xx transient (caller must distinguish — see "Frontend states" below)
```

The handler:
1. Loads the agent record (for `graph.mcpServers`).
2. Composes the runtime registry as the executor would.
3. Calls `registry.describeAll(ctx)` with a minimal `ProviderCtx` (no OAuth tokens — `describeTools` for built-ins is static; for MCPs it calls `tools/list`, which most servers allow without auth).
4. Returns the result.

Per-provider failure (`describeTools` rejects, MCP unreachable, OAuth-required for `tools/list`) populates that provider's `error` field. The catalog **still returns 200**; only the affected provider entry has `error`. Required follow-up #4 (circuit breaker) and #8 (rate limiting) feed into this same field with `reason: 'circuit_open' | 'rate_limited'`.

### Frontend states (the three states UX review surfaced)

The frontend hook produces a discriminated state — the panel must render each differently. Conflating them is a real data-loss UX path (user removes selections thinking they're stale when registry just failed to load).

| State | Trigger | Panel behaviour |
|---|---|---|
| `loaded` | 200 with no per-provider errors | Render normally. Sub-project A's stale-entries diff (selections vs registry) is meaningful. |
| `partial-failure` | 200 with one or more provider entries having `error` | Render the providers that loaded normally. For each provider with `error`: render the header with its `displayName`, an inline `Couldn't load tools — retry` text-button (matches A's `Failed — retry` pattern), and any of the user's previously-selected tools from this provider as **disabled-but-checked rows** (not stale). **Critical: the stale-entries diff EXCLUDES providers in error state** — those entries are not stale, they're un-introspectable. |
| `total-failure` | 5xx or network error from `GET /agents/:id/registry` | Replace the entire tool list with a retryable error state. **Disable the save path** — auto-save is suspended until the registry loads. **Do NOT compute stale entries** — that diff is meaningless without ground truth. |

```ts
type RegistryState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: RegistryResponse }
  | { kind: 'partial-failure'; data: RegistryResponse; failedProviders: string[] }
  | { kind: 'total-failure'; reason: string };
```

`ToolsPanel` switches on this. Sub-project A's `useDebouncedCallback` save path takes a `disabled` flag set true on `total-failure`.

### Frontend integration

`packages/web/app/lib/toolRegistry.ts` is deleted. Replaced by `useAgentRegistry(agentId)` hook (in `packages/web/app/hooks/useAgentRegistry.ts`):

```ts
function useAgentRegistry(agentId: string): RegistryState {
  // SWR-backed fetch with 5-min stale-while-revalidate
  // Revalidate on panel-open and on manual refresh
  // Maps HTTP errors and per-provider error fields into the discriminated state above
}
```

### Caching

**Backend in-process LRU**: the catalog endpoint maintains a 60-second LRU keyed by `(orgId, mcpServerId)` for `tools/list` results. *Amended after staff-engineer review: pre-E, an editor SWR loop revalidating every 5 min per open tab can hammer external MCP servers.* The 60s LRU absorbs editor traffic without changing user-perceived freshness.

**Frontend SWR**: 5-minute stale-while-revalidate. Plus revalidate-on-panel-open: when the user opens `ToolsPanel`, force a revalidation. This catches the case "MCP installed in another tab, panel doesn't show it for up to 5 min."

**Future (E)**: replace the in-process LRU with Redis. Schema-version invalidation (required follow-up #5) lives there.

### Provider description display

Each provider has `displayName` (required) and `description` (optional). Per sub-project A's UI spec: rendered as muted text under the provider name (one line, truncate). `description` from MCP servers is user-supplied — stripped to plain-text, single-line, truncate with `title` attribute on overflow. Markdown in `description` is **not** rendered.

---

## Migration from current code

Big-bang migration in one PR, ordered:

### What gets deleted

- `injectSystemTools` (function, callers, tests). Replaced by `composeRegistry` + per-mode helpers.
- `RESERVED_TOOL_NAMES` constant — replaced by `assertNoDuplicateToolNames` invariant inside `composeRegistry`.
- Per-feature param threading: `calendarServices`, `formsServices`, `leadScoringServices`, `googleCalendar` payload field — collapsed into `oauth.byProvider` map + `Registry` instance + `ProviderCtx`.
- `executeAgentPath.ts` (currently dead code).
- Frontend `packages/web/app/lib/toolRegistry.ts` static computation — replaced by the new endpoint hook.

### What gets renamed / moved

| From | To |
|---|---|
| `packages/api/src/tools/calendarTools.ts` | `packages/api/src/providers/calendar/buildTools.ts` |
| `packages/api/src/tools/calendarToolsExecute.ts` | `packages/api/src/providers/calendar/execute.ts` |
| `packages/api/src/tools/calendarToolsDescription.ts` | `packages/api/src/providers/calendar/descriptors.ts` |
| `packages/api/src/tools/formsTools.ts` | `packages/api/src/providers/forms/buildTools.ts` |
| `packages/api/src/tools/leadScoringTools.ts` | `packages/api/src/providers/lead_scoring/buildTools.ts` |
| `packages/api/src/tools/dispatchTools.ts` + `finishTool.ts` | `packages/api/src/providers/composition/buildTools.ts` |
| `packages/api/src/tools/systemToolInjector.ts` | **Deleted.** |
| `packages/api/src/services/calendarService.ts` | Unchanged — provider's buildTools imports it. |
| `packages/api/src/google/calendar/*` | Unchanged — provider's buildTools imports the existing service. |

### What stays the same

- DB schema (`oauth_connections`, `agents.selected_tools`, etc.).
- MCP transport layer (`createMcpSession`, OAuth flow).
- All Zod schemas + descriptions for individual tools.
- AI SDK contract (`Record<string, Tool>` going into the agent loop).
- Sentinel detection in `core/sentinelDetector.ts`.

### Order of operations within the PR

1. Create `packages/api/src/providers/<name>/` folders with provider exports.
2. Add `composeRegistry`, `Provider`, `Registry`, `ProviderCtx` types and helpers.
3. Add `findToolByName`, `buildSelected`, `describeAll` registry methods + tests.
4. Add `resolveToolsForCurrentNode` (workflow per-node) + `buildAgentToolsAtStart` (agent eager).
5. Update executor entry points (`simulateHandler`, `simulationOrchestrator`, edge function) to construct registry, drop old params.
6. Add `GET /agents/:agentId/registry` route.
7. Replace frontend `buildToolRegistry` with the new hook.
8. Delete `injectSystemTools`, `RESERVED_TOOL_NAMES`, `executeAgentPath.ts`.
9. Update tests.

Each step compiles green; the PR is reviewable as a coherent unit.

### In-flight conversation cutover

When this ships, anyone with a live agent session at deploy time has their next turn run through the new path. The system prompt is unchanged. Tool surface may differ:
- **Workflows**: graph hasn't changed; tool_call nodes still resolve. ✓
- **Agents with `selected_tools` populated**: existing tools surface correctly. ✓
- **Agents with empty `selected_tools` (default for unmigrated)**: suddenly have no tools. ✗

**Mitigation policy**: before deploy, drain or migrate seed/demo agents that need tools. Production has no users today, so this is the deploy window. After production rollout, the empty-default change should be paired with a backfill migration if any user agents exist by then.

---

## Error handling

| Failure | Where it occurs | Response |
|---|---|---|
| Duplicate tool name discovered at MCP install | MCP install / Discover Tools flow | **Reject the install** with a clear error naming both sides; user can rename in MCP server config or pick a different server. *Amended after review.* |
| Duplicate tool name slips through to `composeRegistry` | Per-execution composition | **Built-in wins, MCP tool dropped, increment `registry.tool_name_conflict`, log warning.** Execution proceeds. *Amended: previously threw; that was a DOS vector.* |
| Workflow node references unknown provider/tool | `findToolByName`-equivalent returns null in C's resolver | Throw `ExecutionError({ kind: 'provider_not_in_registry', providerType, providerId, toolName })`. Run fails. **No `availableNames` field** — that would trigger N×describeTools network calls in the error path. |
| Agent has stale `selected_tools` entries | `buildSelected` returns them in `staleRefs` | Silent drop + `agent_tools.stale_drop` warning per A's spec. Execution continues. Run output also surfaces drops (see "Stale-entry visibility" below). |
| OAuth token resolution fails for a provider in C (workflow per-node) | Inside `provider.buildTools` | Throw. Workflow fails at the node with `{ providerType, providerId, kind: 'auth_failed' }`. **No silent skip** — workflow intent is unambiguous. |
| OAuth token resolution fails for a provider in D (agent eager) | Inside `provider.buildTools` during `buildSelected` | Provider's slice rejects; populates `failedProviders`. Other providers succeed. Agent runs with partial surface. Logged. |
| OAuth token nearing expiry at child-dispatch time | Orchestrator inspects `oauthTokens[*].expiresAt` | Refresh via callback to backend, OR mark `'expired'` in child bundle so child's provider fails fast with `auth_failed`. Documented under "Token-refresh-on-inherit." |
| MCP `tools/list` fails (timeout, server error) in D | Inside MCP provider's `buildTools` | Same as OAuth failure: provider's slice rejects; others succeed; logged. |
| MCP `tools/call` fails at execute-time | Inside the tool's `execute` closure | Returned to LLM as tool-call error. Standard AI SDK pattern. Agent loop continues. |
| Provider's `describeTools` fails during `describeAll` (catalog endpoint) | Per-provider try/catch in `describeAll` | That provider's entry has `error: { reason, detail }`; catalog still 200s; others return normally. **Editor renders as "couldn't load — retry" row, not as stale.** |
| Catalog endpoint itself returns 5xx / network failure | Frontend hook catches | `total-failure` state. Panel disables save + suppresses stale-entry diff. User sees retryable error. *Amended after UX review.* |
| Network partition mid-execution | Inside `execute` of any tool | Surface to LLM as tool error. |
| `finish` rule on non-child agent | Composition provider's `buildTools` | Excluded from output; selectable boxes for `finish` never reach `selected_tools` because the editor filters it out of the catalog. Stray entries get treated as stale. |

### Asymmetry: workflow auth failure vs agent auth failure

- **Workflow**: failed auth = run fails. Graph said "this tool at this node"; we can't pretend that didn't happen.
- **Agent**: failed auth = degraded surface, run continues. LLM has alternatives.

Intentional. Means a workflow with a misconfigured provider is harder to ship than the equivalent agent — mitigated by graph-publish-time validation (required follow-up #2).

#### Communicating the asymmetry in the editor

*Amended after UX review.* A user with both modes will see the same broken provider behave two different ways. The editor must communicate this so it isn't a discovery-by-failure event.

In **agent mode** (`ToolsPanel` showing checkboxes), each provider with `error` set in the catalog response gets an inline note under its header:

> ⚠ Couldn't load tools — retry. *Workflows using this provider will fail at runtime.*

In **workflow mode** (read-only `ToolsPanel`), each provider with `error` gets the inverted note:

> ⚠ Couldn't load tools. *Agents using this provider will degrade silently.*

Both notes are translated and use the muted-warning treatment from sub-project A's spec.

### Stale-entry visibility (executor → editor coupling)

*Amended after UX review.* A's spec surfaces stale entries in the editor on next registry refresh. Combined with B's 5-min SWR cache, the user-visible window is up to 5 minutes after a runtime drop. For technical users debugging "why didn't my agent call X?", that's a long blind spot. Two complementary surfaces:

1. **Run output**: the simulator and production agent run-history record dropped tools per execution. UI surface: "Run dropped 1 selected tool: `mcp:hubspot:create_deal` (provider unavailable)." Maps to the existing `agent_tools.stale_drop` metric per A's spec; the UI just consumes the same data.
2. **Registry revalidation on panel open**: SWR config sets `revalidateOnMount: true` for `useAgentRegistry`. Opening the editor panel forces a fresh fetch.

Together: a user who runs an agent, sees a dropped tool in the output, and clicks back to the editor will see the up-to-date registry without waiting for SWR's natural refresh.

### What we explicitly don't do

- **No retries inside the registry.** Provider failures bubble up. Retries (if any) live at the executor level where policy can be context-aware.
- **No fallback chains.** Agent's `selected_tools` is intent; no second-guessing.
- **No partial-success bubble-back mid-workflow.** A workflow that fails one node fails the run. No skip-and-continue.

---

## Observability

Builds on sub-project A's metrics. Runtime additions:

| Metric | Type | Tags | Purpose |
|---|---|---|---|
| `registry.compose.latency_ms` | histogram | — | Per-execution composition time. Should stay <1 ms; alert on spikes. |
| `provider.describe_tools.latency_ms` | histogram | `providerType`, `providerId`, `cache_state` (`cold`, `warm`) | MCP `tools/list` latency, split by cache state. Pre-E it's all `cold`; post-E the warm/cold split is the cache-effectiveness signal. *Amended after review.* |
| `provider.build_tools.latency_ms` | histogram | `providerType`, `providerId`, `cache_state` (`cold`, `warm`) | End-to-end provider preparation, split by cache state. |
| `provider.build_tools.failure` | counter | `providerType`, `providerId`, `reason` (`auth_failed`, `timeout`, `protocol_error`, `circuit_open`, `rate_limited`, `unknown`) | Per-provider failure rates. Identifies bad providers before users complain. |
| `registry.tool_name_conflict` | counter | `nameInBuiltin`, `nameInMcp`, `orgId` | Per-execution conflicts (built-in wins, MCP dropped). Should be zero — non-zero means an MCP install slipped past the install-time check. |
| `registry.find_tool.miss` | counter | `providerType`, `providerId`, `toolName`, `orgId` | Workflow node referenced an unknown provider/tool. Early signal of staleness or graph drift. *Added after review.* |
| `agent_tools.stale_drop.count` (from A) | counter | `providerType`, `providerId` | Cross-referenced with `provider.build_tools.failure` to distinguish "tool gone" from "provider broken". |
| `agent_tools.partial_failure_rate` | gauge | `orgId` | Fraction of agent executions completing with `failedProviders.length > 0`. Long-tail signal of degraded user experience. *Added after review.* |

### Backing system

Use whatever the project already uses (verify during planning). If nothing is in place, structured logs via the existing logger (`packages/backend/src/logger.ts`) are sufficient for now — metric names follow the conventions above so they can be extracted by log-based metrics tooling. Migration to a dedicated metrics backend (OpenTelemetry, statsd, etc.) is its own concern.

---

## Testing

### Unit tests (`packages/api`)

**`composeRegistry`** — pure function:
- Empty MCP overlay → registry contains exactly the built-ins.
- Built-in + non-conflicting MCP → both present.
- Built-in name collision (two built-ins exporting `set_form_fields`) → throws (developer error; in-tree only).
- MCP tool name collides with built-in → built-in wins, MCP tool dropped, `registry.tool_name_conflict` counter incremented, warning logged. **Does NOT throw.** *Amended after review.*
- MCP tool name collides with another MCP → first wins, second dropped, same metric + log.
- `findToolByName` finds the resolved provider; returns null for unknown names.

**`composeRegistry` performs no I/O** — *new test, required after review*:
- Mock all providers to record any `describeTools` / `buildTools` calls. Compose the registry with 10 built-ins + 5 MCPs. Assert: zero method calls on any provider; zero network or DB activity. Guards the central performance + statelessness claim.

**`composeRegistry` returns frozen output** — *new test*:
- Compose, then attempt to mutate `registry.providers`, `oauthTokens`, etc. Assert: TypeError thrown (frozen) or the mutation is invisible to a separately-composed registry.

**`registry.buildSelected`**:
- All refs resolve to one provider → one `buildTools` call, merged result.
- Refs span 3 providers → 3 parallel `buildTools` calls, merged result.
- Stale ref → returned in `staleRefs`, others succeed.
- Provider X's `buildTools` rejects → populates `failedProviders`; provider Y unaffected.
- Empty refs → returns empty result without invoking any provider.

**`registry.describeAll`**:
- All providers succeed → all entries returned with tools.
- One provider's `describeTools` rejects → entry has `error` field; others returned normally.

**Per-provider built-in tests** (existing tests for calendar/forms/lead_scoring move with the files):
- `descriptors` returns expected `ToolDescriptor[]`.
- `buildTools(['name'], ctx)` returns a `Record` with that key, expected description, schema, execute behaviour.
- `buildTools` for a name not exposed → returns `{}` (provider doesn't error; registry handles unknown names higher up).

**Composition provider**:
- `buildTools` with `isChildAgent: false` → no `finish` tool in result.
- `buildTools` with `isChildAgent: true` → `finish` always included regardless of selection.
- Sub-agent inheritance: `tools: 'all'` resolves to parent's set.
- Sub-agent inheritance: `tools: ['name']` filters parent's set; missing names dropped with warning.

**MCP provider builder** — fake transport:
- `describeTools` calls fake `tools/list`; result wired correctly.
- `buildTools` produces tools whose `execute` calls fake `tools/call` with correct args.

### Integration tests (`packages/backend`)

**Workflow path (C)**:
- Graph with one `tool_call` node pointing at calendar tool. End-to-end run resolves only that tool. Spy verifies forms/lead_scoring providers untouched.
- Graph with no `tool_call` edges → no provider prepared at all.
- Graph with `tool_call` referencing unknown name → run fails with structured error.
- Graph with `tool_call` referencing a tool whose provider's auth fails → run fails (no graceful degradation).

**Agent path (D)**:
- Agent with `selected_tools` referencing 2 built-ins + 1 MCP. End-to-end run; LLM receives all 3 tool defs.
- Agent with empty `selected_tools` → registry not invoked; LLM receives empty `tools`.
- Agent with one stale ref → `staleRefs` logged; remaining tools work.
- Agent with one failed provider (mocked OAuth refresh failure) → `failedProviders` populated; others work.

**Catalog endpoint**:
- `GET /agents/:agentId/registry` returns expected structure.
- Provider whose `describeTools` fails → entry has `error` field; others normal.
- 403 for non-org user; 404 for missing agent.

**Edge function payload**:
- Backend pre-resolves OAuth, payload contains `oauth.byProvider` keyed correctly.
- Provider whose token can't be resolved at backend-time → omitted from payload; edge function logs.

### What we don't test

- State machine traversal logic (existing test surface).
- Real MCP servers — fake transports cover the contract.
- Real Google Calendar — covered at service layer.
- Concurrency — composition is per-execution, no shared state.
- Browser visual UI — sub-project A's surface.

### Forward-pointing tests for sub-project E

- Cache hit/miss for `describeTools`.
- Cache invalidation on MCP server schema-version change.
- Token cache TTL expiry triggers refresh.

Flagged here; not built in B+C+D.

### Test file naming

Match existing convention (`<file>.test.ts` next to source).

```
packages/api/src/providers/__tests__/
  composeRegistry.test.ts
  registry.findToolByName.test.ts
  registry.buildSelected.test.ts
  registry.describeAll.test.ts
packages/api/src/providers/calendar/__tests__/
  buildTools.test.ts
  descriptors.test.ts
packages/api/src/providers/composition/__tests__/
  buildTools.test.ts
  childAgentInheritance.test.ts
(etc.)
```

---

## Files touched

| Path | Change |
|---|---|
| `packages/api/src/providers/index.ts` (new) | Exports `Map<string, Provider>` of built-ins |
| `packages/api/src/providers/registry.ts` (new) | `composeRegistry`, `Registry`, `ProviderCtx`, `Provider`, `ToolDescriptor` types + helpers |
| `packages/api/src/providers/calendar/{index,descriptors,buildTools}.ts` (new) | Calendar provider |
| `packages/api/src/providers/forms/{index,descriptors,buildTools}.ts` (new) | Forms provider |
| `packages/api/src/providers/lead_scoring/{index,descriptors,buildTools}.ts` (new) | Lead scoring provider |
| `packages/api/src/providers/composition/{index,descriptors,buildTools}.ts` (new) | Composition (dispatch + finish) provider |
| `packages/api/src/providers/mcp/buildMcpProvider.ts` (new) | MCP provider builder (consumes existing MCP transport) |
| `packages/api/src/providers/__tests__/...` (new) | Registry tests |
| `packages/api/src/tools/{calendarTools,formsTools,leadScoringTools,dispatchTools,finishTool,systemToolInjector}.ts` | **Delete.** Logic moved to providers. |
| `packages/api/src/core/...` (state machine) | New hook for per-step tool resolution |
| `packages/api/src/index.ts` | Replace tool factory exports with provider exports |
| `packages/backend/src/routes/execute/edgeFunctionClient.ts` | `ExecuteAgentParams` updated: `selectedTools`, `oauth.byProvider`; remove `googleCalendar` |
| `packages/backend/src/routes/execute/executeCoreHelpers.ts` | Generalize OAuth resolution: iterate `selected_tools` providers, batch token fetch |
| `packages/backend/src/routes/simulateHandler.ts` | Construct `Registry` + `ProviderCtx`; drop `injectSystemTools` |
| `packages/backend/src/routes/simulationOrchestrator.ts` | Same |
| `packages/backend/src/routes/agents/getRegistry.ts` (new) | `GET /agents/:agentId/registry` handler |
| `packages/backend/src/routes/agents/agentRouter.ts` | Mount registry route |
| `packages/backend/src/routes/execute/executeAgentPath.ts` | **Delete.** |
| `supabase/functions/execute-agent/index.ts` | Construct registry from payload; replace `injectSystemTools` calls; consume new payload fields |
| `packages/web/app/lib/toolRegistry.ts` | **Delete.** Replaced by new hook. |
| `packages/web/app/hooks/useAgentRegistry.ts` (new) | SWR-backed hook calling `GET /agents/:agentId/registry` |
| `packages/web/app/components/panels/ToolsPanel.tsx` | Consume `useAgentRegistry` instead of computing locally |
| `packages/web/app/components/ToolRegistryProvider.tsx` | Update to use the new hook (or delete if no longer needed) |

---

## Required follow-ups (not optional)

The items below are **not "known limitations" to live with.** Each one is a hard obligation that must be resolved before its **Resolution gate**. Shipping past the gate without resolving the item is a bug, not a tradeoff.

These are listed here — and not just deferred to issue trackers — because they are coupled to this refactor's design choices. If they are forgotten, the refactor's correctness assumptions break in production.

| # | Obligation | Resolution gate (must be done before…) | Owner / mechanism |
|---|---|---|---|
| 1 | **Implement OAuth providers beyond `calendar`** (`hubspot`, `shopify`, `google_sheets` as new folders under `packages/api/src/providers/`). The registry's design is meaningless if no second provider proves the abstraction works. | OF-6 (CRM integrations) ships. | The OF-6 issue must explicitly name the engineer responsible at sprint planning — "OF-6 owners" is hand-waving until a person is named. *Amended after staff-engineer review.* The first non-calendar provider doubles as validation that the registry's abstraction is correct — if it isn't, surface the problem and revise the registry, not the provider. |
| 2 | **Workflow publish-time validation against the org's registry.** A workflow with `tool_call` referencing a tool that no provider can supply must fail at publish, not at runtime. The runtime fail-fast in this spec is a defense-in-depth backstop, **not** a substitute for editor validation. **Pre-#2 mitigation** *(added after UX review)*: the workflow editor's read-only `ToolsPanel` should surface stale `tool_call` references on each node, mirroring sub-project A's stale-entries group on the agent side. Small lift now; prevents shipping-broken-workflows class of bug. | First user-published workflow that uses `tool_call` nodes (production rollout). | Graph editor team. Required before workflows leave internal use. Track as a blocking issue at production-rollout planning. |
| 3 | **Redis caching for OAuth tokens, MCP `tools/list`, and MCP session IDs.** Per-execution resolution is acceptable for early adoption; at projected production load (25k+ executions/day) it is not. The latency math in the workflow path (200–800 ms cold-resolution per node) becomes a user-visible problem at scale. | Production load > 5k executions/day OR any MCP usage where users perceive latency. | Sub-project E. Specified as the next spec in this brainstorming series. |
| 4 | **Circuit-breaker for misbehaving MCPs.** A hot-looping `tools/list` failure cannot be allowed to consume backend or edge-function CPU per-execution forever. Pattern: track per-(org, mcp) failure rate; trip a 5-minute breaker when the rate crosses a threshold; degrade to "MCP unavailable" with a logged warning. | Multi-tenant production scale (more than ~10 active orgs using MCPs). | Implement inside `buildMcpProvider` (per-provider state in Redis or short-TTL memory). Required during sub-project E's caching work — same surface, same data structures. |
| 5 | **MCP `tools/list` cache invalidation strategy.** When E caches `tools/list`, it must define how to detect schema drift on the MCP server side. Likely: include a hash of the `initialize` response (server version, capabilities) in the cache key. Without this, MCP server upgrades silently produce stale tool surfaces in production. | Sub-project E ships. | Sub-project E spec must define the cache key shape; flagged as a hard requirement of E. |
| 6 | **Production-deploy cutover policy** — *decided after UX review*. Decision: **(c) accept silent reset for agents with empty `selected_tools` post-deploy.** Justification: this is a developer tool; the in-editor empty-state hint from sub-project A is sufficient warning ("No tools enabled. This agent can only converse."); a one-time migration of historical implicit-set into `selected_tools` is meaningless because there's no historical implicit set anyone is relying on (zero production data at design time). The runbook step at first user-facing deploy: include a single release-notes line — *"Agents created before this release have an empty tool selection by default; visit the editor to choose tools."* | First deploy targeting an environment with user data. | Engineering owner of the deploy. Decision recorded above; no further design work needed unless prod data accumulates before the deploy. |
| 7 | **Templates / examples that exercise the registry end-to-end.** At least one demo agent that uses the registry through every code path: built-in OAuth tool, MCP tool, child-agent dispatch via composition, `finish` injection. Lives in `packages/web/app/data/<seed>.json` or equivalent. | Onboarding any new contributor to the codebase. | Implementation-time task within this refactor. Not a "later" item — landing this refactor without a worked example means the next person to add a provider has no reference. |
| 8 | **Per-MCP outbound rate limiting.** OpenFlow makes outbound `tools/call` requests to third-party MCP servers on behalf of users. Without throttling, a malformed agent loop can hammer an external service. Pattern: per-(org, mcp) token bucket inside `buildMcpProvider` or via Redis. | First production agent run that targets a third-party MCP. | Implement inside `buildMcpProvider`, using the same Redis layer as E. Required before any user can install a third-party MCP in production. |
| 9 | **Edge function payload schema versioning.** *Added after staff-engineer review.* The payload changes from this refactor (`googleCalendar` → `oauth.byProvider` with `OAuthTokenBundle`). Backend and edge function deploy on separate pipelines — a backend-ahead deploy sends old shape; an edge-ahead deploy receives unrecognized fields. Add a `schemaVersion: 2` field to `ExecuteAgentParams`; edge function rejects unknown versions with a descriptive 400; deploys target a specific version pair. | First multi-pipeline production deploy. | Implementation-time concern; bake into the migration PR. |
| 10 | **Local `Tool` adapter type.** *Added after staff-engineer review.* The spec's `Provider.buildTools` returns `Record<string, Tool>` directly using the AI SDK's `Tool` type. AI SDK has shipped breaking changes; if `Tool`'s shape changes, every provider's `buildTools` breaks simultaneously. Define `OpenFlowTool` (a project-local interface mirroring AI SDK's current shape) and an adapter `toAiSdkTool(t: OpenFlowTool): Tool`. Providers return `OpenFlowTool`; the registry adapts at the executor boundary. | Next AI SDK breaking change (whenever it lands). | Bake into the migration PR; small surface, big resilience win. |

### Tracking

These items must be added to the project's issue tracker (or equivalent) as part of landing this refactor — not after. Each issue links back to this spec section by number. The implementation plan derived from this spec will include a step "create tracking issues for required follow-ups #1–#8" before the PR can be marked complete.

### Why it's framed this way

A "known limitation" framing is an invitation to forget. A "required follow-up with a resolution gate" framing forces the question "what blocks if we skip this?" at every milestone. Each item above has a concrete answer.

---

## Status

- Brainstorming: complete.
- Written spec: this document, v2 (post-review).
- Spec review: completed by staff-engineer + UX subagents (2026-04-26).
- Awaiting: user review of v2.
- After approval: brainstorm sub-project E (Redis caching), then implementation plans for A, B+C+D, E.

---

## Revisions

### v2 — 2026-04-26

Amendments incorporated from staff-engineer + UX dual review. Grouped by cluster:

**Cluster A — Data model & contracts:**
- **Workflow `tool_call` precondition** changed from `value: string` (tool name) to `tool: { providerType, providerId, toolName }` (qualified ref). Eliminates the global-name-uniqueness fragility under MCP renames. One-time graph-schema migration; no production data, so seed JSON files are curated by hand.
- **`OAuthTokenBundle`** carries `expiresAt`, `scopes`, `tokenIssuedAt` — required for sub-project E (caching), required follow-up #4 (circuit breakers), and forward-compat with scope-aware providers.
- **`ProviderCtx` slimmed** — universal fields only + a `services<T>(providerId)` factory. Provider-specific data ownership moves out of the central type. Adding a built-in is genuinely zero `ProviderCtx` edits now.
- **`oauthTokens` and `mcpTransports` are `ReadonlyMap` and frozen.** "No shared state" becomes structurally enforced.
- **In-process LRU on the catalog endpoint** (60-s TTL keyed by `(orgId, mcpServerId)`). Pre-E mitigation against editor SWR loops hammering external MCP servers.
- **Local `OpenFlowTool` adapter** type added as required follow-up #10 — provider-AI-SDK boundary survives AI SDK breaking changes.
- **Edge function payload `schemaVersion: 2`** added as required follow-up #9 — coordinates multi-pipeline deploys.

**Cluster B — Runtime correctness:**
- **`assertNoDuplicateToolNames` deleted.** Replaced by: install-time rejection (user-facing fail-fast) + per-execution graceful handling (built-in wins, MCP dropped, metric incremented). The previous throw-at-compose was a DOS vector — one bad MCP install would break every execution for that org.
- **`buildToolIndex`** memoizes `findToolByName` lookups inside the registry closure. No more O(N×M) scan per node step.
- **Workflow error path no longer calls `describeTools`** to format `availableNames`. That would have triggered N network round-trips on a half-broken-MCP error path. The error carries identifiers only; logs and metrics carry the rest.
- **Test added**: `composeRegistry` performs no I/O. Guards the central performance + statelessness claim.
- **Test added**: composed registry is frozen / immutable.

**Cluster C — Error-state UX:**
- **Catalog endpoint frontend states** explicitly defined: `loading`, `loaded`, `partial-failure`, `total-failure`. Each has its own panel rendering. Critical: in `total-failure`, save is disabled and stale-entries diff is suppressed (real data-loss UX path otherwise).
- **Per-provider error rows** distinct from stale rows. Different lifecycles (transient vs permanent), different UI affordances (retry vs remove), different data treatment (don't promote temporarily-unavailable selections to stale).
- **Asymmetric error semantics** communicated inline in the editor: agent-mode panel shows *"Workflows using this provider will fail at runtime"* under any provider with `error`; workflow-mode panel shows the inverse.
- **Stale-entry visibility** improved via run-output drops + revalidate-on-panel-open. Closes the up-to-5-min blind spot from SWR-only refresh.
- **Sub-agent inheritance debug surface** added — every child dispatch emits a structured `child_dispatched` event with the resolved tool set, dropped names, and inheritance strategy. Simulator and run-history consume it.
- **Token-refresh-on-inherit** semantics specified — long-running parents that pass their `oauthTokens` to children near expiry trigger refresh-via-callback or a marked-`expired` failure path.
- **In-flight cutover decision recorded** (#6): accept silent reset for unmigrated agents post-deploy; release-notes line is the user-facing communication. No production data today; decision binds when data exists.
- **Workflow editor stale-references hint** added as pre-#2 mitigation.
- **MCP description display** specified: plain-text only, single line, truncate, `title` attribute on overflow. No markdown rendering.

**Cluster D — Editorial:**
- **Fixed the `finish` rule contradiction.** Replaced the wishy-washy paragraph with a clear table: dispatch tools (`create_agent`, `invoke_agent`, `invoke_workflow`) live in `selected_tools` like any other; `finish` is never in `selected_tools` and is auto-injected only when `ctx.isChildAgent === true`. The frontend filters `finish` out of the catalog entirely so it can't be selected.

**Required follow-ups expanded** from 8 to 10 items (added schema versioning + Tool adapter). #1's owner framing tightened — explicit name required at OF-6 sprint planning, not generic "OF-6 owners."
