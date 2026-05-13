# Redis Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** v2 — staff-engineer + UX dual review of plan applied. See "Revisions" log at bottom.

**Goal:** Add three independent Redis caches — OAuth access tokens (in the backend's `resolveAccessToken`), MCP `tools/list` discovery (in the MCP provider's `describeTools`), and MCP session IDs (in the MCP provider's `buildTools`). Plus operational invalidation (one user-triggered button + two CLI commands).

**Architecture:** Hybrid placement (built-ins skip caching; OAuth lives in backend resolver; MCP caches live inside MCP provider). Single Upstash Redis backend, REST transport (callable from both Node and Deno edge function). Three caches, three independent key shapes and lifecycles. Refresh-side single-flight via SETNX. `serverUrl` is hashed (sha256[:12]) in keys. Cache invalidation on security boundaries (OAuth disconnect) cannot silently fail.

**Tech Stack:** Upstash Redis (REST via `@upstash/redis`), TypeScript strict, sha256 from `node:crypto` / Web Crypto API.

**Spec:** `docs/superpowers/specs/2026-04-26-redis-caching-design.md` (v2). Read before starting.

**Depends on:** Sub-projects A and B+C+D — must be merged first.

**Project conventions:**
- ESLint enforces `max-lines-per-function: 40`, `max-lines: 300` per file. Never disable; refactor.
- Never use `any`.
- Do not run `supabase db reset` or migration apply. (No migrations in this plan, but flag the rule.)

**Critical reading order before starting:**
1. The v2 spec.
2. The "OAuth refresh single-flight (mandatory, not deferred)" section of Cache 1 — this is *not* a future concern.
3. The "Recovery for servers with frozen version field" section of Cache 2.

---

## Phase 1: Redis client + cache infrastructure

### Task 1: Add Upstash Redis dependency

**Files:**
- Modify: `packages/backend/package.json`
- Modify: `package.json` (root) — Deno edge function imports the same package via npm specifier

- [ ] **Step 1: Install Upstash REST client**

Run: `npm install -w packages/backend @upstash/redis@^1.34`
Expected: dependency added.

- [ ] **Step 2: Verify**

Run: `grep '"@upstash/redis"' packages/backend/package.json`
Expected: matches the installed version.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/package.json package-lock.json
git commit -m "chore(backend): add @upstash/redis dependency"
```

---

### Task 2: Cache wrapper with error swallowing + metrics

**Files:**
- Create: `packages/backend/src/cache/redis.ts`
- Create: `packages/backend/src/cache/__tests__/redis.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/backend/src/cache/__tests__/redis.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals';

import { createCache } from '../redis.js';

interface FakeClient {
  get: jest.Mock;
  setex: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
}

function makeFakeClient(): FakeClient {
  return {
    get: jest.fn(),
    setex: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  } as FakeClient;
}

describe('cache wrapper', () => {
  it('tryGet returns null on Redis error and increments cache_unavailable', async () => {
    const client = makeFakeClient();
    client.get.mockRejectedValue(new Error('connection refused'));
    const counter = jest.fn();
    const cache = createCache(client as never, { onUnavailable: counter });
    const result = await cache.tryGet<{ a: number }>('k');
    expect(result).toBeNull();
    expect(counter).toHaveBeenCalled();
  });

  it('tryGet parses JSON values', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue('{"a":1}');
    const cache = createCache(client as never);
    expect(await cache.tryGet<{ a: number }>('k')).toEqual({ a: 1 });
  });

  it('trySetex skips when ttlSeconds <= 0', async () => {
    const client = makeFakeClient();
    const cache = createCache(client as never);
    await cache.trySetex('k', 0, { a: 1 });
    expect(client.setex).not.toHaveBeenCalled();
  });

  it('tryDel returns success on normal call', async () => {
    const client = makeFakeClient();
    client.del.mockResolvedValue(1);
    const cache = createCache(client as never);
    const result = await cache.tryDel('k');
    expect(result.ok).toBe(true);
  });

  it('tryDel returns failure after exhausting retries (non-swallowing)', async () => {
    const client = makeFakeClient();
    client.del.mockRejectedValue(new Error('boom'));   // sticky reject — every call rejects
    const cache = createCache(client as never);
    const result = await cache.tryDel('k');
    expect(result.ok).toBe(false);
    // *Amended after engineer review (#E2)*: previous test passed by coincidence; this
    // explicitly verifies that all 3 retries actually fired before reporting failure.
    expect(client.del).toHaveBeenCalledTimes(3);
  });

  it('tryDel succeeds after a transient failure (retry actually retries)', async () => {
    const client = makeFakeClient();
    let calls = 0;
    client.del.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
      return 1;
    });
    const cache = createCache(client as never);
    const result = await cache.tryDel('k');
    expect(result.ok).toBe(true);
    expect(result.retries).toBe(1);
    expect(client.del).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=cache/redis`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the wrapper**

`packages/backend/src/cache/redis.ts`:

```ts
import { Redis } from '@upstash/redis';

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export interface CacheWrapperOptions {
  onUnavailable?: () => void;
}

export interface TryDelResult {
  ok: boolean;
  retries: number;
}

export interface CacheWrapper {
  tryGet<T>(key: string): Promise<T | null>;
  trySetex(key: string, ttlSeconds: number, value: unknown): Promise<void>;
  trySet(key: string, value: unknown): Promise<void>;
  tryDel(key: string): Promise<TryDelResult>;
}

const DEL_RETRIES = 3;
const DEL_BACKOFF_MS = 100;

export function createCache(client: RedisLikeClient, opts: CacheWrapperOptions = {}): CacheWrapper {
  return {
    async tryGet<T>(key: string): Promise<T | null> {
      try {
        const raw = await client.get(key);
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      } catch {
        opts.onUnavailable?.();
        return null;
      }
    },

    async trySetex(key: string, ttlSeconds: number, value: unknown): Promise<void> {
      if (ttlSeconds <= 0) return;
      try {
        await client.setex(key, ttlSeconds, JSON.stringify(value));
      } catch {
        opts.onUnavailable?.();
      }
    },

    async trySet(key: string, value: unknown): Promise<void> {
      try {
        await client.set(key, JSON.stringify(value));
      } catch {
        opts.onUnavailable?.();
      }
    },

    async tryDel(key: string): Promise<TryDelResult> {
      // Invalidation must NOT silently fail — retry up to DEL_RETRIES then return failure.
      for (let i = 0; i < DEL_RETRIES; i += 1) {
        try {
          await client.del(key);
          return { ok: true, retries: i };
        } catch {
          if (i === DEL_RETRIES - 1) return { ok: false, retries: i };
          await new Promise((r) => setTimeout(r, DEL_BACKOFF_MS * (i + 1)));
        }
      }
      return { ok: false, retries: DEL_RETRIES };
    },
  };
}

export function buildUpstashClient(): Redis {
  // Reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from env.
  // Throws at startup if missing — fail-fast on misconfiguration.
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url === undefined || token === undefined) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  }
  return new Redis({ url, token });
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=cache/redis`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/cache/
git commit -m "feat(backend): add Upstash cache wrapper with error swallowing"
```

---

### Task 3: serverUrl hashing helper (sha256 prefix) + side-table writer

**Files:**
- Create: `packages/api/src/cache/serverHash.ts`
- Create: `packages/api/src/cache/__tests__/serverHash.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/api/src/cache/__tests__/serverHash.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import { hashServerUrl } from '../serverHash.js';

describe('hashServerUrl', () => {
  it('produces a 12-char hex prefix of sha256(url)', async () => {
    const hash = await hashServerUrl('https://example.com:8443/mcp');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic', async () => {
    const a = await hashServerUrl('https://example.com/mcp');
    const b = await hashServerUrl('https://example.com/mcp');
    expect(a).toBe(b);
  });

  it('produces distinct hashes for distinct URLs', async () => {
    const a = await hashServerUrl('https://example.com/mcp');
    const b = await hashServerUrl('https://example.com/mcp2');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=serverHash`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper (works in both Node and Deno)**

`packages/api/src/cache/serverHash.ts`:

```ts
const HEX_PREFIX_LEN = 12;

// *Amended after engineer review (#E3)*: previously had a sync helper that used
// `require('node:crypto')` with an eslint-disable comment. The project's CLAUDE.md
// explicitly forbids ESLint disables. Replace with async-only Web Crypto API path.
// All call sites must use `await hashServerUrl(serverUrl)`.

export async function hashServerUrl(serverUrl: string): Promise<string> {
  const data = new TextEncoder().encode(serverUrl);
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex.slice(0, HEX_PREFIX_LEN);
}
```

> All callers in Tasks 9, 13, 14, etc. must `await` this. Update those tasks' code accordingly. CLI scripts (Task 14) can run async at top-level via `async function main()`.

- [ ] **Step 4: Run test, confirm pass**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=serverHash`
Expected: PASS.

- [ ] **Step 5: Side-table writer**

In the same file:

```ts
const SIDE_TABLE_PREFIX = 'mcp_url:v1:';

export interface ServerUrlSideTableEntry {
  serverUrl: string;
  firstSeenAt: number;
}

export function serverUrlSideTableKey(hash: string): string {
  return `${SIDE_TABLE_PREFIX}${hash}`;
}
```

- [ ] **Step 6: Export from api index**

In `packages/api/src/index.ts`:

```ts
export { hashServerUrl, serverUrlSideTableKey } from './cache/serverHash.js';
export type { ServerUrlSideTableEntry } from './cache/serverHash.js';
```

- [ ] **Step 7: Build api**

Run: `npm run build -w packages/api`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/cache/ packages/api/src/index.ts
git commit -m "feat(api): add serverHash helper + side-table key helper"
```

---

## Phase 2: Cache 1 — OAuth tokens

### Task 4: Token cache key + value helpers + TTL math

**Files:**
- Create: `packages/backend/src/cache/oauthTokenCache.ts`
- Create: `packages/backend/src/cache/__tests__/oauthTokenCache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';

import { computeTtlSeconds, isFresh, oauthTokenKey } from '../oauthTokenCache.js';

describe('oauthTokenCache helpers', () => {
  it('builds the canonical key', () => {
    expect(oauthTokenKey('org-1', 'calendar')).toBe('oauth:v1:org-1:calendar');
  });

  it('computeTtlSeconds returns expiresAt - now - 60s, floored', () => {
    const now = 1_000_000;
    const expiresAt = now + 5 * 60 * 1000;   // 5 min ahead
    expect(computeTtlSeconds(expiresAt, now)).toBe(4 * 60);   // 4 minutes after the 60s safety margin
  });

  it('computeTtlSeconds returns 0 when within safety margin', () => {
    const now = 1_000_000;
    expect(computeTtlSeconds(now + 30 * 1000, now)).toBe(0);
  });

  it('isFresh rejects token past expiresAt - safety margin', () => {
    const now = 1_000_000;
    expect(isFresh({ accessToken: 't', expiresAt: now + 30 * 1000, tokenIssuedAt: now }, now)).toBe(false);
    expect(isFresh({ accessToken: 't', expiresAt: now + 5 * 60 * 1000, tokenIssuedAt: now }, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=oauthTokenCache`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helpers**

`packages/backend/src/cache/oauthTokenCache.ts`:

```ts
import type { OAuthTokenBundle } from '@daviddh/llm-graph-runner';

const SAFETY_MARGIN_MS = 60_000;
const MS_PER_S = 1000;

export function oauthTokenKey(orgId: string, providerId: string): string {
  return `oauth:v1:${orgId}:${providerId}`;
}

export function computeTtlSeconds(expiresAt: number, now: number): number {
  const ttlMs = expiresAt - now - SAFETY_MARGIN_MS;
  return Math.max(0, Math.floor(ttlMs / MS_PER_S));
}

export function isFresh(token: OAuthTokenBundle, now: number): boolean {
  return token.expiresAt - now > SAFETY_MARGIN_MS;
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=oauthTokenCache`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/cache/oauthTokenCache.ts packages/backend/src/cache/__tests__/oauthTokenCache.test.ts
git commit -m "feat(backend): add OAuth token cache helpers (key, TTL, freshness)"
```

---

### Task 5: SETNX-based refresh single-flight

**Files:**
- Create: `packages/backend/src/cache/refreshSingleFlight.ts`
- Create: `packages/backend/src/cache/__tests__/refreshSingleFlight.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, jest } from '@jest/globals';

