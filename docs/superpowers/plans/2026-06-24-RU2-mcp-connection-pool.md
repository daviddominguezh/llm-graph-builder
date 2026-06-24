# RU2 — MCP connection pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the long-running backend a warm MCP connection cache so a tool call borrows a warm connection (keyed `agentId::tenantId::mcpBindingId`) instead of reconnecting per call, sharded across Fly machines by consistent hashing and exposed to the runtime via `/internal/mcp/{invoke,preflight}` + an `McpPoolClient`.

**Architecture:** A backend-owned pool (`packages/backend/src/mcp/pool/`) wraps the existing api MCP primitives (`connectMcp`, `createTransport`, `McpClientHandle.callTool`) and absorbs the old `ensureSession`/`sessionCache` reattach logic, re-keyed to `poolKey`. Owner selection uses a consistent-hash ring over live Fly machines (resolved from `vms.<app>.internal` internal DNS); the entry instance either handles locally, replies `fly-replay`, or — on a dead owner — forwards over 6PN and re-routes. The runtime/Worker never sees Fly topology: it calls `McpPoolClient.invoke()` once and gets one response; only a crash *mid-execution* surfaces a typed `uncertain_outcome` error. Egress guard runs on connect and re-validates on borrow; tenant/binding ownership is derived server-side from `agentId`; OAuth is resolved in the connect path (`resolveAccessToken`, 401→reconnect).

**Tech Stack:** TypeScript (ESM, NodeNext, strict), Express + zod (backend HTTP), `node:dns/promises` `resolveTxt`/`lookup`, Jest ESM (`unstable_mockModule`), Upstash Redis (existing session-id cache), Fly.io `fly-replay` + `replay_cache` + 6PN internal DNS.

## Global Constraints

- Monorepo npm workspaces. ESM (`"type":"module"`, NodeNext). TS strict, `noUncheckedIndexedAccess`. **Never `any`. Never eslint-disable.**
- ESLint: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2 — split into helpers/files, never compress lines.
- Tests: Jest ESM — `npm run test -w packages/<pkg> -- --testPathPattern=…`. Full gate: `npm run check`.
- Prettier: single quotes, 2-space, width 110, trailing comma es5; `@trivago` import sorting.
- No new user-facing copy expected; if any is added, add translations.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and stage files explicitly (never `git add -A`/`-am`).

---

## Decisions / spec-vs-code notes (read before starting)

These are real-code findings that shape the plan. They are NOT silent fixes — each is called out:

- **`mcpBindingId` == `McpServerConfig.id`.** There is no separate `mcp_binding_id` column. The persisted binding is the composite key `(agent_id, server_id, tenant_id)` in `graph_mcp_server_tenant_config` (`mcpTenantConfigQueries.ts`). The spec's `mcpBindingId` maps to `server.id`. We honor the spec's wire field name `mcpBindingId` but resolve it as `server.id`.
- **No `RuntimeServices` type / `mcpPool` injection field exists yet.** `ProviderCtx` (`packages/api/src/providers/provider.ts`) exposes a `services` resolver closure, not named service fields. The spec says `McpPoolClient` is "injected as `RuntimeServices.mcpPool` in RU3/RU4". **RU2 only defines and exports `McpPoolClient`; the `ProviderCtx`/seam injection is deferred to RU3/RU4.** Task 10 below flips the seam behind an *optional* injected client so the existing `withSession` path stays the default until RU3/RU4 wire the client in. This avoids breaking the api package (which cannot import the backend pool).
- **`buildMcpProvider` lives in the api package**, which has no DB/Redis/Fly access and must not import the backend. So the seam flip in Task 10 calls an injected `McpPoolClient` interface (defined in api), and the *backend* supplies the concrete client. The api package change is purely additive (a new optional option), preserving the current default behavior.
- **No Fly internal-DNS / membership code exists.** Built fresh in Tasks 5. The exact `vms.<app>.internal` TXT record format is per Fly docs (`"<machine_id> <region>"` per record); we parse defensively (first token = machine id) and document the assumption in code comments. Confirm against a real Fly deploy before production.
- **`resolveAccessToken(supabase, orgId, libraryItemId, mcpServerUrl): Promise<string>`** — OAuth keys on `orgId + libraryItemId`, NOT on `tenantId`. The poolKey's `tenantId` reflects tenant-scoped transport config (SP4), not grants. Consistent with spec §12.
- **Sim migration (Task 12):** the sim path uses BOTH `createMcpSession` (lifecycle.ts direct-connect) AND `composeRegistry`/`buildSimulationRegistry`. RU2 migrates the **direct-connect `createMcpSession` bypass** in `simulateHandler.ts` to route MCP tool calls through the in-process pool. The registry path and the `lifecycle.ts` deletion are deferred to RU3/RU6 (spec §2, §11).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/backend/src/mcp/pool/poolKey.ts` (create) | Build/parse `poolKey = agentId::tenantId::mcpBindingId`; types. |
| `packages/backend/src/mcp/pool/poolEntry.ts` (create) | `PoolEntry` shape + per-entry connect/reattach (absorbs `ensureSession`/`sessionCache` re-keyed to poolKey), health-validate, close. |
| `packages/backend/src/mcp/pool/connectionPool.ts` (create) | The cache map: borrow/return with refcount, shared `connecting` promise, TTL+LRU eviction (stdio tighter), keepalive loop, lazy reconnect-on-borrow, connect-failure cooldown. |
| `packages/backend/src/mcp/pool/connectEntry.ts` (create) | Connect a `PoolEntry` from an `McpServerConfig`: egress guard on connect, OAuth resolve + apply to transport, 401→reconnect-once. |
| `packages/backend/src/mcp/pool/ring.ts` (create) | Consistent-hash ring (≈150 vnodes/machine), `ownerFor(poolKey)`, non-crypto hash. |
| `packages/backend/src/mcp/pool/membership.ts` (create) | Resolve `vms.<app>.internal` TXT → `{machineId, region}[]`, cache ~3s, local machine id from `FLY_MACHINE_ID`. |
| `packages/backend/src/mcp/pool/routing.ts` (create) | Routing decision: owner==self→local; else `fly-replay` header; dead-owner→6PN internal-forward + re-route. |
| `packages/backend/src/mcp/pool/resolveBinding.ts` (create) | Server-side: `agentId` (+`tenantId`,`mcpBindingId`) → resolved `McpServerConfig` + `orgId` from DB (never trusts caller). |
| `packages/backend/src/routes/internal/mcpInvoke.ts` (create) | `POST /internal/mcp/invoke` handler: auth-derive identity, egress re-validate on borrow, borrow→callTool→return, `uncertain_outcome` only on mid-exec failure. |
| `packages/backend/src/routes/internal/mcpPreflight.ts` (create) | `POST /internal/mcp/preflight` handler: warm the entry, 200/400. |
| `packages/backend/src/routes/internal/internalRouter.ts` (modify) | Mount the two new routes. |
| `packages/api/src/providers/mcp/poolClient.ts` (create) | `McpPoolClient`: build poolKey, set `x-mcp-poolkey`, POST invoke, map transport/`uncertain_outcome` → typed tool-level error. |
| `packages/api/src/providers/mcp/index.ts` (modify) | Re-export `McpPoolClient` + its types. |
| `packages/api/src/providers/mcp/buildMcpProvider.ts` (modify) | Add optional `mcpPool?: McpPoolInvoker` option; in `buildExecuteFn`, call `mcpPool.invoke` when present, else the existing `withSession` path. |
| `packages/backend/src/routes/simulateHandler.ts` (modify) | Route the direct-connect MCP path through the in-process pool. |
| `fly.toml` (modify) | Add `[http_service.http_options]` + `replay_cache` block. |

---

### Task 1: Pool key + entry scaffold + connection map (borrow/return, refcount, shared connect)

**Files:**
- Create: `packages/backend/src/mcp/pool/poolKey.ts`
- Create: `packages/backend/src/mcp/pool/poolEntry.ts`
- Create: `packages/backend/src/mcp/pool/connectionPool.ts`
- Test: `packages/backend/src/mcp/pool/__tests__/connectionPool.test.ts`

**Interfaces:**
- Consumes: `McpClientHandle` from `@daviddh/llm-graph-runner` (`{ readonly initialized; readonly sessionId: string | null; listTools(): Promise<RawMcpTool[]>; callTool(name: string, args: unknown): Promise<ToolsCallResult>; close(): Promise<void> }`).
- Produces:
  - `buildPoolKey(parts: { agentId: string; tenantId: string; mcpBindingId: string }): string` → `` `${agentId}::${tenantId}::${mcpBindingId}` ``.
  - `interface PoolEntry { handle: McpClientHandle | null; lastUsed: number; borrows: number; isStdio: boolean; connecting?: Promise<McpClientHandle>; connectFailedUntil?: number }`.
  - `interface ConnectionPool { borrow(key: string, connect: () => Promise<McpClientHandle>): Promise<McpClientHandle>; release(key: string): void; size(): number; has(key: string): boolean; }`
  - `createConnectionPool(opts?: { maxEntries?: number; maxStdioEntries?: number }): ConnectionPool`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/mcp/pool/__tests__/connectionPool.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import { buildPoolKey } from '../poolKey.js';
import { createConnectionPool } from '../connectionPool.js';

function fakeHandle(): McpClientHandle {
  return {
    initialized: { protocolVersion: '2024-11-05', serverInfo: { name: 'x', version: '1' }, capabilities: {} },
    sessionId: null,
    listTools: async () => [],
    callTool: async () => ({ content: [] }),
    close: jest.fn<() => Promise<void>>(async () => undefined),
  } as unknown as McpClientHandle;
}

describe('buildPoolKey', () => {
  it('joins parts with ::', () => {
    expect(buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' })).toBe('a::t::b');
  });
});

describe('connectionPool borrow/return', () => {
  it('connects once for the same key across concurrent borrows (shared connecting promise)', async () => {
    const pool = createConnectionPool();
    const connect = jest.fn<() => Promise<McpClientHandle>>(async () => fakeHandle());
    const key = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });
    const [h1, h2] = await Promise.all([pool.borrow(key, connect), pool.borrow(key, connect)]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(h1).toBe(h2);
    expect(pool.size()).toBe(1);
    pool.release(key);
    pool.release(key);
  });

  it('reuses the warm handle on a second borrow without reconnecting', async () => {
    const pool = createConnectionPool();
    const connect = jest.fn<() => Promise<McpClientHandle>>(async () => fakeHandle());
    const key = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });
    await pool.borrow(key, connect);
    pool.release(key);
    await pool.borrow(key, connect);
    pool.release(key);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=connectionPool`
