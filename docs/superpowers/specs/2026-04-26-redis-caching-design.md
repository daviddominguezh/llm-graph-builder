# Redis caching for OAuth tokens and MCP discovery

**Date**: 2026-04-26
**Status**: v2 — staff-engineer + UX dual review incorporated; awaiting final user review
**Sub-project**: E of the executor refactor (A → B+C+D → E)
**Depends on**: Sub-project A (`selected_tools` storage), B+C+D (plugin registry + per-mode tool resolution)
**Followed by**: implementation plans for A, B+C+D, E
**Revisions**: see "Revisions" log at bottom.

---

## Purpose

Eliminate the per-execution latency tax of repeated OAuth token resolution and MCP discovery. Without caching, every agent or workflow execution pays:

- One DB lookup + decrypt + (rare) refresh per OAuth-protected provider
- One MCP `initialize` handshake per MCP server
- One MCP `tools/list` call per MCP server

At projected production load (25k executions/day), that's tens of thousands of avoidable round-trips per day. After E, those become Redis hits in the millisecond range, keeping the platform stateless while making warm-path execution effectively free.

## Non-goals

- New OAuth providers — that's OF-6's work consuming this caching layer.
- Workflow publish-time validation — required follow-up of B+C+D, not E.
- Caching of *individual* tool execution results — orthogonal concern; out of scope.
- Cache-as-a-service for arbitrary callers — these three caches are purpose-built for the OAuth and MCP surfaces only.
- Single-flight / dogpile prevention — flagged as a forward concern; not built unless measurement demands it.

## Success criteria

1. Token cache hit rate ≥ 90% in steady state — most agent runs reuse a previously-resolved access token.
2. MCP `tools/list` cache hit rate ≥ 95% — most agent and workflow executions skip the discovery round-trip.
3. Cache misses fall back to source of truth without functional regression. Redis-down is never a fatal failure.
4. Cross-tenant cache isolation is structurally enforced (every key includes `orgId`) and tested.
5. Operational tooling exists for manual cache invalidation at three scopes: per-org-per-MCP (user-triggered), per-MCP-cross-org (admin), per-org full-flush (admin).
6. Observability: cache hit/miss ratios visible per cache; broken-server signals (`mcp.no_version_field`) surfaced.

---