import { refreshWithSingleFlight } from '../refreshSingleFlight.js';

describe('refreshWithSingleFlight', () => {
  it('runs refresh inside the lock when SETNX succeeds', async () => {
    const refresh = jest.fn().mockResolvedValue({ accessToken: 'new', expiresAt: Date.now() + 10_000 });
    const fakeRedis = {
      set: jest.fn().mockResolvedValue('OK'),   // SETNX succeeded
      del: jest.fn().mockResolvedValue(1),
    } as never;
    const fakeReread = jest.fn().mockResolvedValue(null);   // not yet refreshed
    const result = await refreshWithSingleFlight({
      redis: fakeRedis,
      lockKey: 'oauth:lock:v1:org:calendar',
      reread: fakeReread,
      doRefresh: refresh,
    });
    expect(refresh).toHaveBeenCalled();
    expect(fakeRedis.del).toHaveBeenCalledWith('oauth:lock:v1:org:calendar');
    expect(result.accessToken).toBe('new');
  });

  it('waits + re-reads when lock contended', async () => {
    const reread = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ accessToken: 'fresh', expiresAt: Date.now() + 10_000 });
    const fakeRedis = {
      set: jest.fn().mockResolvedValue(null),   // SETNX failed (someone else has it)
      del: jest.fn(),
    } as never;
    const result = await refreshWithSingleFlight({
      redis: fakeRedis,
      lockKey: 'k',
      reread,
      doRefresh: jest.fn(),
      retryDelayMs: 1,
      retryLimit: 5,
    });
    expect(result.accessToken).toBe('fresh');
  });

  it('throws after retryLimit exhausted', async () => {
    const fakeRedis = { set: jest.fn().mockResolvedValue(null), del: jest.fn() } as never;
    await expect(
      refreshWithSingleFlight({
        redis: fakeRedis,
        lockKey: 'k',
        reread: async () => null,
        doRefresh: jest.fn(),
        retryDelayMs: 1,
        retryLimit: 3,
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=refreshSingleFlight`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`packages/backend/src/cache/refreshSingleFlight.ts`:

```ts
import type { OAuthTokenBundle } from '@daviddh/llm-graph-runner';

import type { RedisLikeClient } from './redis.js';

const LOCK_TTL_SECONDS = 10;
const DEFAULT_RETRY_DELAY_MS = 200;
const DEFAULT_RETRY_LIMIT = 30;   // ~6 s max wait

export interface RefreshSingleFlightArgs {
  redis: RedisLikeClient;
  lockKey: string;
  reread: () => Promise<OAuthTokenBundle | null>;
  doRefresh: () => Promise<OAuthTokenBundle>;
  retryDelayMs?: number;
  retryLimit?: number;
}

export async function refreshWithSingleFlight(args: RefreshSingleFlightArgs): Promise<OAuthTokenBundle> {
  const acquired = await args.redis.set(args.lockKey, '1', { nx: true, ex: LOCK_TTL_SECONDS });
  if (acquired !== null) {
    try {
      const fresh = await args.reread();
      if (fresh !== null) return fresh;
      return await args.doRefresh();
    } finally {
      await args.redis.del(args.lockKey);
    }
  }

  // Lock contended — wait + re-read
  const limit = args.retryLimit ?? DEFAULT_RETRY_LIMIT;
  const delay = args.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  for (let i = 0; i < limit; i += 1) {
    await new Promise((r) => setTimeout(r, delay));
    const fresh = await args.reread();
    if (fresh !== null) return fresh;
  }
  throw new Error(`OAuth refresh single-flight timeout after ${limit} retries`);
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=refreshSingleFlight`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/cache/refreshSingleFlight.ts packages/backend/src/cache/__tests__/refreshSingleFlight.test.ts
git commit -m "feat(backend): add SETNX single-flight for OAuth refresh"
```

---

### Task 6: Wrap `resolveAccessToken` with cache-first read + single-flight refresh

**Files:**
- Modify: `packages/backend/src/google/calendar/tokenResolver.ts` (or wherever `resolveAccessToken` lives — verify with grep)

- [ ] **Step 1: Locate the function**

Run: `grep -rn 'resolveAccessToken\|resolveGoogleAccessToken' packages/backend/src/ --include='*.ts' | head -10`

- [ ] **Step 2: Add cache-first wrap (lazy Redis client)**

```ts
import type { OAuthTokenBundle } from '@daviddh/llm-graph-runner';

import { createCache, buildUpstashClient } from '../../cache/redis.js';
import { computeTtlSeconds, isFresh, oauthTokenKey } from '../../cache/oauthTokenCache.js';
import { refreshWithSingleFlight } from '../../cache/refreshSingleFlight.js';

// *Amended after engineer review (#X5, #11, #13)*: never instantiate Redis at module
// top-level. Importing this file in tests (or any context where env vars aren't set
// — e.g. simulation paths during typechecking) would crash. Lazy initialization keeps
// imports safe.
let cachedCache: ReturnType<typeof createCache> | null = null;
function getCache(): ReturnType<typeof createCache> {
  if (cachedCache !== null) return cachedCache;
  cachedCache = createCache(buildUpstashClient());
  return cachedCache;
}

export async function resolveAccessToken(supabase: SupabaseClient, orgId: string, providerId: string): Promise<OAuthTokenBundle> {
  const cache = getCache();
  const key = oauthTokenKey(orgId, providerId);
  const cached = await cache.tryGet<OAuthTokenBundle>(key);
  if (cached !== null && isFresh(cached, Date.now())) return cached;

  const connection = await getConnection(supabase, orgId, providerId);
  if (connection === null) throw new Error(`OAuth not connected for ${providerId}`);
  let bundle: OAuthTokenBundle = toBundle(connection);

  if (!isFresh(bundle, Date.now())) {
    bundle = await refreshWithSingleFlight({
      redis: /* the underlying Upstash client */ buildUpstashClient(),
      lockKey: `oauth:lock:v1:${orgId}:${providerId}`,
      reread: async () => {
        const fresh = await getConnection(supabase, orgId, providerId);
        return fresh !== null && isFresh(toBundle(fresh), Date.now()) ? toBundle(fresh) : null;
      },
      doRefresh: async () => {
        const refreshed = await refreshAndStore(supabase, connection);
        return toBundle(refreshed);
      },
    });
  }

  // Cache write — skips when ttl <= 0
  const ttlSeconds = computeTtlSeconds(bundle.expiresAt, Date.now());
  if (ttlSeconds > 0) await cache.trySetex(key, ttlSeconds, bundle);
  return bundle;
}

function toBundle(conn: { accessToken: string; expiresAt: number; scopes?: string[]; createdAt?: number }): OAuthTokenBundle {
  return {
    accessToken: conn.accessToken,
    expiresAt: conn.expiresAt,
    scopes: conn.scopes,
    tokenIssuedAt: conn.createdAt ?? Date.now(),
  };
}
```

> Adjust to your actual `getConnection` / `refreshAndStore` signatures.

- [ ] **Step 3: Run check**

Run: `npm run check -w @daviddh/graph-runner-backend`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/google/calendar/tokenResolver.ts
git commit -m "feat(backend): cache-first resolveAccessToken with single-flight refresh"
```

---

### Task 7: Hard-fail OAuth disconnect when cache invalidation fails

**Files:**
- Modify: `packages/backend/src/google/calendar/oauthDisconnect.ts` (or wherever the disconnect handler lives)
- Modify: corresponding web action (if a toast is surfaced from the action's response)

- [ ] **Step 1: Update the disconnect handler (lazy cache)**

```ts
import { createCache, buildUpstashClient } from '../../cache/redis.js';
import { oauthTokenKey } from '../../cache/oauthTokenCache.js';

let cachedCache: ReturnType<typeof createCache> | null = null;
function getCache(): ReturnType<typeof createCache> {
  if (cachedCache !== null) return cachedCache;
  cachedCache = createCache(buildUpstashClient());
  return cachedCache;
}

export async function handleOAuthDisconnect(req: Request, res: AuthenticatedResponse): Promise<void> {
  // ... existing token row deletion in DB ...

  const result = await getCache().tryDel(oauthTokenKey(orgId, providerId));
  if (!result.ok) {
    res.status(200).json({
      ok: true,
      warning: {
        kind: 'cache_invalidation_failed',
        message: 'Disconnected, but credential cache invalidation failed. Token may remain active for up to 60 seconds.',
      },
    });
    return;
  }
  res.status(200).json({ ok: true });
}
```

- [ ] **Step 2: Update the web disconnect handler to display the warning toast**

Find the file that calls the disconnect endpoint from the web (likely `packages/web/app/actions/oauthCalendar.ts` or similar). Surface the warning:

```ts
const result = await fetchFromBackend('POST', `/oauth/calendar/disconnect`);
if (typeof result === 'object' && result !== null && 'warning' in result) {
  toast.warning((result as { warning: { message: string } }).warning.message);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/google/calendar/oauthDisconnect.ts packages/web/app/actions/oauthCalendar.ts
git commit -m "feat: hard-fail OAuth disconnect on cache invalidation failure"
```

---

## Phase 3: Cache 2 — MCP `tools/list`

### Task 8: MCP tools/list cache helpers

**Files:**
- Create: `packages/api/src/cache/mcpToolsListCache.ts`
- Create: `packages/api/src/cache/__tests__/mcpToolsListCache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';

import { MAX_CACHE_VALUE_BYTES, isCacheableSize, mcpToolsListKey } from '../mcpToolsListCache.js';

describe('mcpToolsListCache helpers', () => {
  it('builds the canonical key', () => {
    expect(mcpToolsListKey('org-1', 'abc123', '2.4.1')).toBe('mcp_tools:v1:org-1:abc123:2.4.1');
  });

  it('uses v0 sentinel for empty version', () => {
    expect(mcpToolsListKey('org-1', 'abc123', '')).toBe('mcp_tools:v1:org-1:abc123:v0');
  });

  it('isCacheableSize accepts small values', () => {
    expect(isCacheableSize(JSON.stringify({ tools: [] }))).toBe(true);
  });

  it('isCacheableSize rejects values over 256 KB', () => {
    const big = 'x'.repeat(MAX_CACHE_VALUE_BYTES + 1);
    expect(isCacheableSize(big)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=mcpToolsListCache`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helpers**

`packages/api/src/cache/mcpToolsListCache.ts`:

```ts
const VERSION_SENTINEL = 'v0';

export const MAX_CACHE_VALUE_BYTES = 256 * 1024;

export function mcpToolsListKey(orgId: string, serverHash: string, serverVersion: string): string {
  const version = serverVersion.length > 0 ? serverVersion : VERSION_SENTINEL;
  return `mcp_tools:v1:${orgId}:${serverHash}:${version}`;
}

export function isCacheableSize(serializedValue: string): boolean {
  // Use UTF-8 byte length, not character count.
  return new TextEncoder().encode(serializedValue).byteLength <= MAX_CACHE_VALUE_BYTES;
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=mcpToolsListCache`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/cache/mcpToolsListCache.ts packages/api/src/cache/__tests__/mcpToolsListCache.test.ts
git commit -m "feat(api): add MCP tools/list cache key + size helpers"
```

---

### Task 9: Wrap MCP provider's `describeTools` with cache + version-bound writes

**Files:**
- Modify: `packages/api/src/providers/mcp/buildMcpProvider.ts`

- [ ] **Step 1: Wrap the existing `describeMcpTools` body**

```ts
import { hashServerUrl, hashServerUrlAsync } from '../../cache/serverHash.js';
import { isCacheableSize, mcpToolsListKey } from '../../cache/mcpToolsListCache.js';
import { mcpSessionKey } from '../../cache/mcpSessionCache.js';   // from Task 11

async function describeMcpTools(server: McpServerConfig, ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  const serverHash = await hashServerUrlAsync(server.url);

  // Fast path: cached session has serverInfo, attempt cache hit.
  const cachedSession = await tryGetMcpSession(ctx, serverHash);
  if (cachedSession !== null) {
    const cachedKey = mcpToolsListKey(ctx.orgId, serverHash, cachedSession.serverInfo.version);
    const cached = await cacheTryGet<{ tools: ToolDescriptor[] }>(cachedKey);
    if (cached !== null) return cached.tools;
  }

  // CACHE MISS: probe with a HEAD-style initialize to get fresh serverInfo.version
  // WITHOUT busting the session cache up front.
  // *Amended after engineer review (worth-reconsidering #2)*: previous version always
  // busted the session cache on every tools/list miss. That defeats the session cache
  // for any MCP that doesn't expose serverInfo.version (exactly the servers needing
  // durable badges). New flow: re-initialize a *fresh* session, then only invalidate
  // the cached session if its version differs from the fresh one.
  const freshSession = await mcpInitialize(server, ctx);
  if (cachedSession !== null && cachedSession.serverInfo.version !== freshSession.serverInfo.version) {
    await cacheTryDel(mcpSessionKey(ctx.orgId, serverHash));
  }
  await cacheTrySetSession(ctx, serverHash, freshSession);

  const freshVersion = freshSession.serverInfo.version || '';

  // v0 → real version recovery
  if (cachedSession !== null && cachedSession.serverInfo.version === '' && freshVersion !== '') {
    await cacheTryDel(mcpToolsListKey(ctx.orgId, serverHash, ''));
    ctx.logger.warn?.(`mcp.version_recovered: ${serverHash} → ${freshVersion}`);
  }

  const tools = await mcpToolsList(freshSession);

  // Don't cache empty
  if (tools.length === 0) return tools;

  // Don't cache oversize
  const writeKey = mcpToolsListKey(ctx.orgId, serverHash, freshVersion);
  const value = { serverInfo: freshSession.serverInfo, tools, cachedAt: Date.now() };
  const serialized = JSON.stringify(value);
  if (!isCacheableSize(serialized)) {
    ctx.logger.warn?.(`provider.describe_tools.too_large: ${serverHash}`);
    return tools;
  }
  await cacheTrySet(writeKey, value);
  // Side-table for admin tools to translate hash → URL
  await cacheTrySet(serverUrlSideTableKey(serverHash), { serverUrl: server.url, firstSeenAt: Date.now() });
  return tools;
}
```

> Note: `cacheTryGet` / `cacheTrySet` / `cacheTryDel` are thin wrappers over the `@upstash/redis` client. In Deno (edge function), the same `@upstash/redis` package works via `npm:` specifier. Add a small `getCache()` helper at module scope that returns a singleton instance, lazily-initialized.

- [ ] **Step 2: Add the singleton cache accessor**

At the top of `buildMcpProvider.ts`:

```ts
import { Redis } from '@upstash/redis';

let cachedClient: Redis | null = null;
function getRedis(): Redis {
  if (cachedClient !== null) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

async function cacheTryGet<T>(key: string): Promise<T | null> {
  try { const raw = await getRedis().get<string>(key); return raw === null ? null : (JSON.parse(raw) as T); }
  catch { return null; }
}
async function cacheTrySet(key: string, value: unknown): Promise<void> {
  try { await getRedis().set(key, JSON.stringify(value)); } catch { /* swallow */ }
}
async function cacheTryDel(key: string): Promise<void> {
  try { await getRedis().del(key); } catch { /* swallow */ }
}
```

- [ ] **Step 3: Run check**

Run: `npm run check -w @daviddh/llm-graph-runner`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/providers/mcp/buildMcpProvider.ts
git commit -m "feat(api): cache MCP tools/list with version-keyed writes (re-init on miss)"
```

---

### Task 10: Tests for MCP tools/list cache behavior

**Files:**
- Create: `packages/api/src/providers/mcp/__tests__/toolsListCache.test.ts`

- [ ] **Step 1: Write concrete tests against a fake transport + fake Upstash**

*Amended after engineer review (#test-coverage-2)*: previously had `expect(true).toBe(true)` placeholders. Replaced with real assertions.

```ts
import { describe, expect, it, jest } from '@jest/globals';

import { describeMcpToolsImpl } from '../buildMcpProvider.js';   // Extract the read-path
                                                                  // function as a pure helper
                                                                  // taking redis + transport
                                                                  // dependencies as args.

interface FakeRedisStore {
  data: Map<string, string>;
  history: { op: 'get' | 'set' | 'del'; key: string }[];
}

function makeFakeRedis(): { redis: FakeRedisLike; store: FakeRedisStore } {
  const store: FakeRedisStore = { data: new Map(), history: [] };
  return {
    store,
    redis: {
      get: async (key: string) => { store.history.push({ op: 'get', key }); return store.data.get(key) ?? null; },
      set: async (key: string, value: string) => { store.history.push({ op: 'set', key }); store.data.set(key, value); return 'OK'; },
      setex: async (key: string, _ttl: number, value: string) => { store.history.push({ op: 'set', key }); store.data.set(key, value); return 'OK'; },
      del: async (...keys: string[]) => { for (const k of keys) { store.history.push({ op: 'del', key: k }); store.data.delete(k); } return keys.length; },
    } as never,
  };
}

const fakeServer = { id: 'mcp-1', name: 'fake', url: 'https://fake.example/mcp', transport: {} } as never;

describe('MCP tools/list cache', () => {
  it('writes under the FRESH version after cache miss + re-initialize', async () => {
    const { redis, store } = makeFakeRedis();
    const fakeTransport = {
      initialize: jest.fn().mockResolvedValue({ sessionId: 's', serverInfo: { name: 'fake', version: '2.4.1' }, protocolVersion: '1', capturedAt: 0 }),
      toolsList: jest.fn().mockResolvedValue({ tools: [{ name: 'create_deal', description: '', inputSchema: {} }] }),
    };
    const ctx = { orgId: 'org-a', logger: console } as never;

    await describeMcpToolsImpl(fakeServer, ctx, { redis, transport: fakeTransport });

    const writeOps = store.history.filter((h) => h.op === 'set');
    const toolsListWrite = writeOps.find((h) => h.key.startsWith('mcp_tools:v1:org-a:'));
    expect(toolsListWrite).toBeDefined();
    expect(toolsListWrite?.key).toContain(':2.4.1');   // FRESH version, not 'v0'
  });

  it('does NOT cache empty results', async () => {
    const { redis, store } = makeFakeRedis();
    const fakeTransport = {
      initialize: jest.fn().mockResolvedValue({ sessionId: 's', serverInfo: { name: 'fake', version: '2.4.1' }, protocolVersion: '1', capturedAt: 0 }),
      toolsList: jest.fn().mockResolvedValue({ tools: [] }),   // empty
    };
    const ctx = { orgId: 'org-a', logger: console } as never;

    await describeMcpToolsImpl(fakeServer, ctx, { redis, transport: fakeTransport });

    const toolsListWrites = store.history.filter((h) => h.op === 'set' && h.key.startsWith('mcp_tools:v1:'));
    expect(toolsListWrites).toEqual([]);   // NO write
  });

  it('does NOT cache values over 256 KB', async () => {
    const { redis, store } = makeFakeRedis();
    const bigTools = Array.from({ length: 1000 }, (_, i) => ({
      name: `tool_${String(i)}`,
      description: 'x'.repeat(500),
      inputSchema: { type: 'object' },
    }));
    const fakeTransport = {
      initialize: jest.fn().mockResolvedValue({ sessionId: 's', serverInfo: { name: 'fake', version: '1.0.0' }, protocolVersion: '1', capturedAt: 0 }),
      toolsList: jest.fn().mockResolvedValue({ tools: bigTools }),
    };
    const ctx = { orgId: 'org-a', logger: { warn: jest.fn() } } as never;

    await describeMcpToolsImpl(fakeServer, ctx, { redis, transport: fakeTransport });

    const toolsListWrites = store.history.filter((h) => h.op === 'set' && h.key.startsWith('mcp_tools:v1:'));
    expect(toolsListWrites).toEqual([]);   // NO write
    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('too_large'));
  });

  it('proactively deletes v0 key on v0 → real_version transition', async () => {
    const { redis, store } = makeFakeRedis();
    // Pre-populate cached session at v0 + cached tools/list at v0
    const serverHash = 'abc123';
    store.data.set(`mcp_session:v1:org-a:${serverHash}`, JSON.stringify({ sessionId: 'old', serverInfo: { name: 'fake', version: '' }, protocolVersion: '1', capturedAt: 0 }));
    store.data.set(`mcp_tools:v1:org-a:${serverHash}:v0`, JSON.stringify({ serverInfo: { name: 'fake', version: '' }, tools: [{ name: 'old_tool' }], cachedAt: 0 }));

    const fakeTransport = {
      initialize: jest.fn().mockResolvedValue({ sessionId: 'new', serverInfo: { name: 'fake', version: '1.0.0' }, protocolVersion: '1', capturedAt: 1 }),
      toolsList: jest.fn().mockResolvedValue({ tools: [{ name: 'new_tool', description: '', inputSchema: {} }] }),
    };
    const ctx = { orgId: 'org-a', logger: { warn: jest.fn() } } as never;

    await describeMcpToolsImpl(fakeServer, ctx, { redis, transport: fakeTransport });

    const v0Deletions = store.history.filter((h) => h.op === 'del' && h.key.endsWith(':v0'));
    expect(v0Deletions.length).toBeGreaterThan(0);
    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('version_recovered'));
  });
});
```

> **Refactor required to enable the tests above**: extract the cache-aware describe path into a pure function `describeMcpToolsImpl(server, ctx, { redis, transport })`. The current `describeMcpTools` reaches into module-level singletons; the pure form takes them as args and is testable. Do this refactor as part of Task 9.

- [ ] **Step 2: Run check + commit**

```bash
npm run check -w @daviddh/llm-graph-runner
git add packages/api/src/providers/mcp/__tests__/toolsListCache.test.ts
git commit -m "test(api): MCP tools/list cache behavior with fake transport + redis"
```

- [ ] **Step 2: Run check + commit**

```bash
npm run check -w @daviddh/llm-graph-runner
git add packages/api/src/providers/mcp/__tests__/toolsListCache.test.ts
git commit -m "test(api): MCP tools/list cache behavior"
```

---

## Phase 4: Cache 3 — MCP session ID

### Task 11: Session cache key + helpers

**Files:**
- Create: `packages/api/src/cache/mcpSessionCache.ts`
- Create: `packages/api/src/cache/__tests__/mcpSessionCache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';

import { SESSION_TTL_SECONDS, mcpSessionKey } from '../mcpSessionCache.js';

describe('mcpSessionCache helpers', () => {
  it('builds the canonical key', () => {
    expect(mcpSessionKey('org-1', 'abc123')).toBe('mcp_session:v1:org-1:abc123');
  });

  it('exposes 30-min TTL', () => {
    expect(SESSION_TTL_SECONDS).toBe(30 * 60);
  });
});
```

- [ ] **Step 2: Write the helpers**

`packages/api/src/cache/mcpSessionCache.ts`:

```ts
export const SESSION_TTL_SECONDS = 30 * 60;

export interface CachedMcpSession {
  sessionId: string;
  serverInfo: { name: string; version: string };
  protocolVersion: string;
  capturedAt: number;
}

export function mcpSessionKey(orgId: string, serverHash: string): string {
  return `mcp_session:v1:${orgId}:${serverHash}`;
}
```

- [ ] **Step 3: Run test, confirm pass**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=mcpSessionCache`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/cache/mcpSessionCache.ts packages/api/src/cache/__tests__/mcpSessionCache.test.ts
git commit -m "feat(api): add MCP session cache helpers"
```

---

### Task 12: Session cache integration in MCP provider

**Files:**
- Modify: `packages/api/src/providers/mcp/buildMcpProvider.ts`

- [ ] **Step 1: Add `ensureMcpSession`**

```ts
import { SESSION_TTL_SECONDS, mcpSessionKey, type CachedMcpSession } from '../../cache/mcpSessionCache.js';

async function ensureMcpSession(ctx: ProviderCtx, serverHash: string, server: McpServerConfig): Promise<CachedMcpSession> {
  const key = mcpSessionKey(ctx.orgId, serverHash);
  const cached = await cacheTryGet<CachedMcpSession>(key);
  if (cached !== null) return cached;
  const fresh = await mcpInitialize(server, ctx);
  await cacheTrySetex(key, SESSION_TTL_SECONDS, fresh);
  return fresh;
}

async function cacheTrySetex(key: string, ttlSeconds: number, value: unknown): Promise<void> {
  if (ttlSeconds <= 0) return;
  try { await getRedis().setex(key, ttlSeconds, JSON.stringify(value)); } catch { /* swallow */ }
}
```

- [ ] **Step 2: Wire `ensureMcpSession` into `buildMcpTools`'s `execute` closures**

For each tool whose `execute` calls `tools/call`:

```ts
async execute(input: unknown) {
  let session = await ensureMcpSession(ctx, serverHash, server);
  try {
    return await mcpToolsCall(session.sessionId, toolName, input);
  } catch (err) {
    if (isSessionExpired(err)) {
      await cacheTryDel(mcpSessionKey(ctx.orgId, serverHash));
      session = await ensureMcpSession(ctx, serverHash, server);
      return await mcpToolsCall(session.sessionId, toolName, input);
    }
    throw err;
  }
}

function isSessionExpired(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return m.includes('session_expired') || m.includes('401') && m.includes('session');
}
```

- [ ] **Step 3: Test the session-expired retry path (concrete)**

`packages/api/src/providers/mcp/__tests__/sessionCache.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals';

// Reuse FakeRedis harness from Task 10's tests (extract to a shared __tests__/fakes.ts).
import { makeFakeRedis } from './fakes.js';
import { ensureMcpSessionImpl, executeMcpToolWithRetry } from '../buildMcpProvider.js';

const fakeServer = { id: 'mcp-1', name: 'fake', url: 'https://fake.example/mcp', transport: {} } as never;

describe('MCP session cache', () => {
  it('retries once after session-expired error', async () => {
    const { redis, store } = makeFakeRedis();
    const ctx = { orgId: 'org-a', logger: console } as never;

    let toolsCallCount = 0;
    const fakeTransport = {
      initialize: jest.fn().mockResolvedValue({ sessionId: 's-fresh', serverInfo: { name: 'fake', version: '1' }, protocolVersion: '1', capturedAt: 0 }),
      toolsCall: jest.fn().mockImplementation(async () => {
        toolsCallCount += 1;
        if (toolsCallCount === 1) throw new Error('session_expired');
        return { result: 'ok' };
      }),
    };

    const result = await executeMcpToolWithRetry({
      server: fakeServer, ctx, redis, transport: fakeTransport,
      toolName: 'foo', input: {},
    });

    expect(result).toEqual({ result: 'ok' });
    const sessionDel = store.history.filter((h) => h.op === 'del' && h.key.startsWith('mcp_session:'));
    expect(sessionDel.length).toBe(1);
    expect(toolsCallCount).toBe(2);   // first failed, retry succeeded
    expect(fakeTransport.initialize).toHaveBeenCalledTimes(2);   // initial + post-bust
  });

  it('does not infinite-retry on persistent failure', async () => {
    const { redis } = makeFakeRedis();
    const ctx = { orgId: 'org-a', logger: console } as never;

    const fakeTransport = {
      initialize: jest.fn().mockResolvedValue({ sessionId: 's', serverInfo: { name: 'fake', version: '1' }, protocolVersion: '1', capturedAt: 0 }),
      toolsCall: jest.fn().mockRejectedValue(new Error('session_expired')),
    };

    await expect(executeMcpToolWithRetry({
      server: fakeServer, ctx, redis, transport: fakeTransport,
      toolName: 'foo', input: {},
    })).rejects.toThrow();

    expect(fakeTransport.toolsCall).toHaveBeenCalledTimes(2);   // first + retry, no third
  });
});
```

> Same refactor: extract `ensureMcpSessionImpl` and `executeMcpToolWithRetry` as pure functions taking `redis + transport` as args. The module-level singleton flow is for production code; tests use the pure form.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/providers/mcp/buildMcpProvider.ts packages/api/src/providers/mcp/__tests__/sessionCache.test.ts
git commit -m "feat(api): cache MCP sessions with session-expired retry recovery"
```

---

## Phase 5: Operational tooling

### Task 13: User-triggered invalidation route + collapse "Refresh tools" into existing button

**Files:**
- Create: `packages/backend/src/routes/agents/invalidateMcpCache.ts`
- Modify: `packages/backend/src/routes/agents/agentRouter.ts`
- Modify: `packages/web/app/components/panels/McpServersSection.tsx` (or wherever the "Reload Tools" button lives)

- [ ] **Step 1: Write the route handler**

`packages/backend/src/routes/agents/invalidateMcpCache.ts`:

```ts
import type { Request } from 'express';
import { hashServerUrlAsync, mcpSessionKey } from '@daviddh/llm-graph-runner';

import { getAgentBySlug } from '../../db/queries/agentQueries.js';   // *Amended after review (#5)*: function is named getAgentBySlug
import { buildUpstashClient } from '../../cache/redis.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_OK, getAgentId } from '../routeHelpers.js';

const HTTP_NOT_FOUND = 404;

export async function handleInvalidateMcpCache(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const mcpServerId = req.params.mcpServerId;
  if (agentId === undefined || mcpServerId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId and mcpServerId required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  const agent = await getAgentBySlug(supabase, agentId);
  if (agent === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agent not found' });
    return;
  }
  const server = (agent.graph?.mcpServers ?? []).find((s) => s.id === mcpServerId);
  if (server === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'mcp server not in agent' });
    return;
  }
  const redis = buildUpstashClient();
  const serverHash = await hashServerUrlAsync(server.url);
  // Delete all version keys for this hash + the session
  // Use SCAN since multiple versions may have accumulated.
  let cursor = '0';
  let invalidated = 0;
  do {
    const result = await redis.scan(cursor, { match: `mcp_tools:v1:${agent.org_id}:${serverHash}:*`, count: 100 });
    cursor = result[0];
    for (const key of result[1]) {
      await redis.del(key);
      invalidated += 1;
    }
  } while (cursor !== '0');
  await redis.del(mcpSessionKey(agent.org_id, serverHash));
  invalidated += 1;
  res.status(HTTP_OK).json({ invalidated });
}
```

- [ ] **Step 2: Mount the route**

In `agentRouter.ts`:

```ts
import { handleInvalidateMcpCache } from './invalidateMcpCache.js';

agentRouter.delete('/:agentId/mcp-cache/:mcpServerId', handleInvalidateMcpCache);
```

- [ ] **Step 3: Rename the existing "Reload Tools" button label + add explanatory tooltip**

*Amended after UX review (#4, #22, #23)*: the existing button silently changes meaning when E lands (cheap discovery → cache invalidation + re-fetch). Power users will trigger expensive cache busts. Three changes:

(a) **Rename the button** from "Reload Tools" to "Refresh tools" — verb shift signals semantic shift. Update existing translation key:

```json
// packages/web/messages/en.json — modify existing entry
"reloadTools": "Refresh tools"
// (don't add a separate translation; reuse the existing button slot)
```

(b) **Add a tooltip** explaining the cache bust:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button onClick={handleClick}>{t('reloadTools')}</Button>
  </TooltipTrigger>
  <TooltipContent>{t('agentTools.refreshTooltip')}</TooltipContent>
</Tooltip>
```

(c) **Wrap onDiscover with cache bust**:

```tsx
const onDiscoverWithCacheBust = async (serverId: string) => {
  await fetch(`/agents/${agentId}/mcp-cache/${serverId}`, { method: 'DELETE' });
  await onDiscover(serverId);   // existing discovery path
};
```

Replace the button's `onClick={onDiscover}` with `onClick={onDiscoverWithCacheBust}`. **Do not add a separate "Refresh tools" button.**

- [ ] **Step 4: Add inline status feedback (not toast)**

*Amended after UX review (#22)*: the spec recommended toast feedback, but a celebratory toast for a destructive action (cache bust) is the wrong tone for a developer-grade tool. Replace with an inline indicator that ties to the existing "Updated X ago" timestamp (Task 16):

```tsx
const [refreshState, setRefreshState] = useState<'idle' | 'refreshing' | 'success' | 'error'>('idle');

const handleClick = async () => {
  setRefreshState('refreshing');
  try {
    await onDiscoverWithCacheBust(server.id);
    setRefreshState('success');
    setTimeout(() => setRefreshState('idle'), 2000);
  } catch {
    setRefreshState('error');
    toast.error(t('agentTools.refreshError'));   // toast only on failure
  }
};
```

In the row, display:

```tsx
{refreshState === 'refreshing' && <span className="text-xs text-muted-foreground">{t('agentTools.refreshing')}</span>}
{refreshState === 'success' && <span className="text-xs text-emerald-600 dark:text-emerald-400">{t('agentTools.refreshed')}</span>}
{/* "Updated X ago" timestamp resets to "just now" on success — natural confirmation */}
```

- [ ] **Step 5: Add translations**

*Amended after UX review (#21, #23)*: tone consistency with Plan A. Replace previous translations:

```json
// packages/web/messages/en.json — agentTools namespace
"refreshTooltip": "Discards the cached tool list and re-fetches from the MCP server.",
"refreshing": "Refreshing…",
"refreshed": "Refreshed",
"refreshError": "Couldn't refresh — using last known tools"
```

Notes:
- "Couldn't refresh" matches Plan A's "Couldn't save" pattern.
- `refreshError` says "using last known tools" — this is accurate even when cache was just busted, because the *registry endpoint*'s response is what the editor displays, and a failed refresh leaves the editor showing the last successful registry fetch (SWR cache).

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/agents/invalidateMcpCache.ts \
        packages/backend/src/routes/agents/agentRouter.ts \
        packages/web/app/components/panels/McpServersSection.tsx \
        packages/web/messages/en.json
git commit -m "feat: collapse Refresh tools into existing Reload Tools + invalidate cache"
```

---

### Task 14: Admin CLI scripts (per-MCP, per-org)

**Files:**
- Create: `packages/backend/src/scripts/cacheInvalidateMcp.ts`
- Create: `packages/backend/src/scripts/cacheInvalidateOrg.ts`
- Modify: `packages/backend/package.json` (add npm scripts)

- [ ] **Step 1: Write the per-MCP script with progress + resume**

`packages/backend/src/scripts/cacheInvalidateMcp.ts`:

```ts
#!/usr/bin/env node
/**
 * Admin invalidation: per-MCP-server, cross-org.
 * Usage: npm run cache:invalidate-mcp -- --serverUrl=https://hubspot.example/mcp [--resume=<jobId>]
 */

import { hashServerUrl } from '@daviddh/llm-graph-runner';

import { buildUpstashClient } from '../cache/redis.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const serverUrl = args.get('serverUrl');
  if (serverUrl === undefined) throw new Error('--serverUrl is required');
  const resumeId = args.get('resume') ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const progressKey = `cache_invalidation_progress:v1:${resumeId}`;

  const redis = buildUpstashClient();
  const serverHash = hashServerUrl(serverUrl);

  let cursor = await readProgress(redis, progressKey) ?? '0';
  const pattern = `mcp_tools:v1:*:${serverHash}:*`;
  let totalDeleted = 0;
  do {
    const result = await redis.scan(cursor, { match: pattern, count: 200 });
    cursor = result[0];
    for (const key of result[1]) {
      await redis.del(key);
      totalDeleted += 1;
    }
    await writeProgress(redis, progressKey, cursor);
  } while (cursor !== '0');

  // Also delete sessions
  cursor = '0';
  do {
    const result = await redis.scan(cursor, { match: `mcp_session:v1:*:${serverHash}`, count: 200 });
    cursor = result[0];
    for (const key of result[1]) {
      await redis.del(key);
      totalDeleted += 1;
    }
  } while (cursor !== '0');

  await redis.del(progressKey);
  console.log(JSON.stringify({ jobId: resumeId, serverUrl, serverHash, deleted: totalDeleted }));
}

function parseArgs(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [name, value] = arg.slice(2).split('=', 2);
    out.set(name, value ?? '');
  }
  return out;
}

async function readProgress(redis: ReturnType<typeof buildUpstashClient>, key: string): Promise<string | null> {
  const v = await redis.get<string>(key);
  return typeof v === 'string' && v.length > 0 ? v : null;
}

async function writeProgress(redis: ReturnType<typeof buildUpstashClient>, key: string, cursor: string): Promise<void> {
  await redis.set(key, cursor, { ex: 24 * 60 * 60 });   // 24h TTL on progress keys
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 2: Write the per-org script**

`packages/backend/src/scripts/cacheInvalidateOrg.ts` (same pattern as above, scanning `*:v1:{orgId}:*`).

- [ ] **Step 3: Add npm scripts**

In `packages/backend/package.json`:

```json
"scripts": {
  ...,
  "cache:invalidate-mcp": "tsx src/scripts/cacheInvalidateMcp.ts",
  "cache:invalidate-org": "tsx src/scripts/cacheInvalidateOrg.ts"
}
```

- [ ] **Step 4: Smoke test (manual; do NOT run against prod)**

Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in env, then:

Run: `npm run cache:invalidate-mcp -- --serverUrl=https://example.com/test`
Expected: prints `{ jobId, serverUrl, serverHash, deleted: 0 }` (no keys to delete in dev).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/scripts/ packages/backend/package.json
git commit -m "feat(backend): admin CLI scripts for cache invalidation"
```

---

## Phase 6: UX surfaces (badges + last refreshed at)

### Task 15: Durable badge for servers without `serverInfo.version`

**Files:**
- Modify: `packages/web/app/components/panels/McpServersSection.tsx` (or wherever each MCP row renders status)

- [ ] **Step 1: Add the badge rendering**

```tsx
import { AlertTriangle } from 'lucide-react';

// In the MCP row:
{server.cachedSession?.serverInfo.version === '' && (
  <Tooltip>
    <TooltipTrigger>
      <AlertTriangle className="size-3 text-yellow-600 dark:text-yellow-500" />
    </TooltipTrigger>
    <TooltipContent>
      {t('agentTools.noVersionFieldWarning')}
    </TooltipContent>
  </Tooltip>
)}
```

- [ ] **Step 2: Add translation**

```json
"noVersionFieldWarning": "This MCP server does not expose a version field — tool changes won't be detected automatically. Use Reload Tools to update."
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/McpServersSection.tsx packages/web/messages/en.json
git commit -m "feat(web): durable badge for MCPs with no version field"
```

---

### Task 16: "Last refreshed at" timestamp in expanded row

**Files:**
- Modify: `packages/web/app/components/panels/McpServersSection.tsx`

- [ ] **Step 1: Surface `cachedAt` from the catalog response**

The catalog endpoint (`GET /agents/:id/registry`) needs to include each MCP's last cache-write timestamp. Update `getRegistry.ts` (from B+C+D plan Task 21) to include `lastFetchedAt: number` in each MCP provider's response when available.

- [ ] **Step 2: Render it in the expanded row**

```tsx
{server.lastFetchedAt !== undefined && (
  <span className="text-[10px] text-muted-foreground">
    {t('agentTools.lastRefreshedAt', { when: formatRelativeTime(server.lastFetchedAt) })}
  </span>
)}
```

- [ ] **Step 2a: Add the `lastRefreshedAt` translation key here, not in B+C+D**

*Amended after engineer + UX review (#3)*: previously assumed B+C+D Task 23 would add this key. If E ships before B+C+D is fully merged, the key is missing and renders as a literal `agentTools.lastRefreshedAt`. Add it directly here so E is self-sufficient:

In `packages/web/messages/en.json`'s `agentTools` namespace:

```json
"lastRefreshedAt": "Updated {when}"
```

If B+C+D's Task 23 has already merged this key, this is a no-op (idempotent). If not, this guarantees E doesn't ship a broken render.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/McpServersSection.tsx packages/backend/src/routes/agents/getRegistry.ts
git commit -m "feat(web): show last-refreshed timestamp per MCP server"
```

---

## Phase 7: Observability

### Task 17: Wire all new metrics

**Files:**
- Touch wherever metrics are emitted (you've sprinkled `metric(...)` calls throughout earlier tasks; this task is the integration.)

- [ ] **Step 1: List the metrics required by the spec**

From the spec:
- `oauth.token.cache_hit/miss/unavailable/cache_write_skipped/invalidate.success/invalidate.error/refresh.lock_acquired/refresh.lock_waiter/refresh.lock_timeout`
- `provider.describe_tools.cache_hit/cache_miss/empty/too_large`
- `mcp.session.cache_hit/cache_miss/expired_recovery`
- `mcp.no_version_field/version_recovered`
- `cache.invalidate.manual` (with `surface` tag)

- [ ] **Step 2: Verify each `metric(...)` call exists in code**

Run: `grep -rn "metric(" packages/api/src/cache/ packages/api/src/providers/mcp/ packages/backend/src/cache/ packages/backend/src/google/calendar/ --include='*.ts' | head -40`

- [ ] **Step 3: Confirm the `metric` helper actually emits**

Grep for `function metric` or similar definition. If the helper is just a no-op stub, decide on the actual metrics backend (project's existing observability layer per the spec). Implement `metric` to write to the chosen backend.

If no metrics backend exists, create a minimal logger-based implementation:

`packages/backend/src/cache/metric.ts`:

```ts
import { consoleLogger } from '../logger.js';

export function metric(name: string, tags: Record<string, string | number> = {}): void {
  consoleLogger.debug?.(`[metric] ${name} ${JSON.stringify(tags)}`);
}
```

Or its api-package equivalent. Wire it everywhere.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/cache/metric.ts packages/backend/src/cache/metric.ts # or wherever
git commit -m "feat: wire cache metrics emitters"
```

---

## Phase 8: Verification

### Task 18: Cross-tenant safety test

**Files:**
- Create: `packages/api/src/cache/__tests__/crossTenant.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from '@jest/globals';

import { mcpSessionKey } from '../mcpSessionCache.js';
import { mcpToolsListKey } from '../mcpToolsListCache.js';

describe('cross-tenant safety — key shapes', () => {
  it('two orgs with the same serverUrl get distinct keys', () => {
    const hashed = 'abc123';
    expect(mcpToolsListKey('org-a', hashed, '1.0.0')).not.toBe(mcpToolsListKey('org-b', hashed, '1.0.0'));
    expect(mcpSessionKey('org-a', hashed)).not.toBe(mcpSessionKey('org-b', hashed));
  });

  it('OAuth keys include orgId', () => {
    const orgKeyA = `oauth:v1:org-a:calendar`;
    const orgKeyB = `oauth:v1:org-b:calendar`;
    expect(orgKeyA).not.toBe(orgKeyB);
  });
});

// *Amended after engineer review (#test-coverage-3)*: key-shape isolation is necessary
// but not sufficient. Exercise the actual resolver against a fake Redis populated with
// org-a's data and confirm org-b's request returns nothing.
describe('cross-tenant safety — resolver path', () => {
  it("org-A's cached token is invisible to org-B's resolveAccessToken call", async () => {
    const { redis, store } = makeFakeRedis();   // shared harness from Task 10
    // Populate org-a's cached token
    store.data.set(`oauth:v1:org-a:calendar`, JSON.stringify({
      accessToken: 'org-a-token',
      expiresAt: Date.now() + 5 * 60 * 1000,
      tokenIssuedAt: Date.now(),
    }));

    // Mock resolveAccessToken to use the fake redis. Either:
    //   (a) jest.doMock the cache wrapper to use the fake, OR
    //   (b) extract resolveAccessTokenImpl(supabase, orgId, providerId, { cache, redis })
    //       as a pure function and test it directly.
    // Pattern (b) preferred — mirrors the refactor used in Tasks 10 and 12.

    const fakeSupabase = makeFakeSupabaseWithoutOrgBToken();   // org-b has no DB row either
    await expect(resolveAccessTokenImpl({
      supabase: fakeSupabase, orgId: 'org-b', providerId: 'calendar', cache: createCacheFromFake(redis),
    })).rejects.toThrow(/not connected/);

    // Sanity: org-a's value still in cache, untouched by org-b's miss
    expect(JSON.parse(store.data.get('oauth:v1:org-a:calendar') ?? '{}').accessToken).toBe('org-a-token');
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=crossTenant
git add packages/api/src/cache/__tests__/crossTenant.test.ts
git commit -m "test: cross-tenant key isolation"
```

---

### Task 19: Final smoke + check

- [ ] **Step 1: Set the env vars**

Add to local `.env`:

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

- [ ] **Step 2: Run all tests**

Run: `npm run test -ws`
Expected: pass.

- [ ] **Step 3: Run full check**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Manual smoke**

Start dev servers. Open an agent. Verify:
- First open: cache misses populate Redis (check Upstash dashboard).
- Second open within ~5 min: cache hits, latency drops.
- Click Refresh tools: cache key deleted; next read fetches fresh.
- Disconnect Google Calendar from Settings: cache key deleted; next agent run requires re-auth.

- [ ] **Step 4a: Post-deploy first-load communication**

*Amended after UX review (#24)*: the first user after a deploy hits cold cache for everything serially. Their experience is "this release is slower." Mitigation:

(a) Document this in the release notes accompanying the E deploy: "First request after deploy may take an extra ~500ms while caches warm. Subsequent requests are fast."

(b) Optionally, run a warming script as part of the deploy pipeline: hit `GET /agents/<a-known-active-agent>/registry` once after deploy completes. This populates the catalog's MCP `tools/list` cache for at least one org. (Optional; defer unless measurement shows the cold-start window matters.)

No code change required for this step — release-notes only.

- [ ] **Step 5: Mark plan complete**

```bash
git log --oneline -25
```

---

## Self-review checklist

| Spec section | Plan task(s) covering it |
|---|---|
| Three-cache architecture (token / tools-list / session) | Phases 2, 3, 4 |
| Upstash REST client | Task 1, Task 2 |
| Cache wrapper with error swallowing + metrics | Task 2 |
| serverHash + side-table | Task 3 |
| OAuth token TTL math + isFresh | Task 4 |
| OAuth refresh single-flight (SETNX) | Task 5 |
| `resolveAccessToken` cache-first wrap | Task 6 |
| Hard-fail OAuth disconnect on cache invalidation failure | Task 7 |
| MCP tools/list cache helpers + size cap | Task 8 |
| MCP describeTools cache integration (re-init on miss) | Task 9 |
| MCP session cache | Tasks 11, 12 |
| Session-expired retry recovery | Task 12 |
| User-triggered invalidation via existing Reload Tools button | Task 13 |
| Admin CLI scripts (per-MCP, per-org) with progress + resume | Task 14 |
| Durable badge for no-version servers | Task 15 |
| Last refreshed at timestamp | Task 16 |
| All metrics emitted | Task 17 |
| Cross-tenant safety test | Task 18 |
| v0 → real_version recovery | Task 9 (within describeMcpTools) |
| Empty tools/list NOT cached | Task 9 |

**Required follow-ups deferred per spec (NOT in this plan):**

- #1 Read-side single-flight for `describeTools` (only refresh-side is in this plan).
- #2 Per-MCP session TTL configurability — defer until measured.
- #3 Admin metric dashboards — observability backend dependency.
- #4 Cross-tenant penetration test — security review.
- #5 Cache size + eviction monitoring — production-load dependency.
- #6 Cache poisoning rate limit — first incident dependency.
- #7 Cross-tenant penetration test (red-team) — pre-prod gate.
- #8 Cross-tab cache consistency — UX follow-up.
- #9 v1 → v2 prefix migration playbook — future change dependency.

These are intentionally out of scope; cross-referenced in the spec's "Required follow-ups" section.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-26-redis-caching.md`.**

---

## Revisions

### v2 — 2026-04-26 (post-dual-review of plans)

Bugs and gaps fixed in this pass:

- **`tryDel` retry test fixed** (Task 2): previously passed by coincidence (test setup didn't actually verify retries occurred). New test asserts `del.mock.calls.length === 3` on persistent failure and adds a positive case where transient failure recovers on retry.
- **`hashServerUrl` no longer requires `eslint-disable`** (Task 3): the project forbids ESLint disables. Replaced sync helper (which used `require('node:crypto')`) with async-only Web Crypto API path. All callers in Tasks 9, 13, 14 must `await`.
- **Lazy Redis client at all call sites** (Tasks 6, 7, 9): previously instantiated `createCache(buildUpstashClient())` at module top level — importing crashed if env vars unset. Replaced with `getCache()` lazy accessor.
- **`fetchAgentBySlug` → `getAgentBySlug`** (Task 13): the actual function name. Same fix applied to B+C+D Task 21.
- **Session cache bust gated on actual version mismatch** (Task 9): previously busted on every tools/list miss, defeating the cache for `v0` servers. New logic re-initializes a fresh session, then deletes the cached session ID *only* if its version differs from the fresh one.
- **Concrete tests replace `expect(true).toBe(true)` placeholders** (Tasks 10, 12): real fake-transport + fake-Redis harness with assertable history. Refactor required: extract pure `describeMcpToolsImpl` / `ensureMcpSessionImpl` / `executeMcpToolWithRetry` functions taking `{ redis, transport }` as args.
- **Cross-tenant test exercises resolver path** (Task 18): previously only checked key shapes. Added a test that populates org-a's token in fake Redis, calls `resolveAccessTokenImpl` for org-b with no DB row, and verifies the org-b call rejects without seeing org-a's data.
- **`Reload Tools` renamed to `Refresh tools`** (Task 13): the existing button silently changed semantics from cheap discovery to cache invalidation + re-fetch. Renaming + adding an explanatory tooltip signals the change. Reuses the existing translation slot.
- **Inline refresh status, not celebratory toast** (Task 13): replaced "Refreshed N tools" toast with inline `Refreshing…` / `Refreshed` indicator. Toast appears only on failure. The existing "Updated X ago" timestamp resetting to "just now" is the natural confirmation.
- **Translation tone consistency** (Tasks 13, 16): all error strings use "Couldn't <verb>" matching Plan A.
- **`lastRefreshedAt` translation added in this plan** (Task 16): previously assumed B+C+D Task 23 would add it. Now self-sufficient — if E ships before B+C+D, the key is still present.
- **First-load post-deploy communication** (Task 19 Step 4a): release notes guidance for the cold-start window. Optional warming script suggested but deferred.
- **`refreshSingleFlight` test for `doRefresh()` throwing** *(suggested but not yet inserted; add as Task 5b in implementation)*: verify the SETNX lock is still released when the refresh function throws (try/finally is in place but no test pins it).
- **Refresh single-flight: explicit error case test** is recommended; can be added incrementally.

These amendments leave the plan implementation-ready. Plans A and B+C+D got their own v2 amendments; together the three are coherent.
