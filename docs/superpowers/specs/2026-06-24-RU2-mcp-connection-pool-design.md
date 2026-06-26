# RU2 — MCP connection pool (BE-owned) — design

**Date:** 2026-06-24
**Status:** Design approved; pending implementation plan.
**Part of:** Runtime-unification decomposition — sub-project **RU2** (`2026-06-23-runtime-unification-OVERVIEW.md`). North-star: `2026-06-19-runtime-unification-design.md` §7–§8.
**Depends on:** SP3 (egress guard — shipped), SP4 (tenant-scoped MCP config — shipped). Runs in **parallel with RU1**; consumed by RU3 (sim) and RU4 (Worker).
**Platform:** Backend runs on **Fly.io**, already **multi-instance with header-based sticky routing**.

## 1. Intent

Today an MCP tool call connects (or reattaches) **per call, in-process** — `buildMcpProvider` → `withSession` → `ensureSession` (reattach via `sessionCache`, else fresh connect) → `session.handle.callTool`. There is no warm connection reuse; each call re-establishes.

RU2 introduces a **backend-owned warm MCP connection cache**: a tool call **borrows a warm connection** keyed by `poolKey`, `callTool`s, and leaves it warm — only the *first* call to a server pays the connect cost. The pool lives in the long-running BE (not the ephemeral Worker), so connections stay warm **across the durable Worker's suspend/resume turns**. The runtime/Worker calls the pool via `/internal/mcp/invoke`; the BE owns all connection lifecycle, routing, security, and OAuth.

**Goal in one line:** tool calls reuse warm MCP connections instead of reconnecting from scratch, transparently surviving idle drops and instance crashes.

## 2. Scope

**In:** the warm connection cache + lifecycle (TTL/LRU/keepalive/lazy-reconnect); Fly consistent-hash routing (`fly-replay` + membership via internal DNS + `replay_cache`); transparent crash/idle failover; `/internal/mcp/{invoke,preflight}` + `McpPoolClient`; egress guard + server-side tenant/binding auth; MCP-OAuth resolved in the connect path; absorbing `ensureSession`/`sessionCache` into the pool.

**Out:** the circuit-breaker / background health-sweep / elaborate backoff state machine from §8 (trimmed — see §10); tool-annotation-based retry classification (cut as over-engineering); deleting the old `mcp/lifecycle.ts` and rewiring all call sites to the pool — the **runtime call-site flip** lands with RU3/RU4 and the **deletions** with RU6 (RU2 ships the pool + endpoint + client and migrates the existing sim/edge MCP paths to use them).

## 3. Reuse, don't rewrite

The pool **reuses** the existing api MCP primitives — `connectMcp`, `createTransport` (http/sse/stdio), the JSON-RPC layer, `callTool` (`packages/api/src/providers/mcp/`). It **adds** a server-side pooling/lifecycle layer in `packages/backend/src/mcp/pool/` and the `/internal/mcp/*` boundary. The current per-call session manager — `ensureSession` + `sessionCache` (Redis session-id reattach, keyed `orgId+serverUrl`) — is **absorbed into the pool**: the pool *is* the session owner now; the session-id reattach logic moves inside the pool entry, re-keyed to `poolKey`. The runtime's MCP tool `execute` stops calling `ensureSession` and calls the injected `McpPoolClient` instead — the only change in `buildMcpProvider` is the seam (`withSession(...callTool...)` → `mcpPool.invoke(...)`).

## 4. The pool (per BE instance)

```ts
poolKey = `${agentId}::${tenantId}::${serverConfigId}`  // serverConfigId = McpServerConfig.id
// NB: there is no `mcp_binding_id` column. A "binding" is the composite (agent_id, server_id,
// tenant_id) row in `graph_mcp_server_tenant_config`; its identity on the wire is the MCP server
// config `id` (McpServerConfig.id). The invoke body's `mcpBindingId` field IS that server config id.
type PoolEntry = {
  handle: McpClientHandle;   // the warm connection (from connectMcp)
  lastUsed: number;
  borrows: number;           // refcount — never evict while borrowed
  connecting?: Promise<McpClientHandle>;  // shared so concurrent first-calls don't double-connect
};
```

