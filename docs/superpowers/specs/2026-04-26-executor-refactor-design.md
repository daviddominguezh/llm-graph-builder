# Executor refactor — plugin registry & per-mode tool resolution

**Date**: 2026-04-26
**Status**: Brainstorming complete; spec written; awaiting user review
**Sub-projects covered**: B (plugin registry), C (workflow per-node lazy resolution), D (agent eager full-set resolution)
**Depends on**: Sub-project A (`selected_tools` storage)
**Followed by**: Sub-project E (Redis caching)

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
| Q3 (graph) | **Workflows reference tools by name** (existing graph schema; precondition.value) | No schema migration; relies on global tool-name uniqueness invariant (already enforced) |
| Q3 (agent) | **Agents reference tools by qualified ref** (`{providerType, providerId, toolName}` from sub-project A) | User-curated set; multiple providers may have overlapping names eventually; ref is unambiguous |
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

The execution context every provider's methods receive. Universal fields are required; provider-specific fields are optional (only the relevant providers read them).

```ts
interface ProviderCtx {
  // Universal
  orgId: string;
  agentId: string;
  isChildAgent: boolean;
  logger?: Logger;

  // OAuth bundle — keyed by providerId
  // Pre-resolved by the backend; passed to the edge function in payload.oauth.byProvider
  oauthTokens?: Map<string, string>;

  // MCP transport configs — keyed by mcp provider UUID
  // Sourced from agent.graph.mcpServers
  mcpTransports?: Map<string, McpTransportConfig>;

  // Conversation context (used by forms + lead_scoring)
  conversationId?: string;
  contextData?: Record<string, unknown>;

  // Forms-specific (used by forms provider)
  forms?: FormDefinition[];
  formsService?: FormsService;

  // Lead-scoring-specific
  leadScoringServices?: LeadScoringServices;

  // Composition-specific (for child agent dispatch via create_agent / invoke_agent / invoke_workflow)
  apiKey?: string;
  modelId?: string;
}
```

This is *the* shape every executor entry point assembles before calling the registry. It collapses what `injectSystemTools` currently takes as a param soup. New providers extend this only when they introduce a genuinely new context need.

