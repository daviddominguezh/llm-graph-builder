# Runtime unification (2026-06-19) — review & disposition

**Review date:** 2026-06-23
**Reviews:** 3 independent staff-level passes (correctness/contracts, maintainability/duplication, operations/runtime), each verified against current code + the SP0–SP4 specs.
**New constraint folded in:** production must migrate off Supabase Edge Functions (400s execution cap) to **Cloudflare Workers**, because agent runs can last hours. DB stays on Supabase Postgres (compute moves, data layer does not).

## Legend

- ✅ **Implement** — keep ~as-is
- 🟡 **Rework** — implement, but the spec's shape/details need fixing first
- 🔵 **Split out** — yes, but as its own separate project, not part of this refactor
- ⏸ **Defer** — not now
- ❌ **Drop** — don't implement as proposed

## Core architecture

| Spec proposes | Verdict | Reasoning | Notes |
|---|---|---|---|
| One runtime core in `packages/api` (kill parallel orchestrator + 5 builtin factories) | ✅ | The actual thesis and it's sound. The keeper. | OK |
| Capability-injection: 5 driver-injected seams (`RuntimeCapabilities`) + shared `RuntimeServices` | ✅ | Fixed (§6.3): only the seams that truly differ are injected — `persistence`, `dispatch`, `observability`, `rateLimit`, `logger`. The identical ones (`oauthResolver`, `mcpPool`, `loadChildAgentGraph`, `supabase`) moved to `RuntimeServices`, wired once. `DispatchNotifications` removed. | Yes, you are right, do not duplicate, please fix it |
| `environment` discriminant on `ProviderCtx`; "orchestrator never branches" | ✅ | Resolved: the discriminant is correct, and the per-tool `if (sim)` branch it enables is the **intended** design (see Tool layer) — each tool owns its sim behavior, not duplication. The earlier "don't branch in 20 tools" concern is withdrawn. | Explain what the issue is, what do you mean with branching into 20 tools |
| New `packages/shared-store-services/` (one portable package) | ✅ | Purpose: one canonical implementation of the 5 builtin factories (KV/RAG/Calendar/Forms/LeadScoring) imported by every host (Node sim backend, Cloudflare Worker, Deno) — kills the prod/sim dual-impl drift (audit #1/#2/#6). With `re2js` the KV regex blocker is gone, so it genuinely is one portable package, no per-runtime branch. | What is the intended purpose of this? Explain more |
| `ChildResult` envelope unification | ✅ | Fixed (§6.4): added `awaiting_input` variant (sim's `child_waiting`), preserved the finish `success \| error` outcome, added `no_result` for END-without-text, and re-derived the mapping from real code (END-without-finish is now environment-aware). Suspension moved out of `ChildResult` into `DispatchOutcome`. | Yes, you are right, please fix it |
| Dispatch strategy: `DispatchOutcome` = `completed` (sim) \| `suspended` (prod) | ✅ | Fixed (§10.2): durable model, no `pending`-throws. `DurableDispatchStrategy` (prod) persists + returns `suspended`; `SyncRecurseStrategy` (sim) returns `completed`. Hand-rolled `DispatchNotifications` removed. | OK |
| Two dispatch models: prod durable, sim sync recursion | ✅ | Fixed per note (§10.1): production = durable suspend/resume (Workers + external resume trigger driving re-invocation from Postgres); **simulation keeps synchronous recursion**. Both `DispatchOutcome` branches are real and exercised. | Correct, modify the plan so we use the async method, nevertheless, for sim we still need the sync recursion |
| `DispatchPersistence` capability (prod Supabase / sim Noop) | ✅ | A seam that genuinely differs. Keep — and it's the seed of the durable-execution model. | OK |

## Production host / durable execution (new — driven by the Cloudflare constraint)

| Spec proposes | Verdict | Reasoning | Notes |
|---|---|---|---|
| Production driver = Cloudflare Worker (`packages/worker`) | ✅ | Fixed: spec now targets a Cloudflare Worker (§1, §5 diagram, §11.5 rewritten as `packages/worker/`). Supabase edge/Deno appears only as the migration source. Rationale recorded: Workers cap CPU not wall-clock, so hours-long I/O-bound runs are not capped at 400s. | |
| Durability mechanism | ✅ | **Decision: DB-backed suspend/resume** (Postgres = system of record, via Hyperdrive/pooler). Chosen over Workflows (concurrency caps ≈1M concurrent + lock-in) and DO/Queue (duration + storage-write cost) — no concurrency ceiling, reuses the existing prod pattern, cheapest, portable. Spec §10.4. | |
| Keep Supabase Postgres as system of record | ✅ | Compute moves to Workers; DB unchanged. Connect via Hyperdrive or `@supabase/supabase-js`. | |
| What drives re-invocation of suspended runs | ✅ | **Decision:** human-in-the-loop resumes need no driver — the BE re-invokes the Worker when the next user message arrives. Autonomous resumes (child finished / timeout) via sharded Cloudflare Queues or a cron sweep over a `pending_resumes` table. Idempotency key on every resume. Spec §10.4. | |

## MCP connection pool

| Spec proposes | Verdict | Reasoning | Notes |
|---|---|---|---|
| Backend owns all MCP connections + invocation; Worker depends on it (§8) | ✅ | **Decision:** BE owns MCP — Workers can't hold a pool (ephemeral), stdio MCP must live on the BE anyway, the BE already fronts every Worker call (no new availability dep), connection reuse is a latency win, and it's the only place the SP3 egress guard can run. Still a meaty subsystem; starts as a module in the BE, extractable to a gateway later. | |
| Pool placement + scaling | ✅ | **Decision:** pool lives in the BE directly to start; **sticky routing (consistent-hash `poolKey`→instance) from day one** so scaling out is additive and session-stateful servers don't split-brain. Spec §8.2. | |
| stdio MCP servers in the pool | ✅ | Confirmed: stdio = subprocess, can only live on the Node BE (impossible on Workers). The BE-owned pool is their only viable home. Spec §8. | |
| Retry semantics | ✅ | **Decision:** retry **connect/handshake only**, never an invoke that may have hit the wire (double-exec risk on non-idempotent tools); idempotency key threaded through invoke + durable resume. Breaker-open surfaced as a typed transient error. Spec §8.4. | |
| Circuit breaker / health-sweep / reconnect-with-jitter | ✅ | Resolved: refcount borrows (no evicting leased entries), breaker counts connect attempts, evict-then-retry on connect reject, drain on shutdown; the api session-id cache is reconciled into the pool (one owner). Spec §8.3–8.5. | |
| Delete `mcp/lifecycle.ts` (`createMcpSession`) | ✅ | Decided: delete after the pool wires the SP3 egress guard, so the guarded path is never removed first. Spec §8.5. | |
| Egress / SSRF handling in the pool | ✅ | **Required & specified:** `resolveAndAssertEgress` on connect **and** re-validate on borrow (TOCTOU on 1h-TTL connections). Spec §8.4. | |
| `/internal/mcp/invoke` auth | ✅ | **Required & specified:** body carries only `agentId` + `mcpBindingId`; `tenantId`/ownership derived server-side from the DB (master-key ≠ tenant boundary). Spec §8.1. | |

## OAuth

| Spec proposes | Verdict | Reasoning | Notes |
|---|---|---|---|
| OAuth resolution: **pool-internal** (no runtime resolver capability) | ✅ | **Decision:** MCP is the only provider and the BE pool owns MCP connections, so resolution moves into the pool's **connect path** — lazy, per binding, on first tool use; reuses `resolveAccessToken` (Redis cache + refresh-on-expiry + single-flight); cache survives the Worker's suspend/resume. **Dropped:** the runtime `oauthResolver` capability (§6.3), the `/internal/oauth/resolve` endpoint, and `InternalApiOAuthResolver` — no caller after calendar removal. Spec §7. | |
| Preflight surfaces (publish button, sim first-message) | ✅ | Genuinely useful UX; could even ship independently. | |
| OAuth subject model (`'mcp'` only) | ✅ | **Updated — Google Calendar removed.** Provider collapses to `'mcp'`; the subject keys on `mcpBindingId` + `tenantId` — **the same key the pool uses** (one concept, not two). Remaining dependency: reconcile with today's org + `libraryItemId` store as SP1/SP4 land tenant-scoping. Spec §7.1. | |
| MCP-OAuth: wire into the pool + 401 reconnect | ✅ | **Decided — not greenfield.** OAuth MCP servers (Notion/Snowflake/Square) work today via `resolveAccessToken`. The unification's only real work: move resolution into the pool's connect path (push→lazy) and add **in-call 401 refresh-and-reconnect** (§8.4 — the one net-new piece); keep **preflight** (§7.3). The standalone runtime resolver + `/internal/oauth/resolve` are dropped. Keying reconciliation with SP4 still pending. Spec §7. | |

## Simulation

| Spec proposes | Verdict | Reasoning | Notes |
|---|---|---|---|
| FE-owned sim state, JSON-typed, passed through runtime | ✅ | Clean model. | |
| Sim-state immutability: runtime `Object.freeze` (not just `DeepReadonly`) | ✅ | **Fixed (§6.2/§9.2/§9.3):** `DeepReadonly` + the ESLint `as`-ban are bypassable (spread, `structuredClone`, array mutators, `satisfies`, `@ts-expect-error`), so the runtime now **deep-`Object.freeze`s `simulationState` at the ctx boundary** — a stray mutation throws instead of silently corrupting state. Write path also **deep-clones `value`** so a retained reference can't mutate committed state. `DeepReadonly` stays as the dev-facing type. | |
| Sim state: one source of truth (runtime sole writer) | ✅ | **Fixed (§6.5/§9.4/§9.6):** the runtime owns state during a run and is the only writer; `simulation_state_patch` events are **display-only** (a dropped patch is cosmetic, can't corrupt state); the FE's authoritative state updates *only* via a terminal `simulation_state_snapshot` it adopts — so a lost patch self-corrects. Abort = keep the last snapshot, discard optimistic rendering. Removes the dual-ownership desync. | |
| Builtin tools: interim shared no-op in sim, bespoke per-tool behavior later | ✅ | **Decision:** for now a shared `simulatedNoop` (no external side-effects); eventually each tool defines its sim behavior via `if (sim)` reading/writing the §9 sim state. Sim state is simulation-only (never production). §2/§3/§13 rewritten to match §9 — internal contradiction removed. | |
| MCP tools fire real side effects in sim, no UI badge | 🟡 | Dangerous as written. Don't ship the no-op-builtins phase before a "REAL side effect" badge / dry-run gate exists. | |
| Wire forms + lead-scoring into simulation (Goal §2) | 🟡 | Intentionally deferred: the per-tool sim seam ships now as a shared no-op; forms/lead-scoring bespoke sim behavior comes later, per tool. §2 goal softened to "establish the seam" so it's no longer claimed as delivered. | |

## Tool layer

| Spec proposes | Verdict | Reasoning | Notes |
|---|---|---|---|
| Per-tool `if (simulation)` simulation seam (each tool owns its sim behavior) | ✅ | **Decision (reversed):** keep the per-tool branch — simulation semantics legitimately differ per tool, so it's the deliberate extension point, not duplication. Initial cut = one shared `simulatedNoop` default (no drift while all identical); each tool fills in bespoke behavior against §9 sim state over time. | |
| Composition tools (`invoke_agent`/`invoke_workflow`/`finish`) get no guard | 🟡 | Right instinct, wrong rationale: `finish` only exists for child agents; `create_agent` writes no DB record. Fix the reasoning. | |

## Cleanup / dedup

| Spec proposes | Verdict | Reasoning | Notes |
|---|---|---|---|
| One canonical SSE `ExecutionEvent` vocabulary | ✅ | Worth doing — but vocabulary is missing `child_waiting` and workflow node events. Complete it. | |
| Two per-runtime SSE adapters ("converge later") | ❌ | Institutionalizes the split; "later" never comes. Commit to a hard cutover that deletes the adapters; include the ignored `packages/widget` consumer. | |
| Service-role Supabase client + logger dedup (audit #10, #11) | ✅ | Pure win, low risk. | |
| KV regex unification (audit #1) | ✅ | **Decision:** use `re2js` (pure-JS RE2 port). Single validator across Node/Deno/Workers — drops the `/internal/regex/validate` hop AND the native `re2` dependency; the KV factory becomes one portable import with no runtime branch. | |
| RE2 portability | ✅ | **Decision:** `re2js` (pure JS, no native addon, no WASM) loads everywhere incl. Workers, keeps ReDoS-safe linear-time matching. Trade-off (slower than native/WASM) is irrelevant for lightweight pattern validation. Caveat: API differs from native `re2` → adapt `kv/matcher.ts` + parity test (à la SP2). | |
| Delete `executeAgentPath.ts` | ❌ | Already deleted (`2b1fd5a1`). Phantom. Remove from plan. | |
| Delete the rest of the §11.3 manifest | 🟡 | Re-verify every entry against `main` first — the manifest is provably stale. | |

## Frontend

| Spec proposes | Verdict | Reasoning | Notes |
|---|---|---|---|
| Toolbar: testing-presets popover + sim-state panel | ✅ | Reasonable UX; independent of the runtime refactor. | |
| Reset-sim / tenant-switch confirmation modals | ✅ | Fine. | |
| Translations for new UI | ✅ | Required regardless (project rule). | |

## Process / migration

| Spec proposes | Verdict | Reasoning | Notes |
|---|---|---|---|
| `maxDispatchDepth` default 5 | ❌ | Silent 10→5 regression (both runtimes hardcode 10). Keep 10. | |
| `maxChildRuntimeMs` default 24h | ❌ | Effectively "no timeout" on a recursion. Pick a real bound. | |
| 10-phase migration plan | 🟡 | Uneven and big-bang mid-way (prod & sim on different cores between phases 5–6). Re-sequence; split out the pool; flip both drivers behind one flag. | |
| Characterization / equivalence tests | ✅ (add) | Missing. A "no behavior change" refactor with known divergences needs a Phase 0 oracle. | |

## Staleness flags (apply across the table)

| Item | Verdict | Reasoning | Notes |
|---|---|---|---|
| Spec predates SP2 | 🟡 | SP2 shipped the MCP resolver dedup to `graph-types` (`6ef355d0`). This spec still plans it in `packages/api` → collision / re-duplication. | |
| Spec OAuth/pool keying predates SP0/SP1/SP4 tenant-scoping | 🟡 | Designed org-scoped while the team is moving to tenant-scoped. Guarantees a second move unless coordinated. | |
| Spec assumes prod `agent` app-type loads MCP | 🟡 | Per SP0, prod agents don't load MCP at runtime today. Pool design assumes a path SP0 must ship first. | |

## Bottom line

~40% ships close to as-written, ~35% needs rework, ~25% split out or dropped. Recommended sequencing: (1) Cloudflare durable-execution foundation spec; (2) runtime-core unification authored against Workers + durable dispatch; (3) MCP pool and MCP-OAuth as separate sub-projects.