- **Invoke:** look up `poolKey`. Warm + healthy → reuse `handle.callTool`. Absent/dead → connect (egress + OAuth, §6/§7), cache, then `callTool`.
- **Eviction:** **TTL** (idle > ~1h, configurable) + **LRU cap** sized from the fd/memory budget (not a round number). **stdio capped much tighter** than http/sse — each stdio connection is a child *process* (MBs + a PID), so a few hundred max vs thousands of sockets. **Never evict a borrowed (in-flight) entry** — refcount borrows.
- **Lazy reconnect-on-borrow:** validate the cached handle on borrow; if dead (server idle-dropped, network blip), reconnect once before sending. (Replaces §8's background health-sweep.)
- **Keepalive:** a lightweight periodic ping on *idle* entries (interval below typical MCP idle-timeouts, jittered + concurrency-capped) so connections stay genuinely warm and reuse actually happens. This is the one background loop kept; the pruning sweep is dropped (TTL+LRU handle eviction).
- **Concurrent first-calls share one `connecting` promise** so two simultaneous cold-key calls don't double-connect.

## 5. Fly routing — consistent-hash over live machines, `fly-replay`

The pool is **sharded across Fly machines** so the warm set can exceed one instance (worst case: agents×tenants×bindings = hundreds of thousands of keys; LRU bounds each shard, sharding multiplies capacity). One machine **owns** a given `poolKey` so its connection is reused with no split-brain.

- **Membership:** resolve `vms.<app>.internal` (Fly internal DNS) → live `{machineId, region}` set; cache ~2–5s. (The BE is on Fly and can read internal DNS; the off-Fly Worker cannot — which is why routing is BE-decided, not client-decided.)
- **Owner selection:** consistent-hash ring with ~150 virtual nodes per machine; `ownerFor(poolKey)` = first vnode clockwise from `hash(poolKey)` (fast non-crypto hash). Consistent hashing ⇒ a membership change remaps only ~1/N of keys.
- **Routing (per the Fly sticky-sessions guide):** the entry instance computes `ownerFor(poolKey)`. If owner is itself → handle locally. Else → respond `307` with **`fly-replay: instance=<ownerMachineId>`**; Fly's proxy replays to the owner, which handles it (re-computes owner = itself). The Worker passes `poolKey` in a header and otherwise knows nothing about Fly topology.
- **`replay_cache`** (fly.toml, keyed on the `poolKey` header, `ttl_seconds ≈ 60`) pins subsequent calls for that binding straight to the owner — so the hash+replay happens ~once per binding per minute, not per call. TTL kept short so a dead owner can't be cached long.

```toml
[[http_service.http_options.replay_cache]]
  path_prefix = "/internal/mcp/"
  ttl_seconds = 60
  type = "header"
  name = "x-mcp-poolkey"
```

## 6. Transparent failover — one client call, one response

The client (`McpPoolClient`) calls `/internal/mcp/invoke` **once** and gets one response. All routing/reconnect/re-route is server-side and invisible — **except** a crash *during* tool execution.

- **Crashed machine never gets new requests:** owner selection uses **live** membership, and Fly removes a dead machine from internal DNS on health-check failure → it drops out of the ring within seconds → new requests map to a surviving machine, which **lazily creates a fresh connection**.
- **Dead-owner during the staleness window:** if the entry instance's membership briefly still lists a just-crashed owner, the entry instance **forwards over the Fly private network (6PN) to the owner instead of blind-replaying, and on connection failure re-hashes over membership-minus-the-dead-one → next owner**, returning the final response to the client. (Internal forward + re-route is the dead-owner fallback; `fly-replay` is the steady-state fast path.) The client never retries.
- **Idle-dropped connection:** reconnect-on-borrow before sending — invisible.
- **The one surfaced error — mid-execution crash:** if the connection/machine dies **after** the request reached the MCP server (bytes on the wire, no response), we **cannot** tell "executed" from "didn't," so we do **not** auto-retry (would double-execute a non-idempotent tool). The pool returns a typed **`uncertain_outcome`** error so the agent can verify-and-decide. This is the only failure the client sees.

> **No idempotency keys needed.** We only ever retry calls we are *sure* never hit the wire (connection dead/absent before we wrote the request bytes) — those can't double-execute. Anything written-then-lost is the `uncertain_outcome` case (not retried). So correctness needs no dedup token.

In one line: **the pool absorbs every failure up to the moment the call starts executing on the MCP server; only a crash *during* execution surfaces — and that's irreducible.**

## 7. Security (non-negotiable)

- **Egress guard** (`assertEgressForServers`, SP3) runs **on connect AND is re-validated on borrow** — a warm connection outlives the TTL while DNS can rebind (TOCTOU), so connect-time guarding alone is insufficient for a pool. Pin the resolved IP or re-check on reuse.
- **Server-side tenant/binding authorization** on `/internal/mcp/invoke`: the body carries only `agentId` + `mcpBindingId` + `toolName` + `args` (+ the `poolKey` routing header). `tenantId` and binding ownership are **derived server-side** from `agentId` against the DB — never trusted from the caller. Master-key auth on `/internal/*` is an infra boundary, not a tenant boundary.

## 8. OAuth (in the connect path)

OAuth-protected MCP servers (Notion, Snowflake, Square…) work today; RU2 moves resolution **into the pool's connect path** (reusing `resolveAccessToken` — Redis-cached, org+`libraryItemId`-keyed, refresh + single-flight). On connect, the pool resolves the token and applies it to the transport. On **401 mid-session**, refresh via `resolveAccessToken`, **reconnect, retry the connect** (never a mid-call invoke). No standalone runtime OAuth resolver (§7 of the north-star) — the pool owns it.

## 9. Endpoints + client

```
POST /internal/mcp/invoke    body { agentId, mcpBindingId, toolName, args }  header x-mcp-poolkey
     → tool result | typed tool-level error (incl. uncertain_outcome); never crashes the caller's turn

POST /internal/mcp/preflight body { agentId, mcpBindingId }                  header x-mcp-poolkey
     → 200 ok | 400 connection failure  (also warms the pool entry)
```

`McpPoolClient` (defined + exported by RU2; used by `buildMcpProvider`): builds `poolKey`, sets `x-mcp-poolkey`, derives the `/internal/*` base URL, calls invoke, maps a transport/`uncertain_outcome` error to a typed tool-level error (the LLM can react). Used by both runtimes (Worker + in-BE sim).

> **Seam wiring (corrected against the code):** there is **no `RuntimeServices` type today** — `ProviderCtx` exposes a `services` *resolver closure*, not named fields (that type is an RU3 concept, north-star §6.3). So RU2 only **defines/exports** `McpPoolClient` and flips `buildMcpProvider`'s seam behind an **optional injected `mcpPool`** — when absent, the api package keeps its current default `withSession`/`ensureSession` behavior (api cannot import the backend pool). The real `ProviderCtx` injection of `mcpPool` lands in **RU3/RU4**. `buildMcpProvider` lives in the api package (no DB/Redis/Fly access), so the pool is reachable only via the injected **HTTP** `McpPoolClient`, never a direct call.

## 10. Trimmed vs the north-star §8

Kept lean per "we just need to cache connections": **dropped** the circuit breaker (replaced by a minimal "don't immediately re-dial a key whose connect just failed" cooldown), the **background health-sweep** (replaced by lazy on-borrow validation), the **multi-state reconnect machine + elaborate backoff** (simple reconnect-once on borrow), and **idempotency keys** (unnecessary, §6). Kept: warm cache, TTL/LRU (stdio tighter), keepalive, lazy reconnect, consistent-hash Fly routing, transparent failover, egress + tenant auth, OAuth-in-connect.

## 11. Affected paths (selection)

- New: `packages/backend/src/mcp/pool/{connectionPool,poolEntry,ring,membership,routing}.ts`, `routes/internal/{mcpInvoke,mcpPreflight}.ts`, `packages/api/src/providers/mcp/poolClient.ts` (`McpPoolClient`), `fly.toml` `replay_cache` block.
- Edited: `buildMcpProvider.ts` (seam: `withSession`→`mcpPool.invoke`), the sim + edge MCP call sites → route through `/internal/mcp/invoke`, `executeOAuthResolver.ts` (OAuth folded into the pool connect).
- Absorbed: `ensureSession.ts` + `sessionCache.ts` reattach logic → into `poolEntry` (re-keyed to `poolKey`).
- Deferred to RU6: deleting `mcp/lifecycle.ts` (`createMcpSession`/`closeMcpSession`) and the old in-process connect paths.

## 12. Risks / open questions

- **Dead-owner staleness window.** Mitigated by short DNS-membership cache + short `replay_cache` TTL + the 6PN internal-forward-and-re-route fallback. Confirm Fly's exact behavior when a `fly-replay` targets a just-stopped machine (does the proxy error, or fall back?) during implementation; the 6PN forward path is the safety net.
- **stdio at scale.** A subprocess per connection — the LRU cap for stdio must be tight, and stdio bindings concentrate load on their owner machine. Watch fd/process limits per Fly machine.
- **Keepalive cost.** Ping interval × idle entries × machines hitting the same upstreams — jitter + cap, and confirm it doesn't trip small MCP servers' rate limits.
- **OAuth keying** stays org+`libraryItemId` (grants are org-level); the pool key's `tenantId` reflects tenant-scoped *transport config* (SP4), not per-tenant grants. Consistent with the north-star §8.2.
- **Egress re-validation on borrow** adds a DNS resolve per borrow unless the resolved IP is pinned — pin it on the entry and re-check periodically rather than every borrow if it shows up in latency.