**Why optional fields, not provider-specific subtypes:** the executor's responsibility ends at "assemble all the context you might need." Each provider then reads its own subset. A discriminated-union approach would force the executor to know what each provider needs, defeating the encapsulation.

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
}): Registry {
  const mcpProviders = args.orgMcpServers.map(buildMcpProvider);
  const all = [...args.builtIns.values(), ...mcpProviders];
  assertNoDuplicateToolNames(all);              // throws on conflict
  return {
    providers: all,
    findToolByName: (name) => /* O(N×M) scan */,
    describeAll: (ctx) => Promise.all(all.map(...)),
    buildSelected: ({ refs, ctx }) => /* group by provider, fan out */,
  };
}
```

`assertNoDuplicateToolNames` is the centralized invariant. Replaces the current `RESERVED_TOOL_NAMES` runtime filter. If a built-in name conflicts with an MCP-discovered name during composition, we throw immediately with both providers' identities — fail-fast, surface to the caller.

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

The registry layer treats them as ordinary tools — they conform to the `Tool` interface, the `execute` returns *something*. The orchestrator's existing sentinel detection code is unchanged. The composition provider is just where these tools live now (instead of being injected unconditionally by `injectSystemTools`).

**`finish` rule**: composition's `buildTools` includes `finish` in its output **only when `ctx.isChildAgent === true`**. This is a runtime contract — child agents always get `finish`, regardless of `selected_tools`, because they need a way to signal completion to their parent. Adult agents don't get it.

The four composition tools (`create_agent`, `invoke_agent`, `invoke_workflow`, `finish`) are never themselves `selected_tools` entries — wait, that's not right. Per sub-project A's Q3, all tools are gated, including composition. So `create_agent` etc. *do* live in `selected_tools`. The exception is `finish`, which is implicit-for-child-agents-only.

### Sub-agent tool inheritance

When a parent agent calls `create_agent({ tools: 'all' | string[] })`, the child agent's tool surface is computed at dispatch time:

- `tools: 'all'` → child's `selected_tools` = parent's `selected_tools`. Child runs with the same set. (Implementation: the orchestrator hands the parent's resolved tool set to the child execution context.)
- `tools: ['name1', 'name2']` → child's `selected_tools` = subset matching the requested names. Names not found in the parent's set are silently dropped (with a warning log).
- The child's `ProviderCtx` inherits the parent's `oauthTokens` and `mcpTransports` directly. No re-resolution.

Child's `isChildAgent` flag is true, so the composition provider injects `finish` for them.

Same logic for `invoke_agent` and `invoke_workflow` — they accept an optional `tools` parameter; if omitted, the invoked agent uses its own `selected_tools`.

---

## Workflow path (sub-project C — lazy per-node)

### Today

The state machine traverses a graph. When entering a node whose outgoing edge has a `tool_call` precondition, the executor needs that tool. Currently all tools are pre-built and passed in via `executeWithCallbacks(toolsOverride: ...)` — wasteful: every LLM call carries the full tool dict, even though only one tool is reachable from the current node.

### After refactor

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

  const toolName = toolCallEdge.preconditions[0].value;
  const found = args.registry.findToolByName(toolName);
  if (found === null) {
    throw new ExecutionError({
      kind: 'tool_not_in_registry',
      detail: `Workflow node references "${toolName}" which is not provided by any registered provider.`,
      availableNames: args.registry.providers.flatMap((p) =>
        /* descriptors from describeTools cache */
      ),
    });
  }

  const built = await found.provider.buildTools({ toolNames: [toolName], ctx: args.ctx });
  return { tools: built, toolName };
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
interface ExecuteAgentParams {
  // ... existing ...
  selectedTools?: SelectedTool[];                              // for agents only
  oauth?: { byProvider: Record<string, { accessToken: string }> };
  // mcpServers already flows via graph.mcpServers
}
```

The previous `googleCalendar?: { accessToken, orgId }` field is removed; calendar's token now lives at `oauth.byProvider['calendar']`. Backend pre-resolves all OAuth tokens for selected providers and packs them into this map.

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
    error?: { reason: string };  // when describeTools failed for that provider
  }>;
}
       403 user not in agent's org
       404 agent not found
       5xx transient