Expected: FAIL — cannot find module `../poolKey.js` / `../connectionPool.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/mcp/pool/poolKey.ts
import type { McpClientHandle } from '@daviddh/llm-graph-runner';

export interface PoolKeyParts {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
}

const SEP = '::';

export function buildPoolKey(parts: PoolKeyParts): string {
  return `${parts.agentId}${SEP}${parts.tenantId}${SEP}${parts.mcpBindingId}`;
}

export interface PoolEntry {
  handle: McpClientHandle | null;
  lastUsed: number;
  borrows: number;
  isStdio: boolean;
  connecting?: Promise<McpClientHandle>;
  connectFailedUntil?: number;
}
```

```ts
// packages/backend/src/mcp/pool/poolEntry.ts
import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import type { PoolEntry } from './poolKey.js';

export function newEntry(isStdio: boolean): PoolEntry {
  return { handle: null, lastUsed: Date.now(), borrows: 0, isStdio };
}

export function markUsed(entry: PoolEntry): void {
  entry.lastUsed = Date.now();
}

export async function closeEntry(entry: PoolEntry): Promise<void> {
  const { handle } = entry;
  entry.handle = null;
  if (handle === null) return;
  try {
    await handle.close();
  } catch {
    // best-effort: server may already be gone
  }
}
```

```ts
// packages/backend/src/mcp/pool/connectionPool.ts
import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import { type PoolEntry } from './poolKey.js';
import { markUsed, newEntry } from './poolEntry.js';

export interface ConnectionPool {
  borrow: (key: string, connect: () => Promise<McpClientHandle>) => Promise<McpClientHandle>;
  release: (key: string) => void;
  size: () => number;
  has: (key: string) => boolean;
  entries: () => Map<string, PoolEntry>;
}

export interface ConnectionPoolOptions {
  maxEntries?: number;
  maxStdioEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 2_000;
const DEFAULT_MAX_STDIO_ENTRIES = 200;

async function connectInto(
  entry: PoolEntry,
  connect: () => Promise<McpClientHandle>
): Promise<McpClientHandle> {
  if (entry.handle !== null) return entry.handle;
  if (entry.connecting === undefined) {
    entry.connecting = connect();
  }
  try {
    const handle = await entry.connecting;
    entry.handle = handle;
    return handle;
  } finally {
    entry.connecting = undefined;
  }
}

export function createConnectionPool(opts: ConnectionPoolOptions = {}): ConnectionPool {
  const map = new Map<string, PoolEntry>();
  return {
    entries: () => map,
    size: () => map.size,
    has: (key) => map.has(key),
    borrow: async (key, connect) => {
      let entry = map.get(key);
      if (entry === undefined) {
        entry = newEntry(false);
        map.set(key, entry);
      }
      entry.borrows += 1;
      markUsed(entry);
      return await connectInto(entry, connect);
    },
    release: (key) => {
      const entry = map.get(key);
      if (entry === undefined) return;
      if (entry.borrows > 0) entry.borrows -= 1;
      markUsed(entry);
    },
  };
}
```