## Decisions made during brainstorming

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Hybrid cache placement (option c).** OAuth token cache lives in the backend's `resolveAccessToken` resolver. MCP `tools/list` and session caching live inside the MCP provider's implementation. Built-in providers' `describeTools`/`buildTools` are already microsecond-fast; caching them adds latency. | Built-ins don't need caching; OAuth cache must live in the backend (edge function is stateless); MCP caches naturally encapsulate inside the MCP provider |
| Q2 | **Pure version-keyed caching for MCP `tools/list` (option b).** Cache key includes `serverInfo.version`; **no TTL backstop.** Cache lives until server bumps version, manual invalidation, or LRU eviction. | User chose this trade explicitly — no papering-over of broken servers with TTL. Risk surfaces via `mcp.no_version_field` metric and manual-refresh affordances. |
| Backend | **Upstash Redis** (REST transport) | Already designated for cache; HTTP transport works from both Node backend and Deno edge function without separate TCP setup |
| Failure mode | **Fall through to source of truth on Redis unavailability.** Redis is opportunistic, never required. | Caching layer must not introduce a new fatal-failure mode |
| Cross-tenant | **Every cache key includes `orgId`.** Test asserts no cross-tenant leak. | Structural enforcement of multi-tenant isolation |
| Key versioning | **Prefix all keys with `v1:`** (`oauth:v1:`, `mcp_tools:v1:`, `mcp_session:v1:`) | Future schema-format changes ship as `v2:` prefix, naturally cold-starting the cache |
| Write strategy | **Write-through.** Synchronous cache write after each source-of-truth fetch/refresh. | Simplest; no separate write queue; failed writes don't block reads |
| Negative caching | **None.** Empty result = always check source. | Avoids optimizing for a pathology that doesn't exist at expected load |
| Session TTL | **30 minutes default, defensive.** MCP servers don't expose session TTLs in `initialize`. | Long enough to amortize handshake; short enough that server-side expiry rarely catches us out |
| OAuth refresh single-flight | **SETNX-based lock for refresh, in scope.** *Amended after staff-engineer review: not optional. Most common OAuth bug in multi-process services — IdPs that rotate refresh tokens (Google, Microsoft, Slack) reject the second concurrent refresh with `invalid_grant`, locking the user out.* | Required, ~50 LOC |
| Read-side stampede protection | **Deferred until measurement** for `describeTools` and `buildTools`. | Less risky than refresh because read storms hit MCP servers, not credentialed mutation endpoints |
| Refresh ownership | **Backend only.** The edge function's `resolveAccessToken` reads from cache and falls through to the backend's pre-resolved token in payload — but never refreshes itself. | Closes the surface for cross-process refresh races; edge function stays stateless |
| Empty `tools/list` results | **Not cached.** Rely on single-flight (when added) to dampen any storm. *Amended after staff-engineer review: caching empty forever (Q2's no-TTL rule) means a deploy outage produces zero tools for the org until manual refresh.* | User-visible silent breakage is the worst possible failure mode; backend health is secondary |
| Server URL key encoding | **Hash, not raw.** Cache keys use `sha256(serverUrl)[:12]`; a side-table maps hash→URL for admin tooling. *Amended after staff-engineer review: raw URLs in keys break SCAN patterns when URLs contain `:` or `?` or `&`.* | Schema-shape lock-in once data exists; fix now |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Three independent caches, each owning its own concern:          │
│                                                                  │
│  1. OAuth token cache                                            │
│     ─ Lives in: backend's resolveAccessToken (refresh-only here) │
│     ─ Source of truth: oauth_connections table                   │
│     ─ Key: oauth:v1:{orgId}:{providerId}                         │
│     ─ TTL: bound to expiresAt - SAFETY_MARGIN_MS                 │
│     ─ Refresh: SETNX single-flight lock                          │
│                                                                  │
│  2. MCP tools/list cache                                         │
│     ─ Lives in: MCP provider's describeTools                     │
│     ─ Source of truth: MCP server's tools/list response          │
│     ─ Key: mcp_tools:v1:{orgId}:{serverHash}:{serverVersion}     │
│     ─ TTL: none (version-keyed; LRU + manual invalidation)       │
│     ─ Empty results: NOT cached                                  │
│                                                                  │
│  3. MCP session ID cache                                         │
│     ─ Lives in: MCP provider's buildTools                        │
│     ─ Source of truth: MCP server's initialize response          │
│     ─ Key: mcp_session:v1:{orgId}:{serverHash}                   │
│     ─ TTL: 30 minutes (defensive default)                        │
│                                                                  │
│  Side table: server-hash → URL mapping                           │
│     ─ Key: mcp_url:v1:{serverHash}                               │
│     ─ Value: { serverUrl: string, firstSeenAt: number }          │
│     ─ Used by admin invalidation tooling to translate            │
│       hash → URL for human-readable output                       │
└──────────────────────────────────────────────────────────────────┘

Backend (Node) ──(Upstash REST)──> Redis
                       ▲
                       │
Edge function (Deno) ──┘  same Upstash, same keys, no separate client
```

**One Redis backend (Upstash), three caches, each with its own key shape and lifecycle.** Caches don't know about each other. Each cache encapsulates its own invalidation rule.

**Stateless propagation preserved**: edge function reads/writes Redis directly via HTTP; no DB access; cache is the only state surface.

---

## Cache 1: OAuth tokens

### Key + value

```ts
// Key
`oauth:v1:${orgId}:${providerId}`

// Value (JSON-serialized)
interface CachedOAuthToken {
  accessToken: string;
  expiresAt: number;       // epoch ms
  scopes?: string[];
  tokenIssuedAt: number;
}
```

The cached value mirrors `OAuthTokenBundle` from B+C+D. No transformation at read time.

### TTL strategy

```ts
const SAFETY_MARGIN_MS = 60_000;
const ttlSeconds = Math.floor((expiresAt - Date.now() - SAFETY_MARGIN_MS) / 1000);
if (ttlSeconds <= 0) {
  // Skip cache write — Redis SETEX rejects ttl=0 with ERR.
  // The token is too close to expiry; let the next read miss + force refresh inline.
  metric('oauth.token.cache_write_skipped', { providerId, reason: 'too_short_ttl' });
  return;
}
await redis.setex(key, ttlSeconds, JSON.stringify(bundle));
```

Redis TTL expires 60 seconds before actual token expiry. A cache hit returning a token that's about to expire mid-execution would mean the agent makes an API call with an already-expired token. The 60 s margin guarantees enough headroom.

*Amended after staff-engineer review:* the previous spec's `Math.max(0, ...)` then `setex(key, 0, ...)` would be **rejected by Redis with ERR** (`invalid expire time`). Every miss would re-run DB+refresh+write, fail, repeat — write-amplification bug. The corrected branch skips the write entirely; the next read misses cleanly and triggers refresh.

### OAuth refresh single-flight (mandatory, not deferred)

*Amended after staff-engineer review.* Two concurrent reads after a cache miss would both hit the IdP's `/token` endpoint. IdPs that rotate refresh tokens on use (Google, Microsoft, Slack) reject the second `/token` call with `invalid_grant`, locking the user out. Defense:

```ts
const REFRESH_LOCK_TTL_SECONDS = 10;
const REFRESH_LOCK_RETRY_MS = 200;
const REFRESH_LOCK_RETRY_LIMIT = 30;   // ~6 s max wait

async function refreshWithSingleFlight(supabase, orgId, providerId, currentConn) {
  const lockKey = `oauth:lock:v1:${orgId}:${providerId}`;
  const acquired = await redis.set(lockKey, '1', { nx: true, ex: REFRESH_LOCK_TTL_SECONDS });

  if (acquired) {
    try {
      // Re-read the DB row inside the lock window — if another process refreshed
      // and released between our check and our acquire, skip the redundant refresh.
      const fresh = await getConnection(supabase, orgId, providerId);
      if (fresh !== null && !needsRefresh(fresh)) {
        return fresh;
      }
      return await refreshAndStore(supabase, currentConn);
    } finally {
      await redis.del(lockKey);
    }
  }

  // Another process is refreshing. Wait + re-check.
  for (let i = 0; i < REFRESH_LOCK_RETRY_LIMIT; i += 1) {
    await sleep(REFRESH_LOCK_RETRY_MS);
    const fresh = await getConnection(supabase, orgId, providerId);
    if (fresh !== null && !needsRefresh(fresh)) {
      return fresh;
    }
  }
  throw new Error(`OAuth refresh single-flight timeout for ${providerId}`);
}
```

The 10 s lock TTL is a safety against a process that crashes mid-refresh. The 30×200 ms = 6 s waiter limit prevents indefinite hangs.

This addresses the most common OAuth bug in multi-process services — read-side stampede protection for `describeTools` is still deferred (where the cost is hitting an MCP server, not a credentialed mutation), but refresh-side single-flight is mandatory.

### Read path

```ts
async function resolveAccessToken(supabase, orgId, providerId): Promise<OAuthTokenBundle> {
  // 1. Cache lookup
  const cached = await tryRedisGet(key(orgId, providerId));
  if (cached !== null && isFresh(cached)) {
    metric('oauth.token.cache_hit', { providerId });
    return cached;
  }

  // 2. DB lookup
  metric('oauth.token.cache_miss', { providerId });
  const connection = await getConnection(supabase, orgId, providerId);
  if (connection === null) throw new Error(`OAuth not connected for ${providerId}`);

  // 3. Refresh if stale (single-flight protected)
  let token = connection.accessToken;
  let expiresAt = connection.expiresAt;
  if (needsRefresh(connection)) {
    const refreshed = await refreshWithSingleFlight(supabase, orgId, providerId, connection);
    token = refreshed.accessToken;
    expiresAt = refreshed.expiresAt;
  }

  // 4. Cache write (best-effort; Redis errors swallowed)
  await tryRedisSet(key(orgId, providerId), { accessToken: token, expiresAt, ... });
  return { accessToken: token, expiresAt, ... };
}
```

`tryRedisGet` and `tryRedisSet` swallow Redis errors and log a warning. Redis being down is never a fatal error for reads/writes — the DB path is the source of truth. **Exception: invalidation operations (see below) cannot silently fail.**

`isFresh(cached)` is a defensive double-check: if Redis returned a value somehow past `expiresAt - SAFETY_MARGIN`, treat it as a miss. *Amended after review*: this defends against bugs in our own write path that produce an unexpired key with a too-late `expiresAt` — not against clock skew between Upstash and the backend (Upstash sets TTL based on its own clock; we read `expiresAt` from a payload we wrote ourselves).

### Refresh ownership: backend only

*Amended after staff-engineer review.* The edge function (Deno, stateless) **never refreshes**. Its execution context already carries pre-resolved `OAuthTokenBundle`s in `payload.oauth.byProvider` (per B+C+D). Edge function reads from cache only when re-checking freshness during a long-running execution — and on cache miss, it uses the payload's bundle as fallback. Refresh always happens in the backend's `resolveAccessToken` before invoking the edge function.

This closes the surface for cross-process refresh races (the SETNX lock above protects backend-vs-backend; backend-vs-edge cannot occur).

### Write path

Three triggers:
1. **Initial OAuth connect** (oauthCallback handler) — write the new token after exchange.
2. **Token refresh** (`refreshAndStore`) — write the new token after refresh.
3. **Cache miss** (`resolveAccessToken` after a fresh DB read) — write what the DB had, even without refresh.

All three are write-through.

### Invalidation (security boundary — must not silently fail)

*Amended after UX review.* Disconnect is a security action — silently failing to invalidate the cache means the cache continues serving a token whose underlying OAuth grant has been revoked. The user sees "Disconnected ✓" while the runtime keeps using their credentials for up to TTL.

```ts
async function invalidateTokenCache(orgId, providerId): Promise<void> {
  const RETRIES = 3;
  for (let i = 0; i < RETRIES; i += 1) {
    try {
      await redis.del(key(orgId, providerId));
      metric('oauth.token.invalidate.success', { providerId });
      return;
    } catch (err) {
      metric('oauth.token.invalidate.error', { providerId, attempt: i });
      if (i === RETRIES - 1) {
        // After 3 retries: surface to the user. Disconnect must NOT report success
        // if cache invalidation failed.
        throw new InvalidationFailedError({
          providerId,
          message: 'Disconnected, but credential cache invalidation failed. Token may remain active for up to 60 seconds. Contact support if this persists.',
        });
      }
      await sleep(100 * (i + 1));   // 100ms, 200ms, 300ms backoff
    }
  }
}
```

The OAuth disconnect handler in the backend awaits this and surfaces failure to the frontend, which displays a non-blocking warning toast: *"Disconnected. Credential cache may take up to 60s to clear."* The user understands the state instead of being told a clean ✓ while the cache still serves.

### Other invalidation triggers

1. **OAuth disconnect** — see above.
2. **OAuth re-auth / token rotation** — natural overwrite via the write path.
3. **Manual admin invalidation** — see "Operational tooling" below.

### Concurrency

After single-flight refresh (above): the SETNX lock guarantees only one process actually calls the IdP's `/token` endpoint. Other waiters re-read the DB after a short backoff and pick up the refreshed value. No race on refresh-token rotation.

---

## Cache 2: MCP `tools/list`

### Key + value

```ts
// Key — version-bound per Q2 decision; serverUrl is hashed to avoid
// pattern-matching ambiguity (URLs contain `:`, `?`, `&`).
`mcp_tools:v1:${orgId}:${serverHash}:${serverInfoVersion}`

// where serverHash = sha256(serverUrl).slice(0, 12)
// A side-table mcp_url:v1:{serverHash} → { serverUrl, firstSeenAt }
// is maintained for admin tooling to map back hash → URL.

// serverInfoVersion comes from the MCP server's `initialize` response:
//   { serverInfo: { name: "hubspot-mcp", version: "2.4.1" } }
//   → "2.4.1"
//
// If the server returns no version (or empty):
//   → "v0" sentinel; logged as mcp.no_version_field

// Value (JSON-serialized)
interface CachedMcpToolsList {
  serverInfo: { name: string; version: string };
  tools: ToolDescriptor[];
  cachedAt: number;
}
```

*Amended after staff-engineer review.* The previous key (`mcp_tools:v1:{orgId}:{serverUrl}:...`) was vulnerable to pattern ambiguity: a server URL `https://example.com:8443/mcp?auth=foo` contains `:`, `?`, and `&` — all of which break SCAN patterns in Upstash. Hashing the URL fixes this. The side-table is maintained on cache writes (idempotent SET on `mcp_url:v1:{hash}`) and read by admin tooling.

`orgId` in the key for cross-tenant safety. Even though `tools/list` typically returns the same surface across callers, some MCP servers return user-specific tool lists. Including `orgId` prevents leak by construction.

The cost: duplicate cache entries for orgs running the same MCP server. Memory is cheap; correctness is not.

### Cache value size cap

*Amended after staff-engineer review.* Upstash has per-value size limits (1 MB on free tier; configurable on paid). A misbehaving MCP server returning 10k tools can blow this and either error the SET or eat memory. Defense:

```ts
const MAX_CACHE_VALUE_BYTES = 256 * 1024;   // 256 KB

const serialized = JSON.stringify(value);
if (Buffer.byteLength(serialized, 'utf8') > MAX_CACHE_VALUE_BYTES) {
  metric('provider.describe_tools.too_large', { providerId, bytes: serialized.length });
  return;   // skip write; subsequent reads will miss
}
await redis.set(key, serialized);
```

256 KB is generous (a typical MCP server with 50 tools has ~30–80 KB descriptors). Anything larger is anomalous and worth investigating rather than caching.

### Read path

```ts
async describeTools(ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  const serverHash = hashServerUrl(this.serverUrl);

  // 1. Try cache lookup with the cached session's serverInfo.version (cheap fast path)
  const session = await ensureMcpSession(ctx, this.serverUrl);
  const cachedVersion = session.serverInfo.version || 'v0';
  const cached = await tryRedisGet(toolsKey(ctx.orgId, serverHash, cachedVersion));
  if (cached !== null) {
    metric('provider.describe_tools.cache_hit', { providerId: this.id });
    return cached.tools;
  }

  // 2. CACHE MISS: re-initialize to get a FRESH serverInfo.version before writing.
  //    Critical: do NOT trust the cached session's version for the WRITE key.
  //    If the session was cached before a server upgrade, writing under the old
  //    version key would defeat Q2's "cache lives until version bumps" guarantee.
  await redis.del(sessionKey(ctx.orgId, serverHash));   // bust session cache
  const freshSession = await mcpInitialize(ctx, this.serverUrl);
  await tryRedisSet(sessionKey(ctx.orgId, serverHash), freshSession, SESSION_TTL_SECONDS);
  const freshVersion = freshSession.serverInfo.version || 'v0';
  if (!freshSession.serverInfo.version) {
    metric('mcp.no_version_field', { serverHash });
    // If we previously cached under v0 and the server now reports a real version,
    // proactively delete the v0 entry so it doesn't orphan.
  } else if (cachedVersion === 'v0') {
    await redis.del(toolsKey(ctx.orgId, serverHash, 'v0'));
    log.warn('mcp.version_recovered', { serverHash, newVersion: freshVersion });
  }

  // 3. tools/list call against the fresh session
  metric('provider.describe_tools.cache_miss', { providerId: this.id });
  const tools = await mcpToolsList(freshSession);

  // 4. Don't cache empty results (deploy outage protection — see below)
  if (tools.length === 0) {
    metric('provider.describe_tools.empty', { providerId: this.id });
    return tools;
  }

  // 5. Cache write under the FRESH version, with size cap
  const value = { serverInfo: freshSession.serverInfo, tools, cachedAt: Date.now() };
  await tryRedisSetCapped(toolsKey(ctx.orgId, serverHash, freshVersion), value);
  await tryRedisSet(serverUrlSideTableKey(serverHash), { serverUrl: this.serverUrl, firstSeenAt: Date.now() });
  return tools;
}
```

**No TTL on the SET (except for the side-table).** Per Q2: cache lives until server bumps `serverInfo.version`. Old entries die via Redis LRU eviction, not TTL.

*Amended after staff-engineer review (#5):* the previous read path used `session.serverInfo.version` from the cached session for both the read key AND the write key. If the session cache was fresh-but-old (cached before a server upgrade), the `tools/list` write would use the OLD version key — defeating Q2's whole guarantee. The corrected flow re-initializes on cache miss to capture the FRESH version before writing.

*Amended after staff-engineer review (#7):* empty `tools/list` results are NOT cached. A server that briefly returns zero tools during a deploy would otherwise have an empty result cached forever (no TTL), producing user-visible "agent has no tools" failures until manual refresh. The cost is potential cache stampede on persistent empty states — addressed by read-side single-flight when added (deferred, but the deferral is now safer because empty results don't poison the cache).

*Amended after staff-engineer review (#6):* on `v0 → real_version` transition, proactively delete the `v0` key (orphan recovery) and log `mcp.version_recovered` for observability.

### Invalidation

1. **Server upgrades version** — natural via version-bound key.
2. **MCP server uninstall** (user removes from agent's graph) — `redis.del` the key.
3. **Manual invalidation** — operational tooling.
4. **Redis LRU eviction** — backstop for memory pressure.

### Recovery for servers with frozen version field

Per Q2, a server that never bumps version means permanent stale tools. Recovery surfaces:

- **`mcp.no_version_field` metric**, tagged with `serverHash`. Spikes name broken servers (admin tooling translates hash → URL via the side-table).
- **Editor warning at install time** — toast when `initialize` response has no/empty version: *"This MCP server does not expose a version field — tool changes won't be detected automatically. Use Reload Tools to update."* (Now references the existing button.)
- **Durable badge on the MCP server row** — *amended after UX review*. The install-time toast is dismissable and short-lived; the property is permanent. The MCP row in `McpServersSection` shows a small `AlertTriangle` icon next to its status when the cached session reports `serverInfo.version === ''` or absent. Tooltip carries the same warning text. Engineer A installs and dismisses; Engineer B six months later sees the badge.
- **"Last refreshed at"** muted timestamp under the server name when the row is expanded — uses `cachedAt` from the cached `tools/list` value. Engineers can answer "is this stale?" at a glance without clicking Reload.
- **Reload Tools button** (the merged button per the Operational Tooling section) — invalidates and cold-fetches.

*Amended after UX review:* the previous spec relied on install-time warning + a separate Refresh button. The badge + cachedAt timestamp + collapsed Reload Tools verb together make the staleness situation observable instead of relying on the user to remember.

These four are the explicit cost of choosing Q2 (b) over hybrid TTL.

### Edge case: empty tools/list result

*Amended after staff-engineer review.* Server returns zero tools (e.g., during a deploy). Decision: **do NOT cache the empty result.** The `provider.describe_tools.empty` metric counts each empty fetch.

The previous spec cached empty results to avoid storming. That trade-off was wrong: a server that briefly returns zero tools during a deploy would have an empty result cached forever (no TTL per Q2), producing user-visible "agent has no tools" silent failures until manual refresh. The user-impact cost dominates the backend-health cost.

The remaining storm risk: an MCP server in a persistent empty state could be hit on every cache miss across all org's executions. Addressed by read-side single-flight (deferred follow-up #1) — until then, accept the storm; the alternative was worse.

---

## Cache 3: MCP session ID

### Key + value

```ts
// Key — serverUrl hashed for SCAN-pattern safety
`mcp_session:v1:${orgId}:${serverHash}`

// Value (JSON-serialized)
interface CachedMcpSession {
  sessionId: string;
  serverInfo: { name: string; version: string };  // captured for fast-path describeTools reads
  protocolVersion: string;
  capturedAt: number;
}
```

The cached value carries `serverInfo` for the **fast path only** (cache-hit case in `describeTools`). On a `tools/list` cache miss, `describeTools` re-initializes to get a FRESH `serverInfo` before writing — never trust the cached session's version for the write key (see Cache 2's read path).

### TTL strategy

```ts
const SESSION_TTL_SECONDS = 30 * 60;
await redis.setex(key, SESSION_TTL_SECONDS, JSON.stringify(session));
```

30 min default. MCP servers don't expose their session TTL in the `initialize` response. Long enough to amortize handshake; short enough that server-side expiry rarely catches us out. Tuneable per-server later if needed.

### Read path

```ts
async function ensureMcpSession(ctx: ProviderCtx, serverUrl: string): Promise<CachedMcpSession> {
  const cached = await tryRedisGet(sessionKey(ctx.orgId, serverUrl));
  if (cached !== null) {
    metric('mcp.session.cache_hit', { serverUrl });
    return cached;
  }

  metric('mcp.session.cache_miss', { serverUrl });
  const result = await mcpInitialize(ctx, serverUrl);
  await tryRedisSet(sessionKey(ctx.orgId, serverUrl), result);
  return result;
}
```

### `tools/call` failure recovery

Inside MCP provider's `buildTools`, the `execute` closure for a tool wraps the cached session ID:

```ts
async execute(args) {
  let session = await ensureMcpSession(ctx, serverUrl);
  try {
    return await mcpToolsCall(session.sessionId, toolName, args);
  } catch (err) {
    if (isSessionExpired(err)) {
      await redis.del(sessionKey(ctx.orgId, serverUrl));
      metric('mcp.session.expired_recovery', { serverUrl });
      session = await ensureMcpSession(ctx, serverUrl);
      return await mcpToolsCall(session.sessionId, toolName, args);
    }
    throw err;
  }
}
```

`isSessionExpired` recognizes MCP-spec'd error codes (typically 401 with a session-expired marker, or 400 with `code: 'session_expired'`). Single retry only — if the second attempt also fails, the error bubbles to the LLM as a tool-call error.

A stale cached session causes one extra round-trip + one re-initialize at most. Worse than a fresh session by ~100–300 ms; vastly better than re-initializing on every call.

### Invalidation

1. **Server returns session-expired error** → handled inline.
2. **MCP server uninstall** → `redis.del` along with the `tools/list` cache.
3. **Manual admin invalidation** → operational tooling.

### Concurrency

Two concurrent calls for the same `(orgId, serverUrl)` after a session-cache miss can both `initialize`, both write, last-write-wins. Acceptable: both sessions are valid; the loser is unused and expires via its own TTL on the server.

---

## Operational tooling — manual invalidation

Per Q2's choice (no TTL backstop on `tools/list`), an admin recovery path is mandatory.

### Three invalidation surfaces

**1. Per-org per-MCP, user-triggered — through the existing "Reload Tools" button.**

*Amended after UX review.* The previous spec proposed a NEW "Refresh tools" button alongside the existing "Discover Tools / Reload Tools" button in `McpServersSection.tsx`. That's a label collision — two near-synonymous verbs in the same row. Users pick at random; one is "right" and the other is silently wrong.

**Resolution: collapse into one.** The existing `Reload Tools` (label flip of `Discover Tools` once `active`) becomes the cache-invalidation path. Clicking it always cold-fetches (busts both `tools/list` and session cache). The cache is a transparent perf layer beneath `describeTools` for non-user-initiated calls; the user-initiated path always invalidates first.

The handler:

```
DELETE /agents/:agentId/mcp-cache/:mcpServerId    (gated by requireAuth)
Resp: 200 { invalidated: number }                  — count of deleted keys
       403 user not in agent's org
       404 agent or mcpServer not found
```

The handler deletes both `mcp_tools:v1:{orgId}:{serverHash}:*` (multiple versions may have accumulated) and `mcp_session:v1:{orgId}:{serverHash}`. The frontend's existing `onDiscover` plumbing first calls this DELETE then triggers a fresh `describeTools` call. Single button, one verb, no collision.

User feedback (added after UX review): on success, toast `Refreshed N tools`; on failure (Redis or MCP server unreachable), toast `Refresh failed — using last known tools`. Reuses the existing `isDiscovering` gate to disable the button mid-call (no double-click stampede).

**2. Per-MCP-server, admin-triggered (cross-org).**

CLI command in `packages/backend`:

```
npm run cache:invalidate-mcp -- --serverUrl=https://hubspot.example/mcp
```

The script:
1. Computes `serverHash = sha256(serverUrl).slice(0, 12)`.
2. Scans matching keys (`mcp_tools:v1:*:{serverHash}:*` + `mcp_session:v1:*:{serverHash}`) using SCAN with cursor pagination.
3. Implements idempotency: writes its progress to `cache_invalidation_progress:v1:{jobId}` after each batch so a crashed script can be resumed via `--resume=<jobId>`.
4. Reports per-org breakdown in stdout for audit.
5. Used during incidents.

*Amended after staff-engineer review:* hashing the URL eliminates pattern-matching ambiguity (URLs contain `:`, `?`, `&`). The progress key + `--resume` flag prevents partial-invalidation orphaning when the script dies mid-scan over 100k+ keys.

**3. Per-org, admin-triggered (full nuclear).**

```
npm run cache:invalidate-org -- --orgId=9d3a-2b71-...
```

Deletes everything under `*:v1:{orgId}:*`. For account-level recovery.

### Cache key versioning prefix as a global escape hatch

Every key prefixed with `v1`. If a future cache-format change makes the entire body shape incompatible, bumping the prefix to `v2` causes cold start without manual deletion. Old `v1:` keys evict via LRU.

### Authorization

User-triggered surface (#1): gated by org membership — same model as A's PATCH route.

Admin-triggered surfaces (#2, #3): CLI-only, run by engineers with backend production access. No REST surface — that would be an accidental DOS vector.

### What we explicitly don't build

- Web admin panel for cache management. Premature.
- Per-tool cache invalidation. Tools live inside `tools/list` cache — invalidate the whole entry.
- TTL-based fallback for `tools/list`. Contradicts Q2's decision.

---

## Observability

Builds on B+C+D's metrics (the `provider.describe_tools` / `provider.build_tools` histograms split by `cache_state: 'cold' | 'warm'`).

| Metric | Type | Tags | Purpose |
|---|---|---|---|
| `oauth.token.cache_hit` | counter | `providerId`, `orgId` | Token cache effectiveness. Target: ≥ 90% steady-state. |
| `oauth.token.cache_miss` | counter | `providerId`, `orgId` | Misses. Spikes correlate with deploys, expiries, eviction. |
| `oauth.token.cache_unavailable` | counter | — | Redis down. Should be near-zero; alert on sustained non-zero. |
| `provider.describe_tools.cache_hit` | counter | `providerId` | tools/list cache hit. |
| `provider.describe_tools.cache_miss` | counter | `providerId`, `reason` (`first_install`, `version_change`, `manual_invalidation`, `lru_eviction`) | Why miss happened. `lru_eviction` spike = cache undersized. |
| `provider.describe_tools.empty` | counter | `providerId` | Server returned zero tools. Anomaly signal. |
| `mcp.session.cache_hit` | counter | `serverUrl` | Session reuse working. |
| `mcp.session.cache_miss` | counter | `serverUrl` | Session re-initialize required. |
| `mcp.session.expired_recovery` | counter | `serverUrl` | Cached session was stale; recovered with one re-init. Should be rare. |
| `mcp.no_version_field` | counter | `serverHash` | **Critical for Q2 (b)** — broken servers surface here. Every spike investigated. (`serverHash` instead of full URL — translate via side-table for human-readable output.) |
| `mcp.version_recovered` | counter | `serverHash`, `newVersion` | A server transitioned `v0 → real_version`. Triggers proactive `del` of the `v0` key. |
| `provider.describe_tools.too_large` | counter | `providerId`, `bytes` | Cache value exceeded 256 KB threshold; write skipped. |
| `oauth.token.cache_write_skipped` | counter | `providerId`, `reason` (`too_short_ttl`) | Token TTL after safety margin would be ≤ 0; SETEX skipped. Should be rare. |
| `oauth.token.invalidate.success` | counter | `providerId` | Cache invalidation succeeded (security boundary). |
| `oauth.token.invalidate.error` | counter | `providerId`, `attempt` | Cache invalidation retry on Redis failure. Sustained non-zero = security issue. |
| `oauth.refresh.lock_acquired` | counter | `providerId` | Single-flight lock acquired (this process owns the refresh). |
| `oauth.refresh.lock_waiter` | counter | `providerId` | Single-flight lock contention (this process waited for another). |
| `oauth.refresh.lock_timeout` | counter | `providerId` | Waited 6 s without observing a refreshed token. Should be near-zero. |
| `cache.invalidate.manual` | counter | `surface` (`user`, `admin_per_mcp`, `admin_per_org`, `prefix_bump`) | Operational invalidation events. |

Cache-hit-ratio dashboards built from hit/miss pairs. Targets after E lands: token cache ≥ 90%, tools/list ≥ 95%, session ≥ 70%.

### Logging

Structured `WARN` for:
- Redis connectivity failures (rate-limited; one log per outage start, not per call)
- `mcp.no_version_field` first occurrence per `serverHash` per process lifetime
- `mcp.version_recovered` (always, with hash + old/new version)
- Manual cache invalidations (audit trail)
- Cache hit returning a token past `expiresAt - SAFETY_MARGIN` (own-write-path bug detection)
- Single-flight lock timeout exceeding 6 s waiter limit
- Cache value rejected for size (`provider.describe_tools.too_large` first occurrence per `serverHash`)

### PII redaction policy

*Amended after staff-engineer review.* Cache values contain sensitive material (`accessToken`). Logs and metrics tags must never carry these. Specifically:
- **`accessToken` MUST NOT appear in any log line, metric tag, or error message.** Audit by static analysis if available.
- **`serverUrl` may contain credentials in path/query** (e.g., `https://example.com/mcp?key=abc`). Logs include `serverHash` only; the side-table maps hash → URL but is read by admin tooling, not log aggregators.
- **`orgId` cardinality** — at scale, `orgId` as a metrics tag costs real money on backends like Datadog (~$0.05–$0.15 per unique tag value depending on plan). Verify the project's metrics backend handles this cardinality before shipping; if not, sample or aggregate instead.

### Redis isolation

*Amended after staff-engineer review.* **Production and staging MUST use separate Upstash databases.** A staging backend with credentials that can read prod keys defeats every cross-tenant guarantee. Verified at deploy time by environment-specific tokens (`UPSTASH_REDIS_REST_TOKEN_PROD` vs `UPSTASH_REDIS_REST_TOKEN_STAGING`). Never reuse tokens across environments.

---

## Testing

### Unit tests (per cache)

For each of the three caches:
- Read miss → fetch → write → subsequent read returns cached value
- Read hit → no underlying fetch invoked (spy on source-of-truth path)
- Cache write failure (Redis down) → operation succeeds; subsequent read is a miss; `*.cache_unavailable` metric incremented
- Cache read failure (Redis down) → operation falls through to source; result correct
- Manual invalidation → next read is a miss

### OAuth-token-specific tests

- TTL set to `expiresAt - SAFETY_MARGIN_MS - now`; assert via SETEX argument.
- Token at `expiresAt - 30s` (within safety margin) → not cached (TTL would be 0); next read is miss → DB lookup → refresh → cache write.
- `isFresh` defensive check rejects a cached token somehow past safety margin.

### MCP-tools-list tests

- Server returns `serverInfo.version: "1.0.0"` → key includes `1.0.0`.
- Server returns no version → key includes `v0` sentinel; `mcp.no_version_field` counter incremented.
- Server bumps version → next read uses new key; old key untouched.
- Empty tools array cached normally; `provider.describe_tools.empty` incremented.
- Manual invalidation: `DELETE /agents/:id/mcp-cache/:mcpServerId` deletes all matching keys.

### MCP-session tests

- Session cached; subsequent `tools/call` uses cached `sessionId`.
- Server returns session-expired error → cache key evicted, single re-initialize, retry once.
- Session expired AND retry also fails → error bubbles to LLM (no infinite retry).
- Concurrent cache writes from two executions: last-write-wins, both sessions valid.

### Cross-tenant safety tests (mandatory)

- Two orgs with the same `serverUrl` get distinct cache entries.
- Org A's cached value invisible to Org B's reads.
- Test runs against a real Upstash instance (or a mock honoring same key/value semantics) — not just an in-memory map. The cross-tenant key derivation must actually be tested.

### Integration test

End-to-end agent execution with cold cache, then warm cache — assert latency reduction by an expected ratio. (Specific numbers vary; warm should be measurably faster than cold.)

### Test file naming

```
packages/backend/src/google/calendar/__tests__/
  tokenCache.test.ts                    (OAuth token cache)
packages/api/src/providers/mcp/__tests__/
  toolsListCache.test.ts                (MCP tools/list cache)
  sessionCache.test.ts                  (MCP session cache)
  crossTenant.test.ts                   (orgId isolation across all 3)
```

---

## Files touched

| Path | Change |
|---|---|
| `packages/backend/src/cache/redis.ts` (new) | Upstash client wrapper with `tryGet`, `trySet`, `tryDel`, error swallowing + metrics |
| `packages/backend/src/google/calendar/tokenResolver.ts` | Wrap `resolveAccessToken` with cache-first read path |
| `packages/backend/src/google/calendar/tokenCache.ts` (new) | Cache key/value helpers, `isFresh`, TTL computation |
| `packages/backend/src/routes/oauth/oauthCallback.ts` | Write to cache on initial connect |
| `packages/backend/src/routes/oauth/oauthDisconnect.ts` | Delete cache key on disconnect |
| `packages/api/src/providers/mcp/buildMcpProvider.ts` | Wrap `describeTools` and `ensureMcpSession` with cache layers |
| `packages/api/src/providers/mcp/toolsListCache.ts` (new) | Cache logic for MCP tools/list |
| `packages/api/src/providers/mcp/sessionCache.ts` (new) | Cache logic for MCP session ID |
| `packages/backend/src/routes/agents/invalidateMcpCache.ts` (new) | DELETE handler for user-triggered invalidation |
| `packages/backend/src/routes/agents/agentRouter.ts` | Mount the invalidation route |
| `packages/backend/src/scripts/cacheInvalidateMcp.ts` (new) | CLI for admin per-MCP invalidation |
| `packages/backend/src/scripts/cacheInvalidateOrg.ts` (new) | CLI for admin per-org invalidation |
| `packages/backend/package.json` | Add the two CLI scripts to npm scripts |
| `packages/web/app/components/panels/McpServersSection.tsx` | Add `Refresh tools` button per MCP row |
| `packages/web/app/actions/mcpCache.ts` (new) | Server action calling DELETE invalidation route |
| `packages/web/messages/en.json` | Translations for refresh button + the broken-version-field warning |

---

## Required follow-ups (not optional)

| # | Obligation | Resolution gate | Owner / mechanism |
|---|---|---|---|
| 1 | **Read-side single-flight for `describeTools` and session establishment.** Refresh-side single-flight is now in the spec (*amended after staff-engineer review*). Read-side stampede protection is still deferred — the cost of a burst hits MCP servers (mostly external, mostly resilient) rather than credentialed mutation endpoints. | Production load where coordinated misses (deploy, prefix bump, mass eviction) cause MCP `tools/list` latency spikes >1 s. | Add inside the existing cache wrappers using SETNX; ~50 LOC. Required when measurement shows it; not before. |
| 2 | **Per-MCP session TTL configurability.** The 30-min default may be wrong for some servers. Need a per-server override mechanism (probably a column in the MCP library or a per-execution payload field). | When a real MCP server's session TTL is observed to differ materially. | Add a `sessionTtlSeconds` field to `McpServerConfig`; cache layer reads it. |
| 3 | **Admin metric dashboards.** Cache hit ratios, `mcp.no_version_field`, `oauth.token.cache_unavailable` need surfaces engineers actually look at. Without dashboards, the metrics ship blind. | Before E ships to production traffic. | Implementation-time obligation. Dashboards built against the project's observability backend (verify during planning). |
| 4 | **Pen-test cross-tenant isolation.** Cross-tenant safety is a security property — needs explicit verification beyond the unit test. A red-team attempt to read another org's cached values via key-prediction or timing should be conducted before any prod deploy. | Before E ships to production with multi-tenant data. | Security review or adversarial test in CI. |
| 5 | **Cache size + eviction monitoring.** Upstash has a free-tier memory limit; LRU eviction silently drops entries. Need a sentinel that detects "high eviction rate = cache undersized." | Once production usage produces meaningful working-set sizes. | Tracked via the `lru_eviction` reason on `provider.describe_tools.cache_miss`; alert if it crosses a threshold. |
| 6 | **Cache poisoning rate limit.** *Added after staff-engineer review.* A malicious or buggy MCP server returning `Math.random()` for `serverInfo.version` causes infinite cache key growth under one orgId. Pattern: per-(org, serverHash) cache-write rate limit (e.g., max 10 distinct version keys created per 5 minutes); on threshold hit, refuse cache writes for that pair and emit `mcp.version_thrashing` alarm. | First production incident with a misbehaving MCP. | Implement inside Cache 2's write path. Cheap; ~20 LOC. |
| 7 | **Cross-tenant penetration test.** *Added after staff-engineer review.* Cross-tenant safety is a security property — needs explicit verification beyond unit tests. A red-team attempt to read another org's cached values via key-prediction, hash collision, timing, or cardinality side-channels should be conducted before any production deploy with multi-tenant data. | Before E ships to production with multi-tenant data. | Security review or adversarial test in CI. |
| 8 | **Cross-tab cache consistency on Refresh.** *Added after UX review.* User opens two editor tabs; Tab 1 hits Reload Tools; Tab 2 still holds stale SWR cache. The server action backing Reload should call `revalidateTag` (or equivalent) on the route's tool-registry tag so all open tabs see fresh data within SWR's revalidation cycle. | Ship-time concern; users routinely have multiple tabs open in dev tools. | Implementation-time obligation in the Reload Tools handler. |
| 9 | **`v1 → v2` prefix migration playbook.** *Added after staff-engineer review.* When a future cache-format change requires bumping the prefix, every cache miss between deploy and warm-up hammers the DB / MCP servers. Required playbook: deploy during low-traffic window, OR ship read-side single-flight (#1) first, OR pre-warm critical orgs via a CLI tool. | Any future cache-format change. | Document the playbook before any prefix bump; don't ship the bump itself without picking one of the three. |

These are not "known limitations" — they are obligations with explicit resolution gates. Each must be tracked in the project's issue tracker as part of landing E.

---

## Status

- Brainstorming: complete.
- Written spec: this document, v2 (post-review).
- Spec review: completed by staff-engineer + UX subagents (2026-04-26).
- Awaiting: user review of v2.
- After approval: writing-plans for sub-projects A, B+C+D, E in sequence.

---

## Revisions

### v2 — 2026-04-26

Amendments incorporated from staff-engineer + UX dual review. Grouped by cluster:

**Cluster A — Correctness bugs (all critical):**
- **`SETEX key 0` write-amplification bug fixed.** Redis rejects `ttl=0` with ERR; previous code would have looped DB+refresh+failed-write indefinitely. Corrected: skip cache write entirely when `ttlSeconds <= 0`; next read misses cleanly and forces refresh inline.
- **OAuth refresh single-flight is now mandatory.** SETNX-based lock per `(orgId, providerId)` with 10 s TTL and 6 s waiter limit. Was deferred; that was wrong — IdPs that rotate refresh tokens (Google, Microsoft, Slack) lock users out on the second concurrent `/token` call. ~50 LOC, in scope.
- **`serverUrl` hashed in cache keys** (`sha256(serverUrl).slice(0, 12)`). Raw URLs in keys break SCAN patterns when URLs contain `:`, `?`, or `&`. Side-table `mcp_url:v1:{hash}` maps back hash → URL for admin tooling.
- **Session cache poisoning of tools/list cache fixed.** On `tools/list` cache miss, the read path now re-initializes to capture a FRESH `serverInfo.version` before writing. The previous spec used the cached session's version for the write key, which broke Q2's "cache lives until version bumps" guarantee when sessions were fresh-but-old.
- **`v0 → real_version` orphan recovery added.** When a server transitions from no-version to a real version, proactively `del` the `v0` key and emit `mcp.version_recovered`. Closes the permanent-orphan path.
- **Empty `tools/list` results not cached.** Previously cached empty forever (no TTL per Q2), producing user-visible "agent has no tools" silent failures during deploy outages. Caching empty was the wrong tradeoff (backend health > user impact); user impact wins.
- **Cache value size cap (256 KB).** Misbehaving servers returning 10k tools could blow Upstash's 1 MB per-value limit. Skip cache write + emit `provider.describe_tools.too_large` if exceeded.
- **Refresh ownership: backend only.** Edge function never refreshes; closes cross-process refresh race surface.

**Cluster B — Operational hygiene:**
- **Cache invalidation on security boundaries cannot silently fail.** OAuth disconnect retries 3 times; on persistent failure, surfaces `InvalidationFailedError` to the user. The frontend shows a non-blocking warning toast — no more silently-stale tokens after "Disconnected ✓".
- **`isFresh` rationale corrected.** Defends against own-write-path bugs, not Upstash↔backend clock skew.
- **PII redaction policy** documented: `accessToken` never in logs/metrics; `serverUrl` replaced by `serverHash`; `orgId` cardinality cost flagged for the metrics backend.
- **Redis isolation: prod and staging use separate Upstash databases.** Stated explicitly.
- **Admin invalidation script** uses SCAN-with-progress-tracking + `--resume=<jobId>` flag. Idempotent recovery from partial failures.

**Cluster C — UX critical fixes:**
- **"Refresh tools" button collapsed into existing "Reload Tools".** The previous spec proposed a parallel button next to Discover Tools / Reload Tools — label collision; users would pick at random. Single button, one verb: Reload Tools always invalidates the cache then cold-fetches. Cache becomes a transparent perf layer beneath non-user-initiated `describeTools` calls.
- **Durable badge for no-version servers.** The install-time warning toast is dismissable and short-lived; the property is permanent. Added an `AlertTriangle` icon next to the status icon on the MCP row when version is `v0`, with tooltip carrying the warning text.
- **"Last refreshed at" timestamp** surfaced in the panel from the existing `cachedAt` field — answers "is this stale?" without clicking Reload.
- **Cross-tab consistency** added as required follow-up #8 — the Reload Tools handler invalidates SWR/RSC caches via `revalidateTag` for cross-tab freshness.
- **Toast feedback on Reload** — success: `Refreshed N tools`; failure: `Refresh failed — using last known tools`.
- **Refresh-while-discovering gate** — the existing `isDiscovering` flag continues to disable the button mid-call (prevents double-click stampede).

**Cluster D — Editorial:**
- Required follow-ups expanded from 5 to 9 items (added cache poisoning rate limit, pen test, cross-tab consistency, prefix migration playbook).

These amendments add ~150 LOC of code and a meaningful amount of operational rigor. Net effect: the spec went from "good first draft with several real bugs" to "ready to implement without surprises."