```

The handler:
1. Loads the agent record (for `graph.mcpServers`).
2. Composes the runtime registry exactly as the executor would.
3. Calls `registry.describeAll(ctx)` with a minimal `ProviderCtx` (no OAuth tokens — `describeTools` for built-ins is static; for MCPs it calls `tools/list`, which most servers allow without auth).
4. Returns the result.

Failures during a single provider's `describeTools` (e.g., MCP server down) populate that provider's `error` field. The catalog still returns; the panel can show the provider with a "couldn't load tools" indicator.

### Frontend integration

`packages/web/app/lib/toolRegistry.ts` is replaced by a hook that calls the new endpoint:

```ts
function useAgentRegistry(agentId: string): { registry: ToolGroup[]; loading: boolean; error?: string } {
  // SWR or react-query against GET /agents/:agentId/registry
}
```

`ToolsPanel` consumes this hook. The shape returned by the endpoint is *identical* to what `buildToolRegistry` produces today; the data source moves server-side.

### Caching

The endpoint is cheap: built-in describeTools is static (microseconds); MCP describeTools is one network round-trip per MCP. With sub-project E's Redis cache for MCP tool schemas, every cache hit becomes microseconds.

For now, browser-side cache via SWR with a 5-minute stale-while-revalidate keeps the editor snappy without backend caching.

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
| Duplicate tool name across providers (built-in collision, MCP shadowing built-in) | `composeRegistry → assertNoDuplicateToolNames` | Throw at composition. Execution never starts. Logged with both providers' identities. Replaces `RESERVED_TOOL_NAMES` runtime filter. |
| Workflow node references unknown tool name | `findToolByName` returns null in C's resolver | Throw `ExecutionError({ kind: 'tool_not_in_registry', toolName, availableNames })`. Run fails at this step with a clear diagnostic. |
| Agent has stale `selected_tools` entries | `buildSelected` returns them in `staleRefs` | Silent drop + `agent_tools.stale_drop` warning per A's spec. Execution continues. Editor's Stale group is recovery path. |
| OAuth token resolution fails for a provider in C | Inside `provider.buildTools` for the node | Throw to caller. Workflow fails at the node with `{ providerType, providerId, kind: 'auth_failed' }`. **No silent skip** — workflow's intent is unambiguous. |
| OAuth token resolution fails for a provider in D | Inside `provider.buildTools` during `buildSelected` | Provider's slice rejects; populates `failedProviders`. Other providers succeed. Agent runs with partial surface. Logged. |
| MCP `tools/list` fails (timeout, server error) in D | Inside MCP provider's `buildTools` | Same as OAuth failure: provider's slice rejects; others succeed; logged. |
| MCP `tools/call` fails at execute-time (LLM invokes a tool that errors) | Inside the tool's `execute` closure | Returned to LLM as a tool-call error. Standard AI SDK pattern. Agent loop continues. |
| Provider's `describeTools` fails during `describeAll` (catalog endpoint) | Per-provider try/catch in `describeAll` | That provider's entry has `error` field; others return normally. Editor's panel shows it as "couldn't load." |
| Network partition mid-execution (token cache stale, etc.) | Inside `execute` of any tool | Surface to LLM as tool error. |
| Composition's `finish` not in `selected_tools` for child agents | N/A by design — `finish` is implicit when `ctx.isChildAgent === true` | Composition provider injects it regardless of selection. Documented as runtime contract. |

### Asymmetry: workflow auth failure vs agent auth failure

- **Workflow**: failed auth = run fails. Graph said "this tool at this node"; we can't pretend that didn't happen.
- **Agent**: failed auth = degraded surface, run continues. LLM has alternatives.

Intentional. Means a workflow with a misconfigured provider is harder to ship than the equivalent agent — mitigated by graph-publish-time validation (out of scope; cross-referenced below).

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
| `provider.describe_tools.latency_ms` | histogram | `providerType`, `providerId` | MCP `tools/list` latency. Drives E's caching decisions. |
| `provider.build_tools.latency_ms` | histogram | `providerType`, `providerId` | End-to-end provider preparation. |
| `provider.build_tools.failure` | counter | `providerType`, `providerId`, `reason` (`auth_failed`, `timeout`, `protocol_error`, `unknown`) | Per-provider failure rates. Identifies bad providers before users complain. |
| `registry.tool_name_conflict` | counter | `nameInBuiltin`, `nameInMcp` | Should be zero in production. Spikes mean an MCP tried to clobber a built-in. |
| `agent_tools.stale_drop.count` (from A) | counter | `providerType`, `providerId` | Cross-referenced with `provider.build_tools.failure` to distinguish "tool gone" from "provider broken". |

### Backing system

Use whatever the project already uses (verify during planning). If nothing is in place, structured logs via the existing logger (`packages/backend/src/logger.ts`) are sufficient for now — metric names follow the conventions above so they can be extracted by log-based metrics tooling. Migration to a dedicated metrics backend (OpenTelemetry, statsd, etc.) is its own concern.

---

## Testing

### Unit tests (`packages/api`)

**`composeRegistry`** — pure function:
- Empty MCP overlay → registry contains exactly the built-ins.
- Built-in + non-conflicting MCP → both present.
- Built-in name collision (two built-ins exporting `set_form_fields`) → throws.
- MCP tool name collides with built-in → throws.
- MCP tool name collides with another MCP → throws.
- `findToolByName` finds the unique provider; null for unknown names.

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
| 1 | **Implement OAuth providers beyond `calendar`** (`hubspot`, `shopify`, `google_sheets` as new folders under `packages/api/src/providers/`). The registry's design is meaningless if no second provider proves the abstraction works. | OF-6 (CRM integrations) ships. | OF-6 owners. The first non-calendar provider also serves as the validation that the registry's abstraction is correct — if it isn't, surface the problem and revise the registry, not the provider. |
| 2 | **Workflow publish-time validation against the org's registry.** A workflow with `tool_call` referencing a tool that no provider can supply must fail at publish, not at runtime. The runtime fail-fast in this spec is a defense-in-depth backstop, **not** a substitute for editor validation. | First user-published workflow that uses `tool_call` nodes (production rollout). | Graph editor team. Required before workflows leave internal use. Track as a blocking issue at production-rollout planning. |
| 3 | **Redis caching for OAuth tokens, MCP `tools/list`, and MCP session IDs.** Per-execution resolution is acceptable for early adoption; at projected production load (25k+ executions/day) it is not. The latency math in the workflow path (200–800 ms cold-resolution per node) becomes a user-visible problem at scale. | Production load > 5k executions/day OR any MCP usage where users perceive latency. | Sub-project E. Specified as the next spec in this brainstorming series. |
| 4 | **Circuit-breaker for misbehaving MCPs.** A hot-looping `tools/list` failure cannot be allowed to consume backend or edge-function CPU per-execution forever. Pattern: track per-(org, mcp) failure rate; trip a 5-minute breaker when the rate crosses a threshold; degrade to "MCP unavailable" with a logged warning. | Multi-tenant production scale (more than ~10 active orgs using MCPs). | Implement inside `buildMcpProvider` (per-provider state in Redis or short-TTL memory). Required during sub-project E's caching work — same surface, same data structures. |
| 5 | **MCP `tools/list` cache invalidation strategy.** When E caches `tools/list`, it must define how to detect schema drift on the MCP server side. Likely: include a hash of the `initialize` response (server version, capabilities) in the cache key. Without this, MCP server upgrades silently produce stale tool surfaces in production. | Sub-project E ships. | Sub-project E spec must define the cache key shape; flagged as a hard requirement of E. |
| 6 | **Production-deploy cutover policy.** Before this refactor ships to any environment with live user agent sessions, there must be a written runbook covering: (a) drain in-flight conversations, OR (b) backfill `selected_tools` for any agent referenced by an active session before deploy, OR (c) accept user-visible breakage for agents with `selected_tools = []` and communicate it. No production deploy without one of these decisions made and recorded. | First deploy targeting an environment with user data. | Engineering owner of the deploy. Acceptable today (no prod data); becomes blocking the moment users are onboarded. |
| 7 | **Templates / examples that exercise the registry end-to-end.** At least one demo agent that uses the registry through every code path: built-in OAuth tool, MCP tool, child-agent dispatch via composition, `finish` injection. Lives in `packages/web/app/data/<seed>.json` or equivalent. | Onboarding any new contributor to the codebase. | Implementation-time task within this refactor. Not a "later" item — landing this refactor without a worked example means the next person to add a provider has no reference. |
| 8 | **Per-MCP outbound rate limiting.** OpenFlow makes outbound `tools/call` requests to third-party MCP servers on behalf of users. Without throttling, a malformed agent loop can hammer an external service. Pattern: per-(org, mcp) token bucket inside `buildMcpProvider` or via Redis. | First production agent run that targets a third-party MCP. | Implement inside `buildMcpProvider`, using the same Redis layer as E. Required before any user can install a third-party MCP in production. |

### Tracking

These items must be added to the project's issue tracker (or equivalent) as part of landing this refactor — not after. Each issue links back to this spec section by number. The implementation plan derived from this spec will include a step "create tracking issues for required follow-ups #1–#8" before the PR can be marked complete.

### Why it's framed this way

A "known limitation" framing is an invitation to forget. A "required follow-up with a resolution gate" framing forces the question "what blocks if we skip this?" at every milestone. Each item above has a concrete answer.

---

## Status

- Brainstorming: complete.
- Written spec: this document.
- Awaiting: user review of this spec.
- After approval: brainstorm sub-project E (Redis caching), then implementation plans for A, B+C+D, E.