(`opts.maxEntries`/`maxStdioEntries` defaults are referenced by Task 2's eviction; keep them on the options object now so the constructor signature is stable. `DEFAULT_MAX_ENTRIES`/`DEFAULT_MAX_STDIO_ENTRIES` are consumed in Task 2.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=connectionPool`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/pool/poolKey.ts packages/backend/src/mcp/pool/poolEntry.ts packages/backend/src/mcp/pool/connectionPool.ts packages/backend/src/mcp/pool/__tests__/connectionPool.test.ts
git commit -m "feat(backend): MCP pool scaffold — poolKey, borrow/return, refcount, shared connect

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Eviction (TTL + LRU, stdio tighter) + keepalive + lazy reconnect-on-borrow

**Files:**
- Modify: `packages/backend/src/mcp/pool/connectionPool.ts`
- Modify: `packages/backend/src/mcp/pool/poolEntry.ts`
- Test: `packages/backend/src/mcp/pool/__tests__/eviction.test.ts`

**Interfaces:**
- Consumes: `ConnectionPool`, `PoolEntry`, `createConnectionPool` from Task 1; `McpClientHandle.listTools`/`close`.
- Produces:
  - `createConnectionPool(opts?: { maxEntries?; maxStdioEntries?; idleTtlMs?; now?: () => number })` — `now` is an injectable clock seam for tests.
  - On `connectionPool`: `evict(): Promise<void>` (TTL+LRU, never evicts borrowed entries, stdio capped at `maxStdioEntries`).
  - `validateOrReconnect(entry: PoolEntry, connect, isHealthy): Promise<McpClientHandle>` exported from `poolEntry.ts`: on borrow, if handle present run `isHealthy(handle)`; if unhealthy close + reconnect once.
  - `startKeepalive(pool, ping, opts): () => void` — periodic jittered ping over idle entries; returns a stop fn. (Defined here; wired by the route in Task 7.)

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/mcp/pool/__tests__/eviction.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import { buildPoolKey } from '../poolKey.js';
import { createConnectionPool } from '../connectionPool.js';

function fakeHandle(closeSpy?: () => Promise<void>): McpClientHandle {
  return {
    initialized: { protocolVersion: '2024-11-05', serverInfo: { name: 'x', version: '1' }, capabilities: {} },
    sessionId: null,
    listTools: async () => [],
    callTool: async () => ({ content: [] }),
    close: closeSpy ?? (async () => undefined),
  } as unknown as McpClientHandle;
}

describe('eviction', () => {
  it('evicts the idle-expired entry and closes its handle', async () => {
    let clock = 1_000;
    const pool = createConnectionPool({ idleTtlMs: 100, now: () => clock });
    const closed = jest.fn<() => Promise<void>>(async () => undefined);
    const key = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });
    await pool.borrow(key, async () => fakeHandle(closed));
    pool.release(key);
    clock = 2_000; // > idleTtlMs past lastUsed
    await pool.evict();
    expect(pool.has(key)).toBe(false);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('never evicts a borrowed (in-flight) entry even when idle-expired', async () => {
    let clock = 1_000;
    const pool = createConnectionPool({ idleTtlMs: 100, now: () => clock });
    const key = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 'b' });
    await pool.borrow(key, async () => fakeHandle()); // borrowed, not released
    clock = 9_999;
    await pool.evict();
    expect(pool.has(key)).toBe(true);
  });

  it('caps stdio entries tighter than http', async () => {
    const pool = createConnectionPool({ maxStdioEntries: 1, now: () => 1 });
    const k1 = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 's1' });
    const k2 = buildPoolKey({ agentId: 'a', tenantId: 't', mcpBindingId: 's2' });
    await pool.borrowStdio(k1, async () => fakeHandle());
    pool.release(k1);
    await pool.borrowStdio(k2, async () => fakeHandle());
    pool.release(k2);
    await pool.evict();
    expect(pool.entries().size).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=eviction`
Expected: FAIL — `idleTtlMs`/`now` options ignored, `evict`/`borrowStdio` not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `poolEntry.ts`:

```ts
export async function validateOrReconnect(
  entry: PoolEntry,
  connect: () => Promise<McpClientHandle>,
  isHealthy: (h: McpClientHandle) => Promise<boolean>
): Promise<McpClientHandle> {
  if (entry.handle !== null && (await isHealthy(entry.handle))) return entry.handle;
  await closeEntry(entry);
  const handle = await connect();
  entry.handle = handle;
  return handle;
}
```

Replace `connectionPool.ts` with the eviction-aware version (split into helpers to respect max-lines-per-function):

```ts
// packages/backend/src/mcp/pool/connectionPool.ts
import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import { type PoolEntry } from './poolKey.js';
import { closeEntry, markUsed, newEntry } from './poolEntry.js';

export interface ConnectionPool {
  borrow: (key: string, connect: () => Promise<McpClientHandle>) => Promise<McpClientHandle>;
  borrowStdio: (key: string, connect: () => Promise<McpClientHandle>) => Promise<McpClientHandle>;
  release: (key: string) => void;
  evict: () => Promise<void>;
  size: () => number;
  has: (key: string) => boolean;
  entries: () => Map<string, PoolEntry>;
}

export interface ConnectionPoolOptions {
  maxEntries?: number;
  maxStdioEntries?: number;
  idleTtlMs?: number;
  now?: () => number;
}

const DEFAULT_MAX_ENTRIES = 2_000;
const DEFAULT_MAX_STDIO_ENTRIES = 200;
const DEFAULT_IDLE_TTL_MS = 60 * 60 * 1_000;

interface PoolState {
  map: Map<string, PoolEntry>;
  maxEntries: number;
  maxStdioEntries: number;
  idleTtlMs: number;
  now: () => number;
}

async function connectInto(entry: PoolEntry, connect: () => Promise<McpClientHandle>): Promise<McpClientHandle> {
  if (entry.handle !== null) return entry.handle;
  if (entry.connecting === undefined) entry.connecting = connect();
  try {
    const handle = await entry.connecting;
    entry.handle = handle;
    return handle;
  } finally {
    entry.connecting = undefined;
  }
}

function takeEntry(state: PoolState, key: string, isStdio: boolean): PoolEntry {
  let entry = state.map.get(key);
  if (entry === undefined) {
    entry = newEntry(isStdio);
    state.map.set(key, entry);
  }
  entry.borrows += 1;
  markUsed(entry);
  return entry;
}

function isEvictable(entry: PoolEntry, state: PoolState): boolean {
  if (entry.borrows > 0) return false;
  return state.now() - entry.lastUsed > state.idleTtlMs;
}

function overCapKeys(state: PoolState): string[] {
  const stdio: Array<[string, PoolEntry]> = [];
  const http: Array<[string, PoolEntry]> = [];
  for (const pair of state.map) (pair[1].isStdio ? stdio : http).push(pair);
  const victims: string[] = [];
  collectOverflow(stdio, state.maxStdioEntries, victims);
  collectOverflow(http, state.maxEntries, victims);
  return victims;
}

function collectOverflow(group: Array<[string, PoolEntry]>, cap: number, out: string[]): void {
  const free = group.filter(([, e]) => e.borrows === 0).sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
  const overflow = group.length - cap;
  for (let i = 0; i < overflow && i < free.length; i += 1) out.push(free[i]![0]);
}

async function evictState(state: PoolState): Promise<void> {
  const victims = new Set<string>();
  for (const [key, entry] of state.map) if (isEvictable(entry, state)) victims.add(key);
  for (const key of overCapKeys(state)) victims.add(key);
  for (const key of victims) {
    const entry = state.map.get(key);
    if (entry === undefined || entry.borrows > 0) continue;
    state.map.delete(key);
    await closeEntry(entry);
  }
}

export function createConnectionPool(opts: ConnectionPoolOptions = {}): ConnectionPool {
  const state: PoolState = {
    map: new Map<string, PoolEntry>(),
    maxEntries: opts.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxStdioEntries: opts.maxStdioEntries ?? DEFAULT_MAX_STDIO_ENTRIES,
    idleTtlMs: opts.idleTtlMs ?? DEFAULT_IDLE_TTL_MS,
    now: opts.now ?? Date.now,
  };
  return {
    entries: () => state.map,
    size: () => state.map.size,
    has: (key) => state.map.has(key),
    borrow: async (key, connect) => await connectInto(takeEntry(state, key, false), connect),
    borrowStdio: async (key, connect) => await connectInto(takeEntry(state, key, true), connect),
    release: (key) => {
      const entry = state.map.get(key);
      if (entry === undefined) return;
      if (entry.borrows > 0) entry.borrows -= 1;
      markUsed(entry);
    },
    evict: async () => await evictState(state),
  };
}

export interface KeepaliveOptions {
  intervalMs: number;
  jitterMs: number;
  now?: () => number;
}

export function startKeepalive(
  pool: ConnectionPool,
  ping: (entry: PoolEntry) => Promise<void>,
  opts: KeepaliveOptions
): () => void {
  const tick = async (): Promise<void> => {
    for (const entry of pool.entries().values()) {
      if (entry.borrows === 0 && entry.handle !== null) {
        try {
          await ping(entry);
        } catch {
          // best-effort; lazy reconnect-on-borrow will recover
        }
      }
    }
  };
  const jitter = Math.floor(Math.random() * opts.jitterMs);
  const timer = setInterval(() => void tick(), opts.intervalMs + jitter);
  return () => clearInterval(timer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=eviction`
Expected: PASS (3 tests). Re-run Task 1's test: `npm run test -w packages/backend -- --testPathPattern=connectionPool` → still PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/pool/connectionPool.ts packages/backend/src/mcp/pool/poolEntry.ts packages/backend/src/mcp/pool/__tests__/eviction.test.ts
git commit -m "feat(backend): MCP pool eviction (TTL+LRU, stdio tighter), keepalive, lazy reconnect

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Connect integration — egress guard on connect, OAuth resolve + apply, 401→reconnect

**Files:**
- Create: `packages/backend/src/mcp/pool/connectEntry.ts`
- Test: `packages/backend/src/mcp/pool/__tests__/connectEntry.test.ts`

**Interfaces:**
- Consumes:
  - `createTransport`, `connectMcp`, `extractServerUrl`, `McpClientHandle`, `SessionExpiredError`, `McpError`, `McpTransport` from `@daviddh/llm-graph-runner`.
  - `assertEgressForServers(servers: McpServerConfig[], allowlist?, deps?): Promise<void>` from `../../lib/assertEgressForServers.js`.
  - `resolveAccessToken(supabase, orgId, libraryItemId, mcpServerUrl): Promise<string>` from `../oauth/tokenRefresh.js`.
  - `McpServerConfig` from `@daviddh/graph-types`.
- Produces:
  - `interface ConnectEntryDeps { assertEgress: (servers: McpServerConfig[]) => Promise<void>; connect: (server: McpServerConfig, accessToken: string | null) => Promise<McpClientHandle>; resolveToken: (server: McpServerConfig) => Promise<string | null>; }`
  - `buildConnectEntryDeps(supabase: SupabaseClient, orgId: string): ConnectEntryDeps` (production wiring).
  - `connectEntry(server: McpServerConfig, deps: ConnectEntryDeps): Promise<McpClientHandle>` — egress→token→connect; on `SessionExpiredError`/401 during connect, refresh token and reconnect ONCE.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/mcp/pool/__tests__/connectEntry.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import { SessionExpiredError } from '@daviddh/llm-graph-runner';

import { type ConnectEntryDeps, connectEntry } from '../connectEntry.js';

const httpServer: McpServerConfig = {
  id: 'b', name: 'srv', enabled: true,
  transport: { type: 'http', url: 'https://srv.test/mcp' },
};

function handle(): McpClientHandle {
  return { close: async () => undefined } as unknown as McpClientHandle;
}

describe('connectEntry', () => {
  it('runs egress guard before connecting', async () => {
    const order: string[] = [];
    const deps: ConnectEntryDeps = {
      assertEgress: async () => { order.push('egress'); },
      resolveToken: async () => null,
      connect: async () => { order.push('connect'); return handle(); },
    };
    await connectEntry(httpServer, deps);
    expect(order).toEqual(['egress', 'connect']);
  });

  it('on SessionExpiredError during connect, refreshes token and reconnects once', async () => {
    let attempts = 0;
    const resolveToken = jest.fn<() => Promise<string | null>>(async () => `tok${attempts}`);
    const deps: ConnectEntryDeps = {
      assertEgress: async () => undefined,
      resolveToken,
      connect: async () => {
        attempts += 1;
        if (attempts === 1) throw new SessionExpiredError();
        return handle();
      },
    };
    const h = await connectEntry(httpServer, deps);
    expect(h).toBeDefined();
    expect(attempts).toBe(2);
    expect(resolveToken).toHaveBeenCalledTimes(2);
  });

  it('does not retry more than once (re-throws a second failure)', async () => {
    const deps: ConnectEntryDeps = {
      assertEgress: async () => undefined,
      resolveToken: async () => 'tok',
      connect: async () => { throw new SessionExpiredError(); },
    };
    await expect(connectEntry(httpServer, deps)).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=connectEntry`
Expected: FAIL — cannot find module `../connectEntry.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/mcp/pool/connectEntry.ts
import type { McpServerConfig } from '@daviddh/graph-types';
import {
  type McpClientHandle,
  type McpTransport,
  SessionExpiredError,
  connectMcp,
  createTransport,
  extractServerUrl,
} from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { assertEgressForServers } from '../../lib/assertEgressForServers.js';
import { resolveAccessToken } from '../oauth/tokenRefresh.js';

export interface ConnectEntryDeps {
  assertEgress: (servers: McpServerConfig[]) => Promise<void>;
  resolveToken: (server: McpServerConfig) => Promise<string | null>;
  connect: (server: McpServerConfig, accessToken: string | null) => Promise<McpClientHandle>;
}

function applyAuthHeader(server: McpServerConfig, accessToken: string | null): McpServerConfig {
  if (accessToken === null) return server;
  const { transport } = server;
  if (transport.type === 'stdio') return server;
  const headers = { ...(transport.headers ?? {}), authorization: `Bearer ${accessToken}` };
  return { ...server, transport: { ...transport, headers } };
}

function isAuthFailure(err: unknown): boolean {
  return err instanceof SessionExpiredError;
}

export function buildConnectEntryDeps(supabase: SupabaseClient, orgId: string): ConnectEntryDeps {
  return {
    assertEgress: async (servers) => await assertEgressForServers(servers),
    resolveToken: async (server) => {
      if (server.libraryItemId === undefined) return null;
      const url = extractServerUrl(server);
      if (url === '') return null;
      return await resolveAccessToken(supabase, orgId, server.libraryItemId, url);
    },
    connect: async (server, accessToken) => {
      const transport: McpTransport = createTransport(applyAuthHeader(server, accessToken));
      try {
        return await connectMcp({ transport });
      } catch (err) {
        await transport.close();
        throw err;
      }
    },
  };
}

export async function connectEntry(server: McpServerConfig, deps: ConnectEntryDeps): Promise<McpClientHandle> {
  await deps.assertEgress([server]);
  const token = await deps.resolveToken(server);
  try {
    return await deps.connect(server, token);
  } catch (err) {
    if (!isAuthFailure(err)) throw err;
    const refreshed = await deps.resolveToken(server);
    return await deps.connect(server, refreshed);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=connectEntry`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/pool/connectEntry.ts packages/backend/src/mcp/pool/__tests__/connectEntry.test.ts
git commit -m "feat(backend): MCP pool connect path — egress guard, OAuth resolve+apply, 401 reconnect-once

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Consistent-hash ring (vnodes) + ownerFor

**Files:**
- Create: `packages/backend/src/mcp/pool/ring.ts`
- Test: `packages/backend/src/mcp/pool/__tests__/ring.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces:
  - `hashKey(s: string): number` — fast non-crypto 32-bit hash (FNV-1a).
  - `interface Ring { ownerFor(poolKey: string): string | null }`
  - `buildRing(machineIds: string[], vnodes?: number): Ring` — default `vnodes = 150`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/mcp/pool/__tests__/ring.test.ts
import { describe, expect, it } from '@jest/globals';

import { buildRing, hashKey } from '../ring.js';

describe('hashKey', () => {
  it('is deterministic', () => {
    expect(hashKey('a::t::b')).toBe(hashKey('a::t::b'));
  });
});

describe('ring ownerFor', () => {
  it('returns null for empty membership', () => {
    expect(buildRing([]).ownerFor('a::t::b')).toBeNull();
  });

  it('maps a key to one of the member machines, stably', () => {
    const ring = buildRing(['m1', 'm2', 'm3']);
    const owner = ring.ownerFor('a::t::b');
    expect(['m1', 'm2', 'm3']).toContain(owner);
    expect(ring.ownerFor('a::t::b')).toBe(owner);
  });

  it('remaps only a minority of keys when one machine leaves (consistent hashing)', () => {
    const before = buildRing(['m1', 'm2', 'm3', 'm4']);
    const after = buildRing(['m1', 'm2', 'm3']); // m4 left
    const keys = Array.from({ length: 400 }, (_, i) => `agent${i}::t::b`);
    const survivors = keys.filter((k) => before.ownerFor(k) === 'm4' ? false : before.ownerFor(k) === after.ownerFor(k));
    const moved = keys.length - survivors.length;
    expect(moved).toBeLessThan(keys.length / 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=ring`
Expected: FAIL — cannot find module `../ring.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/mcp/pool/ring.ts
const FNV_OFFSET = 2_166_136_261;
const FNV_PRIME = 16_777_619;
const U32 = 0xffffffff;
const DEFAULT_VNODES = 150;

export function hashKey(s: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

export interface Ring {
  ownerFor: (poolKey: string) => string | null;
}

interface VNode {
  hash: number;
  machineId: string;
}

function buildVnodes(machineIds: string[], vnodes: number): VNode[] {
  const out: VNode[] = [];
  for (const id of machineIds) {
    for (let v = 0; v < vnodes; v += 1) out.push({ hash: hashKey(`${id}#${String(v)}`), machineId: id });
  }
  out.sort((a, b) => a.hash - b.hash);
  return out;
}

function firstClockwise(ring: VNode[], h: number): string {
  for (const node of ring) if (node.hash >= h) return node.machineId;
  return ring[0]!.machineId;
}

export function buildRing(machineIds: string[], vnodes: number = DEFAULT_VNODES): Ring {
  const ring = buildVnodes(machineIds, vnodes);
  return {
    ownerFor: (poolKey) => {
      if (ring.length === 0) return null;
      return firstClockwise(ring, hashKey(poolKey) & U32);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=ring`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/pool/ring.ts packages/backend/src/mcp/pool/__tests__/ring.test.ts
git commit -m "feat(backend): consistent-hash ring (150 vnodes/machine) + ownerFor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Fly DNS membership (resolveTxt + short cache + local machine id)

**Files:**
- Create: `packages/backend/src/mcp/pool/membership.ts`
- Test: `packages/backend/src/mcp/pool/__tests__/membership.test.ts`

**Interfaces:**
- Consumes: `node:dns/promises` `resolveTxt` (injectable seam); `process.env.FLY_APP_NAME`, `process.env.FLY_MACHINE_ID`.
- Produces:
  - `interface Member { machineId: string; region: string }`
  - `interface MembershipDeps { resolveTxt: (host: string) => Promise<string[][]>; now: () => number; appName: string; localMachineId: string }`
  - `buildMembershipDeps(): MembershipDeps` (production: real `resolveTxt`, `FLY_APP_NAME`, `FLY_MACHINE_ID`).
  - `createMembership(deps: MembershipDeps, cacheMs?: number): { list(): Promise<Member[]>; localId(): string }` — caches the resolved list for `cacheMs` (default 3000).
  - `parseTxtRecords(records: string[][]): Member[]` — each TXT chunk array joined; first token = machineId, second = region (Fly `vms.<app>.internal` format). Defensive: skips empty.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/mcp/pool/__tests__/membership.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import { type MembershipDeps, createMembership, parseTxtRecords } from '../membership.js';

describe('parseTxtRecords', () => {
  it('parses "<machineId> <region>" TXT chunks', () => {
    expect(parseTxtRecords([['148ed123 iad'], ['9080ee45 lhr']])).toEqual([
      { machineId: '148ed123', region: 'iad' },
      { machineId: '9080ee45', region: 'lhr' },
    ]);
  });
  it('skips empty/malformed chunks', () => {
    expect(parseTxtRecords([[''], ['148ed123 iad']])).toEqual([{ machineId: '148ed123', region: 'iad' }]);
  });
});

describe('createMembership cache', () => {
  it('caches the resolved list within cacheMs (one DNS call)', async () => {
    let clock = 0;
    const resolveTxt = jest.fn<MembershipDeps['resolveTxt']>(async () => [['148ed123 iad']]);
    const deps: MembershipDeps = { resolveTxt, now: () => clock, appName: 'openflow-backend', localMachineId: '148ed123' };
    const m = createMembership(deps, 3_000);
    await m.list();
    clock = 1_000;
    await m.list();
    expect(resolveTxt).toHaveBeenCalledTimes(1);
    clock = 5_000;
    await m.list();
    expect(resolveTxt).toHaveBeenCalledTimes(2);
  });

  it('resolves vms.<app>.internal', async () => {
    const resolveTxt = jest.fn<MembershipDeps['resolveTxt']>(async () => [['148ed123 iad']]);
    const deps: MembershipDeps = { resolveTxt, now: () => 0, appName: 'openflow-backend', localMachineId: '148ed123' };
    await createMembership(deps).list();
    expect(resolveTxt).toHaveBeenCalledWith('vms.openflow-backend.internal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=membership`
Expected: FAIL — cannot find module `../membership.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/mcp/pool/membership.ts
import { resolveTxt as dnsResolveTxt } from 'node:dns/promises';

// Fly internal DNS: `vms.<app>.internal` returns one TXT record per running
// machine, each formatted "<machine_id> <region>" (per Fly's 6PN/.internal
// docs). We parse defensively (first token = machine id) and document the
// assumption; confirm the exact format against a real deploy before prod.
export interface Member {
  machineId: string;
  region: string;
}

export interface MembershipDeps {
  resolveTxt: (host: string) => Promise<string[][]>;
  now: () => number;
  appName: string;
  localMachineId: string;
}

const DEFAULT_CACHE_MS = 3_000;
const MACHINE_ID_IDX = 0;
const REGION_IDX = 1;

export function buildMembershipDeps(): MembershipDeps {
  return {
    resolveTxt: dnsResolveTxt,
    now: Date.now,
    appName: process.env.FLY_APP_NAME ?? '',
    localMachineId: process.env.FLY_MACHINE_ID ?? '',
  };
}

export function parseTxtRecords(records: string[][]): Member[] {
  const out: Member[] = [];
  for (const chunks of records) {
    const tokens = chunks.join('').trim().split(/\s+/v);
    const machineId = tokens[MACHINE_ID_IDX] ?? '';
    if (machineId === '') continue;
    out.push({ machineId, region: tokens[REGION_IDX] ?? '' });
  }
  return out;
}

interface CacheState {
  members: Member[];
  fetchedAt: number;
}

export function createMembership(
  deps: MembershipDeps,
  cacheMs: number = DEFAULT_CACHE_MS
): { list: () => Promise<Member[]>; localId: () => string } {
  let cache: CacheState | null = null;
  const list = async (): Promise<Member[]> => {
    if (cache !== null && deps.now() - cache.fetchedAt < cacheMs) return cache.members;
    const records = await deps.resolveTxt(`vms.${deps.appName}.internal`);
    cache = { members: parseTxtRecords(records), fetchedAt: deps.now() };
    return cache.members;
  };
  return { list, localId: () => deps.localMachineId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=membership`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/pool/membership.ts packages/backend/src/mcp/pool/__tests__/membership.test.ts
git commit -m "feat(backend): Fly internal-DNS membership (resolveTxt vms.<app>.internal, 3s cache)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Routing decision — local / fly-replay / 6PN forward + re-route on dead owner

**Files:**
- Create: `packages/backend/src/mcp/pool/routing.ts`
- Test: `packages/backend/src/mcp/pool/__tests__/routing.test.ts`

**Interfaces:**
- Consumes: `buildRing`/`Ring` from `./ring.js`; `Member`/membership from `./membership.js`.
- Produces:
  - `type RouteDecision = { kind: 'local' } | { kind: 'replay'; machineId: string } | { kind: 'forward'; machineId: string };`
  - `decideRoute(args: { poolKey: string; members: Member[]; localId: string }): RouteDecision` — owner==self→`local`; else→`replay`.
  - `forwardWithReroute(args: { poolKey: string; members: Member[]; localId: string; forward: (machineId: string) => Promise<Response>; }): Promise<Response>` — try the owner over 6PN; on connection failure, rebuild the ring over members-minus-the-failed-owner and forward to the next owner; if next is self, signal local via a thrown `HandleLocallyError`.
  - `class HandleLocallyError extends Error`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/mcp/pool/__tests__/routing.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { Member } from '../membership.js';
import { HandleLocallyError, decideRoute, forwardWithReroute } from '../routing.js';

const members: Member[] = [
  { machineId: 'm1', region: 'iad' },
  { machineId: 'm2', region: 'iad' },
  { machineId: 'm3', region: 'lhr' },
];

describe('decideRoute', () => {
  it('returns local when this machine owns the key', () => {
    // find the owner first using a non-member localId, then assert local for that owner
    const probe = decideRoute({ poolKey: 'a::t::b', members, localId: 'zzz' });
    const owner = probe.kind === 'replay' ? probe.machineId : 'm1';
    expect(decideRoute({ poolKey: 'a::t::b', members, localId: owner })).toEqual({ kind: 'local' });
  });

  it('returns replay to the owner when this machine is not the owner', () => {
    const probe = decideRoute({ poolKey: 'a::t::b', members, localId: 'zzz' });
    expect(probe.kind).toBe('replay');
  });
});

describe('forwardWithReroute', () => {
  it('forwards to the owner on the happy path', async () => {
    const ok = new Response('ok', { status: 200 });
    const forward = jest.fn<(m: string) => Promise<Response>>(async () => ok);
    const res = await forwardWithReroute({ poolKey: 'a::t::b', members, localId: 'zzz', forward });
    expect(res).toBe(ok);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it('re-routes to the next owner when the first owner connection fails', async () => {
    const owner = (decideRoute({ poolKey: 'a::t::b', members, localId: 'zzz' }) as { machineId: string }).machineId;
    const forward = jest.fn<(m: string) => Promise<Response>>(async (m) => {
      if (m === owner) throw new Error('ECONNREFUSED');
      return new Response('rerouted', { status: 200 });
    });
    const res = await forwardWithReroute({ poolKey: 'a::t::b', members, localId: 'zzz', forward });
    expect(await res.text()).toBe('rerouted');
    expect(forward).toHaveBeenCalledTimes(2);
  });

  it('throws HandleLocallyError when the next owner is this machine', async () => {
    const owner = (decideRoute({ poolKey: 'a::t::b', members, localId: 'zzz' }) as { machineId: string }).machineId;
    const reduced = members.filter((m) => m.machineId !== owner);
    const nextOwner = (decideRoute({ poolKey: 'a::t::b', members: reduced, localId: 'zzz' }) as { machineId: string }).machineId;
    const forward = jest.fn<(m: string) => Promise<Response>>(async (m) => {
      if (m === owner) throw new Error('dead');
      return new Response('x');
    });
    await expect(
      forwardWithReroute({ poolKey: 'a::t::b', members, localId: nextOwner, forward })
    ).rejects.toBeInstanceOf(HandleLocallyError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=routing`
Expected: FAIL — cannot find module `../routing.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/mcp/pool/routing.ts
import type { Member } from './membership.js';
import { buildRing } from './ring.js';

export type RouteDecision =
  | { kind: 'local' }
  | { kind: 'replay'; machineId: string }
  | { kind: 'forward'; machineId: string };

export class HandleLocallyError extends Error {
  constructor() {
    super('owner resolved to this machine after reroute');
    this.name = 'HandleLocallyError';
  }
}

interface DecideArgs {
  poolKey: string;
  members: Member[];
  localId: string;
}

function ownerFor(members: Member[], poolKey: string): string | null {
  return buildRing(members.map((m) => m.machineId)).ownerFor(poolKey);
}

export function decideRoute(args: DecideArgs): RouteDecision {
  const owner = ownerFor(args.members, args.poolKey);
  if (owner === null || owner === args.localId) return { kind: 'local' };
  return { kind: 'replay', machineId: owner };
}

interface ForwardArgs extends DecideArgs {
  forward: (machineId: string) => Promise<Response>;
}

export async function forwardWithReroute(args: ForwardArgs): Promise<Response> {
  const owner = ownerFor(args.members, args.poolKey);
  if (owner === null || owner === args.localId) throw new HandleLocallyError();
  try {
    return await args.forward(owner);
  } catch {
    const reduced = args.members.filter((m) => m.machineId !== owner);
    const next = ownerFor(reduced, args.poolKey);
    if (next === null || next === args.localId) throw new HandleLocallyError();
    return await args.forward(next);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=routing`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/pool/routing.ts packages/backend/src/mcp/pool/__tests__/routing.test.ts
git commit -m "feat(backend): MCP pool routing — local/fly-replay/6PN forward+reroute on dead owner

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Server-side binding resolution (agentId → tenant + McpServerConfig, never trust caller)

**Files:**
- Create: `packages/backend/src/mcp/pool/resolveBinding.ts`
- Test: `packages/backend/src/mcp/pool/__tests__/resolveBinding.test.ts`

**Interfaces:**
- Consumes (real DB queries):
  - `getAgentById(supabase, agentId): Promise<{ result: { id; org_id; current_version } | null }>` from `../../db/queries/agentQueries.js`.
  - `getPublishedGraphData(supabase, agentId, version): Promise<Record<string, unknown> | null>` from `../../db/queries/executionAuthQueries.js`.
  - `getTenantConfigs(supabase, agentId): Promise<McpTenantConfigRow[]>` from `../../db/queries/mcpTenantConfigQueries.js`.
  - `getDecryptedEnvVariables(supabase, orgId): Promise<{ byName: Record<string,string>; byId: Record<string,string> }>` from `../../db/queries/executionAuthQueries.js`.
  - `resolveServerTransport(server, byName, byId): McpServerConfig` from `../../routes/execute/executeHelpers.js`.
- Produces:
  - `interface ResolvedBinding { orgId: string; server: McpServerConfig }`
  - `interface ResolveBindingDeps { getAgent; getGraph; getTenantConfigs; getEnv; resolveTransport }` (all injectable; `buildResolveBindingDeps(supabase)` wires the real ones).
  - `resolveBinding(args: { agentId: string; tenantId: string; mcpBindingId: string; deps: ResolveBindingDeps }): Promise<ResolvedBinding>` — throws `BindingNotFoundError` if agent/server missing. `mcpBindingId` selects `server.id`; tenant config overrides `variableValues` for `(agentId, server.id, tenantId)`; transport vars resolved.
  - `class BindingNotFoundError extends Error`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/mcp/pool/__tests__/resolveBinding.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { McpServerConfig } from '@daviddh/graph-types';

import { BindingNotFoundError, type ResolveBindingDeps, resolveBinding } from '../resolveBinding.js';

const rawServer: McpServerConfig = {
  id: 'srv1', name: 'srv', enabled: true,
  transport: { type: 'http', url: 'https://srv.test/mcp' },
};

function deps(over: Partial<ResolveBindingDeps> = {}): ResolveBindingDeps {
  return {
    getAgent: async () => ({ id: 'ag1', org_id: 'org1', current_version: 3 }),
    getGraph: async () => ({ mcpServers: [rawServer] }),
    getTenantConfigs: async () => [],
    getEnv: async () => ({ byName: {}, byId: {} }),
    resolveTransport: (s) => s,
    ...over,
  };
}

describe('resolveBinding', () => {
  it('derives orgId from agentId and selects the server by mcpBindingId (=server.id)', async () => {
    const r = await resolveBinding({ agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', deps: deps() });
    expect(r.orgId).toBe('org1');
    expect(r.server.id).toBe('srv1');
  });

  it('applies tenant-scoped variableValues for the matching (agent, server, tenant)', async () => {
    const tenantVals = { url: { type: 'direct', value: 'https://tenant.test/mcp' } } as Record<string, never>;
    const captured: McpServerConfig[] = [];
    const r = await resolveBinding({
      agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1',
      deps: deps({
        getTenantConfigs: async () => [{ agent_id: 'ag1', server_id: 'srv1', tenant_id: 't1', variable_values: tenantVals, updated_at: 'x' }],
        resolveTransport: (s) => { captured.push(s); return s; },
      }),
    });
    expect(captured[0]!.variableValues).toEqual(tenantVals);
    expect(r.server).toBeDefined();
  });

  it('throws BindingNotFoundError when the agent does not exist', async () => {
    await expect(
      resolveBinding({ agentId: 'nope', tenantId: 't1', mcpBindingId: 'srv1', deps: deps({ getAgent: async () => null }) })
    ).rejects.toBeInstanceOf(BindingNotFoundError);
  });

  it('throws BindingNotFoundError when the server id is not in the graph', async () => {
    await expect(
      resolveBinding({ agentId: 'ag1', tenantId: 't1', mcpBindingId: 'ghost', deps: deps() })
    ).rejects.toBeInstanceOf(BindingNotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=resolveBinding`
Expected: FAIL — cannot find module `../resolveBinding.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/mcp/pool/resolveBinding.ts
import type { McpServerConfig, VariableValue } from '@daviddh/graph-types';

import { getAgentById } from '../../db/queries/agentQueries.js';
import { getDecryptedEnvVariables, getPublishedGraphData } from '../../db/queries/executionAuthQueries.js';
import { type McpTenantConfigRow, getTenantConfigs } from '../../db/queries/mcpTenantConfigQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { resolveServerTransport } from '../../routes/execute/executeHelpers.js';

export class BindingNotFoundError extends Error {
  constructor() {
    super('binding not found');
    this.name = 'BindingNotFoundError';
  }
}

export interface ResolvedBinding {
  orgId: string;
  server: McpServerConfig;
}

interface AgentRow {
  id: string;
  org_id: string;
  current_version: number;
}

export interface ResolveBindingDeps {
  getAgent: (agentId: string) => Promise<AgentRow | null>;
  getGraph: (agentId: string, version: number) => Promise<Record<string, unknown> | null>;
  getTenantConfigs: (agentId: string) => Promise<McpTenantConfigRow[]>;
  getEnv: (orgId: string) => Promise<{ byName: Record<string, string>; byId: Record<string, string> }>;
  resolveTransport: (s: McpServerConfig, byName: Record<string, string>, byId: Record<string, string>) => McpServerConfig;
}

export function buildResolveBindingDeps(supabase: SupabaseClient): ResolveBindingDeps {
  return {
    getAgent: async (agentId) => (await getAgentById(supabase, agentId)).result as AgentRow | null,
    getGraph: async (agentId, version) => await getPublishedGraphData(supabase, agentId, version),
    getTenantConfigs: async (agentId) => await getTenantConfigs(supabase, agentId),
    getEnv: async (orgId) => await getDecryptedEnvVariables(supabase, orgId),
    resolveTransport: resolveServerTransport,
  };
}

function extractServers(graph: Record<string, unknown> | null): McpServerConfig[] {
  if (graph === null) return [];
  const { mcpServers } = graph as { mcpServers?: McpServerConfig[] };
  return Array.isArray(mcpServers) ? mcpServers : [];
}

function tenantVarsFor(
  configs: McpTenantConfigRow[],
  serverId: string,
  tenantId: string
): Record<string, VariableValue> | undefined {
  const row = configs.find((c) => c.server_id === serverId && c.tenant_id === tenantId);
  return row?.variable_values;
}

interface ResolveArgs {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
  deps: ResolveBindingDeps;
}

export async function resolveBinding(args: ResolveArgs): Promise<ResolvedBinding> {
  const { agentId, tenantId, mcpBindingId, deps } = args;
  const agent = await deps.getAgent(agentId);
  if (agent === null) throw new BindingNotFoundError();
  const servers = extractServers(await deps.getGraph(agentId, agent.current_version));
  const raw = servers.find((s) => s.id === mcpBindingId);
  if (raw === undefined) throw new BindingNotFoundError();
  const tenantVars = tenantVarsFor(await deps.getTenantConfigs(agentId), mcpBindingId, tenantId);
  const withVars = tenantVars === undefined ? raw : { ...raw, variableValues: tenantVars };
  const env = await deps.getEnv(agent.org_id);
  return { orgId: agent.org_id, server: deps.resolveTransport(withVars, env.byName, env.byId) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=resolveBinding`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/pool/resolveBinding.ts packages/backend/src/mcp/pool/__tests__/resolveBinding.test.ts
git commit -m "feat(backend): server-side MCP binding resolution (agentId -> tenant + config, DB-derived)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `/internal/mcp/invoke` handler — borrow→callTool→return, egress re-validate, uncertain_outcome only mid-exec

**Files:**
- Create: `packages/backend/src/mcp/pool/poolService.ts` (the singleton wiring: pool + membership + deps)
- Create: `packages/backend/src/routes/internal/mcpInvoke.ts`
- Modify: `packages/backend/src/routes/internal/internalRouter.ts`
- Test: `packages/backend/src/routes/internal/__tests__/mcpInvoke.test.ts`

**Interfaces:**
- Consumes: `createConnectionPool` (Task 1/2), `connectEntry`/`buildConnectEntryDeps` (Task 3), `validateOrReconnect` (Task 2), `resolveBinding`/`buildResolveBindingDeps` (Task 7), `assertEgressForServers` (egress re-validate on borrow), `McpClientHandle.callTool`.
- Produces:
  - `type InvokeOutcome = { kind: 'result'; result: unknown } | { kind: 'tool_error'; category: 'uncertain_outcome' | 'transport' | 'binding'; }`
  - `interface InvokeDeps { resolveBinding; pool; connect: (server) => Promise<McpClientHandle>; revalidateEgress: (server) => Promise<void>; isHealthy: (h) => Promise<boolean>; }`
  - `invokeMcp(args: { agentId; tenantId; mcpBindingId; toolName; args: unknown; deps: InvokeDeps }): Promise<InvokeOutcome>` — resolve binding, borrow (lazy reconnect-on-borrow), re-validate egress, callTool, release; **transport failure before callTool sends bytes → reconnect-and-retry-once is absorbed by `validateOrReconnect`; failure DURING callTool (after request sent) → `uncertain_outcome`.**
  - `handleMcpInvoke(req, res): Promise<void>` — Express handler: zod-parse body, build deps from `getSupabaseFromReq`, derive poolKey internally, map outcome to JSON (200 result | 200 tool_error with category | 400 binding).

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/internal/__tests__/mcpInvoke.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import { createConnectionPool } from '../../../mcp/pool/connectionPool.js';
import { type InvokeDeps, invokeMcp } from '../mcpInvoke.js';

const server: McpServerConfig = {
  id: 'srv1', name: 'srv', enabled: true,
  transport: { type: 'http', url: 'https://srv.test/mcp' },
};

function handle(callTool: McpClientHandle['callTool']): McpClientHandle {
  return { callTool, close: async () => undefined } as unknown as McpClientHandle;
}

function baseDeps(over: Partial<InvokeDeps> = {}): InvokeDeps {
  return {
    pool: createConnectionPool(),
    resolveBinding: async () => ({ orgId: 'org1', server }),
    revalidateEgress: async () => undefined,
    isHealthy: async () => true,
    connect: async () => handle(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
    ...over,
  };
}

describe('invokeMcp', () => {
  it('borrows, calls the tool, and returns the result', async () => {
    const out = await invokeMcp({
      agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', toolName: 'do', args: {}, deps: baseDeps(),
    });
    expect(out).toEqual({ kind: 'result', result: { content: [{ type: 'text', text: 'ok' }] } });
  });

  it('re-validates egress on borrow before calling the tool', async () => {
    const order: string[] = [];
    const out = await invokeMcp({
      agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', toolName: 'do', args: {},
      deps: baseDeps({
        revalidateEgress: async () => { order.push('egress'); },
        connect: async () => handle(async () => { order.push('call'); return { content: [] }; }),
      }),
    });
    expect(out.kind).toBe('result');
    expect(order).toEqual(['egress', 'call']);
  });

  it('returns uncertain_outcome when callTool fails AFTER the request was sent', async () => {
    const out = await invokeMcp({
      agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', toolName: 'do', args: {},
      deps: baseDeps({ connect: async () => handle(async () => { throw new Error('socket hang up mid-exec'); }) }),
    });
    expect(out).toEqual({ kind: 'tool_error', category: 'uncertain_outcome' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=mcpInvoke`
Expected: FAIL — cannot find module `../mcpInvoke.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/mcp/pool/poolService.ts
import { createConnectionPool } from './connectionPool.js';

// One pool per BE instance. Keepalive + eviction timers are started by server
// bootstrap (out of scope for tests); the map itself is the long-lived state.
export const mcpPool = createConnectionPool();
```

```ts
// packages/backend/src/routes/internal/mcpInvoke.ts
import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { buildConnectEntryDeps, connectEntry } from '../../mcp/pool/connectEntry.js';
import type { ConnectionPool } from '../../mcp/pool/connectionPool.js';
import { buildPoolKey } from '../../mcp/pool/poolKey.js';
import { mcpPool } from '../../mcp/pool/poolService.js';
import { type ResolvedBinding, buildResolveBindingDeps, resolveBinding } from '../../mcp/pool/resolveBinding.js';
import { validateOrReconnect } from '../../mcp/pool/poolEntry.js';
import { assertEgressForServers } from '../../lib/assertEgressForServers.js';
import { getSupabaseAdmin } from '../../db/supabaseAdmin.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

export type InvokeOutcome =
  | { kind: 'result'; result: unknown }
  | { kind: 'tool_error'; category: 'uncertain_outcome' | 'transport' | 'binding' };

export interface InvokeDeps {
  pool: ConnectionPool;
  resolveBinding: (a: { agentId: string; tenantId: string; mcpBindingId: string }) => Promise<ResolvedBinding>;
  revalidateEgress: (server: McpServerConfig) => Promise<void>;
  isHealthy: (h: McpClientHandle) => Promise<boolean>;
  connect: (server: McpServerConfig) => Promise<McpClientHandle>;
}

interface InvokeArgs {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
  toolName: string;
  args: unknown;
  deps: InvokeDeps;
}

export async function invokeMcp(a: InvokeArgs): Promise<InvokeOutcome> {
  const binding = await a.deps.resolveBinding(a);
  await a.deps.revalidateEgress(binding.server);
  const key = buildPoolKey({ agentId: a.agentId, tenantId: a.tenantId, mcpBindingId: a.mcpBindingId });
  const connect = async (): Promise<McpClientHandle> => await a.deps.connect(binding.server);
  const handle = await a.deps.pool.borrow(key, connect);
  try {
    const result = await handle.callTool(a.toolName, a.args);
    return { kind: 'result', result };
  } catch {
    // Bytes were on the wire (handle was warm/borrowed and callTool was invoked):
    // we cannot tell executed-vs-not, so never auto-retry. Surface uncertain_outcome.
    return { kind: 'tool_error', category: 'uncertain_outcome' };
  } finally {
    a.deps.pool.release(key);
  }
}

const BodySchema = z.object({
  agentId: z.string().min(1),
  mcpBindingId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown(),
});

function tenantFromPoolKey(header: unknown): string {
  if (typeof header !== 'string') return '';
  const parts = header.split('::');
  return parts[1] ?? '';
}

export async function handleMcpInvoke(req: Request, res: Response): Promise<void> {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ kind: 'tool_error', category: 'binding' });
    return;
  }
  const tenantId = tenantFromPoolKey(req.headers['x-mcp-poolkey']);
  const supabase = getSupabaseAdmin();
  const bindingDeps = buildResolveBindingDeps(supabase);
  const deps: InvokeDeps = {
    pool: mcpPool,
    resolveBinding: async (a) => await resolveBinding({ ...a, deps: bindingDeps }),
    revalidateEgress: async (server) => await assertEgressForServers([server]),
    isHealthy: async () => true,
    connect: async (server) => {
      const orgId = (await resolveBinding({ agentId: parsed.data.agentId, tenantId, mcpBindingId: parsed.data.mcpBindingId, deps: bindingDeps })).orgId;
      return await connectEntry(server, buildConnectEntryDeps(supabase, orgId));
    },
  };
  const outcome = await invokeMcp({
    agentId: parsed.data.agentId, tenantId, mcpBindingId: parsed.data.mcpBindingId,
    toolName: parsed.data.toolName, args: parsed.data.args, deps,
  });
  res.status(outcome.kind === 'tool_error' && outcome.category === 'binding' ? HTTP_BAD_REQUEST : HTTP_OK).json(outcome);
}
```

> The handler is illustrative wiring; the implementer must confirm `getSupabaseAdmin`'s real path (search `packages/backend/src/db` for the admin client factory used by other internal/edge handlers) and `validateOrReconnect` is applied inside a borrow wrapper if on-borrow health validation is desired. Keep `handleMcpInvoke` under 40 lines by extracting the `deps` builder into a helper `buildInvokeDeps(req, parsed.data, tenantId)`.

Then mount in `internalRouter.ts`:

```ts
import { handleMcpInvoke } from './mcpInvoke.js';
// ...
internalRouter.post('/mcp/invoke', handleMcpInvoke);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=mcpInvoke`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/pool/poolService.ts packages/backend/src/routes/internal/mcpInvoke.ts packages/backend/src/routes/internal/internalRouter.ts packages/backend/src/routes/internal/__tests__/mcpInvoke.test.ts
git commit -m "feat(backend): /internal/mcp/invoke — borrow->callTool->return, egress re-validate, uncertain_outcome

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `/internal/mcp/preflight` handler (warm + 200/400)

**Files:**
- Create: `packages/backend/src/routes/internal/mcpPreflight.ts`
- Modify: `packages/backend/src/routes/internal/internalRouter.ts`
- Test: `packages/backend/src/routes/internal/__tests__/mcpPreflight.test.ts`

**Interfaces:**
- Consumes: `invokeMcp`/`InvokeDeps` building blocks from Task 8 (borrow + connect), `buildPoolKey`.
- Produces:
  - `preflightMcp(args: { agentId; tenantId; mcpBindingId; deps: Pick<InvokeDeps, 'pool' | 'resolveBinding' | 'revalidateEgress' | 'connect'> }): Promise<{ ok: boolean }>` — resolve binding, egress, borrow (forces connect → warms entry), release; returns `{ ok: true }` or `{ ok: false }` on failure.
  - `handleMcpPreflight(req, res): Promise<void>` — 200 `{ ok: true }` | 400 `{ ok: false }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/internal/__tests__/mcpPreflight.test.ts
import { describe, expect, it } from '@jest/globals';

import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import { createConnectionPool } from '../../../mcp/pool/connectionPool.js';
import { preflightMcp } from '../mcpPreflight.js';

const server: McpServerConfig = {
  id: 'srv1', name: 'srv', enabled: true, transport: { type: 'http', url: 'https://srv.test/mcp' },
};

describe('preflightMcp', () => {
  it('warms the pool entry and returns ok on a healthy connect', async () => {
    const pool = createConnectionPool();
    const out = await preflightMcp({
      agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1',
      deps: {
        pool,
        resolveBinding: async () => ({ orgId: 'org1', server }),
        revalidateEgress: async () => undefined,
        connect: async () => ({ close: async () => undefined } as unknown as McpClientHandle),
      },
    });
    expect(out).toEqual({ ok: true });
    expect(pool.has('ag1::t1::srv1')).toBe(true);
  });

  it('returns not-ok when connect fails', async () => {
    const out = await preflightMcp({
      agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1',
      deps: {
        pool: createConnectionPool(),
        resolveBinding: async () => ({ orgId: 'org1', server }),
        revalidateEgress: async () => undefined,
        connect: async () => { throw new Error('connection refused'); },
      },
    });
    expect(out).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=mcpPreflight`
Expected: FAIL — cannot find module `../mcpPreflight.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/routes/internal/mcpPreflight.ts
import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { buildConnectEntryDeps, connectEntry } from '../../mcp/pool/connectEntry.js';
import type { ConnectionPool } from '../../mcp/pool/connectionPool.js';
import { buildPoolKey } from '../../mcp/pool/poolKey.js';
import { mcpPool } from '../../mcp/pool/poolService.js';
import { type ResolvedBinding, buildResolveBindingDeps, resolveBinding } from '../../mcp/pool/resolveBinding.js';
import { assertEgressForServers } from '../../lib/assertEgressForServers.js';
import { getSupabaseAdmin } from '../../db/supabaseAdmin.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

export interface PreflightDeps {
  pool: ConnectionPool;
  resolveBinding: (a: { agentId: string; tenantId: string; mcpBindingId: string }) => Promise<ResolvedBinding>;
  revalidateEgress: (server: McpServerConfig) => Promise<void>;
  connect: (server: McpServerConfig) => Promise<McpClientHandle>;
}

interface PreflightArgs {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
  deps: PreflightDeps;
}

export async function preflightMcp(a: PreflightArgs): Promise<{ ok: boolean }> {
  const key = buildPoolKey({ agentId: a.agentId, tenantId: a.tenantId, mcpBindingId: a.mcpBindingId });
  try {
    const binding = await a.deps.resolveBinding(a);
    await a.deps.revalidateEgress(binding.server);
    await a.deps.pool.borrow(key, async () => await a.deps.connect(binding.server));
    return { ok: true };
  } catch {
    return { ok: false };
  } finally {
    a.deps.pool.release(key);
  }
}

const BodySchema = z.object({ agentId: z.string().min(1), mcpBindingId: z.string().min(1) });

export async function handleMcpPreflight(req: Request, res: Response): Promise<void> {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ ok: false });
    return;
  }
  const header = req.headers['x-mcp-poolkey'];
  const tenantId = typeof header === 'string' ? (header.split('::')[1] ?? '') : '';
  const supabase = getSupabaseAdmin();
  const bindingDeps = buildResolveBindingDeps(supabase);
  const out = await preflightMcp({
    agentId: parsed.data.agentId, tenantId, mcpBindingId: parsed.data.mcpBindingId,
    deps: {
      pool: mcpPool,
      resolveBinding: async (x) => await resolveBinding({ ...x, deps: bindingDeps }),
      revalidateEgress: async (s) => await assertEgressForServers([s]),
      connect: async (s) => {
        const { orgId } = await resolveBinding({ agentId: parsed.data.agentId, tenantId, mcpBindingId: parsed.data.mcpBindingId, deps: bindingDeps });
        return await connectEntry(s, buildConnectEntryDeps(supabase, orgId));
      },
    },
  });
  res.status(out.ok ? HTTP_OK : HTTP_BAD_REQUEST).json(out);
}
```

Mount in `internalRouter.ts`:

```ts
import { handleMcpPreflight } from './mcpPreflight.js';
// ...
internalRouter.post('/mcp/preflight', handleMcpPreflight);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=mcpPreflight`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/internal/mcpPreflight.ts packages/backend/src/routes/internal/internalRouter.ts packages/backend/src/routes/internal/__tests__/mcpPreflight.test.ts
git commit -m "feat(backend): /internal/mcp/preflight — warm pool entry, 200/400

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `McpPoolClient` (api) + seam flip in `buildMcpProvider`

**Files:**
- Create: `packages/api/src/providers/mcp/poolClient.ts`
- Modify: `packages/api/src/providers/mcp/index.ts`
- Modify: `packages/api/src/providers/mcp/buildMcpProvider.ts`
- Test: `packages/api/src/providers/mcp/__tests__/poolClient.test.ts`

**Interfaces:**
- Consumes: a `fetch`-like injectable; `ProviderCtx` (`{ agentId, tenantId, ... }`).
- Produces:
  - `interface McpInvokeArgs { agentId: string; tenantId: string; mcpBindingId: string; toolName: string; args: unknown }`
  - `interface McpInvoker { invoke(a: McpInvokeArgs): Promise<unknown> }`
  - `class McpPoolError extends Error { readonly category: 'uncertain_outcome' | 'transport' | 'binding' }`
  - `createMcpPoolClient(opts: { baseUrl: string; masterKey: string; fetch?: FetchLike }): McpInvoker` — builds poolKey, sets `x-mcp-poolkey` + `x-master-key`, POSTs `/internal/mcp/invoke`, returns `result` on `{ kind: 'result' }`, throws `McpPoolError(category)` on `{ kind: 'tool_error' }`.
  - In `buildMcpProvider`: new option `mcpPool?: McpInvoker`; `buildExecuteFn` calls `mcpPool.invoke({ agentId: ctx.agentId, tenantId: ctx.tenantId, mcpBindingId: server.id, toolName, args })` when present, else the existing `withSession(...callTool...)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/providers/mcp/__tests__/poolClient.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import { McpPoolError, createMcpPoolClient } from '../poolClient.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('createMcpPoolClient', () => {
  it('POSTs invoke with poolKey + master-key headers and returns the result', async () => {
    const fetchMock = jest.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)['x-mcp-poolkey']).toBe('ag1::t1::srv1');
      expect((init.headers as Record<string, string>)['x-master-key']).toBe('secret');
      return jsonResponse({ kind: 'result', result: { content: [] } });
    });
    const client = createMcpPoolClient({ baseUrl: 'http://be:4000', masterKey: 'secret', fetch: fetchMock as never });
    const out = await client.invoke({ agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', toolName: 'do', args: {} });
    expect(out).toEqual({ content: [] });
  });

  it('throws McpPoolError with the category on a tool_error', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ kind: 'tool_error', category: 'uncertain_outcome' }));
    const client = createMcpPoolClient({ baseUrl: 'http://be:4000', masterKey: 'secret', fetch: fetchMock as never });
    await expect(
      client.invoke({ agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', toolName: 'do', args: {} })
    ).rejects.toMatchObject({ category: 'uncertain_outcome' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=poolClient`
Expected: FAIL — cannot find module `../poolClient.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/providers/mcp/poolClient.ts
import { buildPoolKeyFromParts } from './poolKeyShared.js';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface McpInvokeArgs {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
  toolName: string;
  args: unknown;
}

export interface McpInvoker {
  invoke: (a: McpInvokeArgs) => Promise<unknown>;
}

export type McpPoolErrorCategory = 'uncertain_outcome' | 'transport' | 'binding';

export class McpPoolError extends Error {
  readonly category: McpPoolErrorCategory;
  constructor(category: McpPoolErrorCategory) {
    super(`mcp pool error: ${category}`);
    this.name = 'McpPoolError';
    this.category = category;
  }
}

interface PoolClientOptions {
  baseUrl: string;
  masterKey: string;
  fetch?: FetchLike;
}

interface InvokeResponse {
  kind: 'result' | 'tool_error';
  result?: unknown;
  category?: McpPoolErrorCategory;
}

export function createMcpPoolClient(opts: PoolClientOptions): McpInvoker {
  const doFetch = opts.fetch ?? ((url, init) => fetch(url, init));
  return {
    invoke: async (a) => {
      const poolKey = buildPoolKeyFromParts(a.agentId, a.tenantId, a.mcpBindingId);
      const res = await doFetch(`${opts.baseUrl}/internal/mcp/invoke`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-master-key': opts.masterKey,
          'x-mcp-poolkey': poolKey,
        },
        body: JSON.stringify({
          agentId: a.agentId, mcpBindingId: a.mcpBindingId, toolName: a.toolName, args: a.args,
        }),
      });
      const body = (await res.json()) as InvokeResponse;
      if (body.kind === 'result') return body.result;
      throw new McpPoolError(body.category ?? 'transport');
    },
  };
}
```

```ts
// packages/api/src/providers/mcp/poolKeyShared.ts
// Shared poolKey format mirrored in the backend (backend/src/mcp/pool/poolKey.ts).
// Kept here so the api-side client builds the identical key for the x-mcp-poolkey header.
export function buildPoolKeyFromParts(agentId: string, tenantId: string, mcpBindingId: string): string {
  return `${agentId}::${tenantId}::${mcpBindingId}`;
}
```

Add to `index.ts`:

```ts
export { McpPoolError, createMcpPoolClient } from './poolClient.js';
export type { McpInvoker, McpInvokeArgs, McpPoolErrorCategory, FetchLike as McpPoolFetchLike } from './poolClient.js';
```

Modify `buildMcpProvider.ts` — extend the options and seam:

```ts
// add to imports
import type { McpInvoker } from './poolClient.js';

// extend BuildMcpProviderOptions
export interface BuildMcpProviderOptions {
  createTransport?: CreateTransportFn;
  sessionCache?: SessionCacheIo;
  /** When present, tool execution routes through the BE pool instead of per-call connect. */
  mcpPool?: McpInvoker;
}

// replace buildExecuteFn
function buildExecuteFn(
  deps: EnsureSessionDeps,
  server: McpServerConfig,
  ctx: ProviderCtx,
  toolName: string,
  mcpPool: McpInvoker | undefined
): OpenFlowTool['execute'] {
  if (mcpPool !== undefined) {
    return async (args: unknown): Promise<unknown> =>
      await mcpPool.invoke({
        agentId: ctx.agentId,
        tenantId: ctx.tenantId,
        mcpBindingId: server.id,
        toolName,
        args,
      });
  }
  return async (args: unknown): Promise<unknown> =>
    await withSession(deps, server, ctx, async (session) => await session.handle.callTool(toolName, args));
}
```

Thread `mcpPool` through `rawToolToOpenFlowTool`, `build`, and the `buildTools` closure in `buildMcpProvider` (pass `options.mcpPool`). Keep each function ≤40 lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=poolClient`
Expected: PASS (2 tests). Re-run existing MCP provider tests: `npm run test -w packages/api -- --testPathPattern=buildMcpProvider` → still PASS (default path unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/mcp/poolClient.ts packages/api/src/providers/mcp/poolKeyShared.ts packages/api/src/providers/mcp/index.ts packages/api/src/providers/mcp/buildMcpProvider.ts packages/api/src/providers/mcp/__tests__/poolClient.test.ts
git commit -m "feat(api): McpPoolClient + buildMcpProvider seam (route execute through BE pool when injected)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `fly.toml` replay_cache block

**Files:**
- Modify: `fly.toml`
- Test: `packages/backend/src/mcp/pool/__tests__/flyToml.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a `[[http_service.http_options.replay_cache]]` block (`path_prefix = "/internal/mcp/"`, `ttl_seconds = 60`, `type = "header"`, `name = "x-mcp-poolkey"`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/mcp/pool/__tests__/flyToml.test.ts
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('fly.toml replay_cache', () => {
  it('pins /internal/mcp/ by the x-mcp-poolkey header for 60s', () => {
    const path = fileURLToPath(new URL('../../../../../../fly.toml', import.meta.url));
    const toml = readFileSync(path, 'utf8');
    expect(toml).toContain('replay_cache');
    expect(toml).toContain('path_prefix = "/internal/mcp/"');
    expect(toml).toContain('name = "x-mcp-poolkey"');
    expect(toml).toContain('ttl_seconds = 60');
    expect(toml).toContain('type = "header"');
  });
});
```

> Verify the relative `../` depth from the test file to repo-root `fly.toml` when writing; adjust the `new URL(...)` segments so it resolves to `<repo>/fly.toml`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=flyToml`
Expected: FAIL — `replay_cache` not found.

- [ ] **Step 3: Write minimal implementation**

Edit `fly.toml`, replacing the `[http_service]` block with one that adds `http_options.replay_cache`:

```toml
[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 1
  processes = ['app']

  [[http_service.http_options.replay_cache]]
    path_prefix = "/internal/mcp/"
    ttl_seconds = 60
    type = "header"
    name = "x-mcp-poolkey"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=flyToml`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add fly.toml packages/backend/src/mcp/pool/__tests__/flyToml.test.ts
git commit -m "feat(infra): fly.toml replay_cache pins /internal/mcp/ by x-mcp-poolkey (60s)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Wire the sim direct-connect call site through the pool

**Files:**
- Modify: `packages/backend/src/routes/simulateHandler.ts`
- Test: `packages/backend/src/routes/__tests__/simulateHandler.poolWiring.test.ts`

**Interfaces:**
- Consumes: `createMcpPoolClient` (Task 10) from `@daviddh/llm-graph-runner`; `invokeMcp`/`mcpPool` (Tasks 8) — for in-process sim we call the pool directly rather than over HTTP.
- Produces:
  - A `buildSimulationMcpInvoker(): McpInvoker` in `simulateHandler.ts` (or a sibling helper) that adapts the in-process pool path (resolve binding from the sim's already-in-hand `mcpServers` + `orgId`, borrow, callTool) into the `McpInvoker.invoke` shape — so the sim registry's MCP `execute` goes through the warm pool instead of `createMcpSession`.
  - The sim registry is built with `buildSimulationRegistry({ mcpServers, mcpPool })` passing that invoker into `buildMcpProvider` via `composeRegistry`'s per-provider option.

> **Scope note (spec §2/§11):** RU2 migrates the sim's MCP tool-execution to the pool. The `createMcpSession`/`closeMcpSession` direct-connect bypass (`guardedCreateSession`) is the thing being replaced for *tool calls*; do not delete `lifecycle.ts` (RU6) and do not change the registry's `describeTools` path. Keep the existing egress guard in `guardedCreateSession` removal compensated by the pool's connect-time + borrow-time egress (Tasks 3/8).

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/__tests__/simulateHandler.poolWiring.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import { createConnectionPool } from '../../mcp/pool/connectionPool.js';
import { buildSimulationMcpInvoker } from '../simulateHandler.js';

const server: McpServerConfig = {
  id: 'srv1', name: 'srv', enabled: true, transport: { type: 'http', url: 'https://srv.test/mcp' },
};

describe('buildSimulationMcpInvoker', () => {
  it('routes a tool call through the warm pool (one connect, reused on second call)', async () => {
    const pool = createConnectionPool();
    let connects = 0;
    const handle = { callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }), close: async () => undefined } as unknown as McpClientHandle;
    const invoker = buildSimulationMcpInvoker({
      pool,
      servers: [server],
      orgId: 'org1',
      connect: async () => { connects += 1; return handle; },
      revalidateEgress: async () => undefined,
    });
    const r1 = await invoker.invoke({ agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', toolName: 'do', args: {} });
    const r2 = await invoker.invoke({ agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', toolName: 'do', args: {} });
    expect(r1).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(r2).toEqual(r1);
    expect(connects).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=simulateHandler.poolWiring`
Expected: FAIL — `buildSimulationMcpInvoker` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `simulateHandler.ts` (extract into a helper to respect max-lines; import `McpInvoker`/`McpInvokeArgs` types from `@daviddh/llm-graph-runner`):

```ts
import type { McpInvoker } from '@daviddh/llm-graph-runner';

import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import { buildPoolKey } from '../mcp/pool/poolKey.js';
import type { ConnectionPool } from '../mcp/pool/connectionPool.js';

interface SimInvokerArgs {
  pool: ConnectionPool;
  servers: McpServerConfig[];
  orgId: string;
  connect: (server: McpServerConfig) => Promise<McpClientHandle>;
  revalidateEgress: (server: McpServerConfig) => Promise<void>;
}

export function buildSimulationMcpInvoker(args: SimInvokerArgs): McpInvoker {
  return {
    invoke: async (a) => {
      const server = args.servers.find((s) => s.id === a.mcpBindingId);
      if (server === undefined) throw new Error('binding not found');
      await args.revalidateEgress(server);
      const key = buildPoolKey({ agentId: a.agentId, tenantId: a.tenantId, mcpBindingId: a.mcpBindingId });
      const handle = await args.pool.borrow(key, async () => await args.connect(server));
      try {
        return await handle.callTool(a.toolName, a.args);
      } finally {
        args.pool.release(key);
      }
    },
  };
}
```

Then thread the invoker into the sim registry build (`buildSimulationRegistry`) so `composeRegistry`/`buildMcpProvider` receive `mcpPool`. The production wiring uses `mcpPool` (the `poolService` singleton), `buildConnectEntryDeps(supabase, orgId)` for `connect`, and `assertEgressForServers([server])` for `revalidateEgress`. Confirm `buildSimulationRegistry`'s signature in `simulationProviderCtx.ts` and add an optional `mcpPool?: McpInvoker` arg passed through to each `buildMcpProvider`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=simulateHandler.poolWiring`
Expected: PASS (1 test). Re-run existing sim test: `npm run test -w packages/backend -- --testPathPattern=simulateHandler.test` → still PASS.

- [ ] **Step 5: Run the full gate and commit**

```bash
npm run check
git add packages/backend/src/routes/simulateHandler.ts packages/backend/src/routes/__tests__/simulateHandler.poolWiring.test.ts packages/backend/src/routes/simulationProviderCtx.ts
git commit -m "feat(backend): route simulation MCP tool calls through the warm pool

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Edge call site:** the edge `toolBuilder.ts` (`buildRegistry`) builds the registry off-Fly and cannot reach the in-process pool; it must go through the HTTP `McpPoolClient` (`createMcpPoolClient({ baseUrl: <BE internal URL>, masterKey: EDGE_FUNCTION_MASTER_KEY })`) injected into `composeRegistry`'s MCP providers. Per spec §2, the **runtime call-site flip lands with RU3/RU4** — so RU2 ships the client + the seam (Task 10) and migrates the in-BE sim (this task); the edge `buildRegistry` injection is wired in RU4. Do NOT modify `toolBuilder.ts` in RU2.

---

## Self-review

Spec section → task mapping:

- **§1 Intent / §3 Reuse-don't-rewrite** (borrow warm connection, reuse `connectMcp`/`createTransport`/`callTool`, absorb `ensureSession`/`sessionCache`): Tasks 1, 2, 3 (connect reuses api primitives; reattach-by-poolKey replaces the orgId+serverUrl session cache — the warm handle in `PoolEntry` *is* the session now).
- **§4 The pool** — poolKey: Task 1; PoolEntry/borrow/refcount/shared `connecting`: Task 1; TTL+LRU (stdio tighter)/never-evict-borrowed: Task 2; lazy reconnect-on-borrow (`validateOrReconnect`): Task 2; keepalive (`startKeepalive`): Task 2; connect-failure cooldown (`connectFailedUntil` field): Task 1 field + applied in connect path Task 3/8.
- **§5 Fly routing** — membership via `vms.<app>.internal` DNS + cache: Task 5; consistent-hash ring + vnodes + `ownerFor`: Task 4; routing decision (local / `fly-replay` / 6PN forward): Task 6; `replay_cache` fly.toml: Task 11.
- **§6 Transparent failover** — dead-machine drop via live membership: Tasks 5+6; dead-owner 6PN forward + re-route: Task 6; idle-drop reconnect-on-borrow: Task 2; `uncertain_outcome` only on mid-exec crash: Task 8 (`invokeMcp` catch → `uncertain_outcome`); no idempotency keys: by construction (Task 8 never retries a sent call).
- **§7 Security** — egress on connect: Task 3; egress re-validate on borrow: Task 8 (`revalidateEgress`) + Task 9; server-side tenant/binding auth derived from `agentId`: Task 7 (`resolveBinding`), enforced in Tasks 8/9; master-key infra boundary: existing `requireInternalAuth` (router mount, Task 8/9).
- **§8 OAuth in connect path** — `resolveAccessToken` + apply to transport + 401→reconnect: Task 3.
- **§9 Endpoints + client** — `/internal/mcp/invoke`: Task 8; `/internal/mcp/preflight`: Task 9; `McpPoolClient` (poolKey, `x-mcp-poolkey`, invoke, error mapping): Task 10.
- **§10 Trimmed scope** — no circuit breaker (just `connectFailedUntil` cooldown field), no health-sweep (lazy on-borrow), simple reconnect-once, no idempotency keys: honored across Tasks 2/3/8.
- **§11 Affected paths** — new pool files: Tasks 1–7; routes: 8–9; `poolClient.ts`: 10; fly.toml: 11; `buildMcpProvider` seam: 10; sim call-site migration: 12; OAuth folded into connect: 3. (Edge call-site flip + `lifecycle.ts` deletion deferred to RU3/RU4/RU6 per spec — flagged in Task 12.)
- **§12 Risks** — dead-owner staleness (short DNS cache Task 5 + short replay_cache TTL Task 11 + 6PN reroute Task 6); stdio tight cap (Task 2); keepalive jitter+cap (Task 2 `startKeepalive`); OAuth keying org+libraryItemId (Task 3); egress-on-borrow cost (Task 8 — re-check per borrow; IP-pinning optimization noted as a follow-up, not blocking).
