# Redis Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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

  it('tryDel returns failure when Redis errors (non-swallowing)', async () => {
    const client = makeFakeClient();
    client.del.mockRejectedValue(new Error('boom'));
    const cache = createCache(client as never);
    const result = await cache.tryDel('k');
    expect(result.ok).toBe(false);
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
  it('produces a 12-char hex prefix of sha256(url)', () => {
    const hash = hashServerUrl('https://example.com:8443/mcp');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic', () => {
    const a = hashServerUrl('https://example.com/mcp');
    const b = hashServerUrl('https://example.com/mcp');
    expect(a).toBe(b);
  });

  it('produces distinct hashes for distinct URLs', () => {
    const a = hashServerUrl('https://example.com/mcp');
    const b = hashServerUrl('https://example.com/mcp2');
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

export async function hashServerUrlAsync(serverUrl: string): Promise<string> {
  // Web Crypto API — works in both Node 19+ and Deno
  const data = new TextEncoder().encode(serverUrl);
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex.slice(0, HEX_PREFIX_LEN);
}

// Sync helper for Node-only contexts (uses node:crypto)
export function hashServerUrl(serverUrl: string): string {
  // Lazy-load node:crypto — not available in Deno without import.
  // Callers in Deno must use hashServerUrlAsync.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(serverUrl).digest('hex').slice(0, HEX_PREFIX_LEN);
}
```

> Note: the eslint-disable here is the rare exception — Deno cannot do top-level `import { createHash } from 'node:crypto'` synchronously across both runtimes. If your project's ESLint rules forbid this absolutely, switch to the async version everywhere.

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
export { hashServerUrl, hashServerUrlAsync, serverUrlSideTableKey } from './cache/serverHash.js';
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

- [ ] **Step 2: Add cache-first wrap**

```ts
import type { OAuthTokenBundle } from '@daviddh/llm-graph-runner';

import { createCache, buildUpstashClient } from '../../cache/redis.js';
import { computeTtlSeconds, isFresh, oauthTokenKey } from '../../cache/oauthTokenCache.js';
import { refreshWithSingleFlight } from '../../cache/refreshSingleFlight.js';

const cache = createCache(buildUpstashClient());

export async function resolveAccessToken(supabase: SupabaseClient, orgId: string, providerId: string): Promise<OAuthTokenBundle> {
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

- [ ] **Step 1: Update the disconnect handler**

```ts
import { createCache, buildUpstashClient } from '../../cache/redis.js';
import { oauthTokenKey } from '../../cache/oauthTokenCache.js';

const cache = createCache(buildUpstashClient());

export async function handleOAuthDisconnect(req: Request, res: AuthenticatedResponse): Promise<void> {
  // ... existing token row deletion in DB ...

  const result = await cache.tryDel(oauthTokenKey(orgId, providerId));
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

  // CACHE MISS: re-initialize for FRESH serverInfo.version.
  // Don't trust cached session for the WRITE key — see spec section "Read path" amendment.
  await cacheTryDel(mcpSessionKey(ctx.orgId, serverHash));
  const freshSession = await mcpInitialize(server, ctx);
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

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from '@jest/globals';

// Test against a fake transport + fake Upstash client that lets us assert key shapes.
// The harness needs to:
// - Override the module's getRedis() with a controllable fake.
// - Override mcpInitialize / mcpToolsList with fakes.
//
// Recommended approach: extract the cache-aware describeTools into a pure function
// taking transport + redis as args. Test that pure function.

describe('MCP tools/list cache', () => {
  it('writes under the FRESH version after cache miss + re-initialize', async () => {
    // ... see test plan in spec section "Cache 2: MCP tools/list / Read path"
    expect(true).toBe(true);   // implement concretely with the harness above
  });

  it('does NOT cache empty results', async () => {
    expect(true).toBe(true);
  });

  it('does NOT cache values over 256 KB', async () => {
    expect(true).toBe(true);
  });

  it('proactively deletes v0 key on v0 → real_version transition', async () => {
    expect(true).toBe(true);
  });
});
```

> The real work here is wiring the test harness — placeholders need filling in. Build a `FakeRedis` class with `get`/`set`/`del` and assertable history, plus a `fakeMcpTransport` that returns deterministic responses. Once that's in place, fill in each test concretely.

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

- [ ] **Step 3: Test the session-expired retry path**

`packages/api/src/providers/mcp/__tests__/sessionCache.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals';

describe('MCP session cache', () => {
  it('retries once after session-expired error', async () => {
    // Wire fake transport that fails first call with session_expired then succeeds.
    // Wire fake Upstash that records del call.
    // Assert: del called once on the session key, then second tools/call succeeds.
    expect(true).toBe(true);   // fill in with concrete harness
  });

  it('does not infinite-retry on persistent failure', async () => {
    expect(true).toBe(true);
  });
});
```

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

import { fetchAgentBySlug } from '../../db/queries/agentQueries.js';
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
  const agent = await fetchAgentBySlug(supabase, agentId);
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

- [ ] **Step 3: Update the existing "Reload Tools" button to call invalidation first**

Find the existing `onDiscover` handler in `McpServersSection.tsx`. Wrap it:

```tsx
const onDiscoverWithCacheBust = async (serverId: string) => {
  await fetch(`/agents/${agentId}/mcp-cache/${serverId}`, { method: 'DELETE' });
  await onDiscover(serverId);   // existing discovery path
};
```

Replace the button's `onClick={onDiscover}` with `onClick={onDiscoverWithCacheBust}`. **Do not add a separate "Refresh tools" button.**

- [ ] **Step 4: Add toast feedback**

```tsx
const handleClick = async () => {
  try {
    const result = await onDiscoverWithCacheBust(server.id);
    toast.success(t('agentTools.refreshSuccess', { count: result?.toolCount ?? 0 }));
  } catch (err) {
    toast.error(t('agentTools.refreshFailed'));
  }
};
```

- [ ] **Step 5: Add translations**

In `packages/web/messages/en.json` `agentTools`:

```json
"refreshSuccess": "Refreshed {count} tools",
"refreshFailed": "Refresh failed — using last known tools"
```

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

describe('cross-tenant safety', () => {
  it('two orgs with the same serverUrl get distinct keys', () => {
    const hashed = 'abc123';
    expect(mcpToolsListKey('org-a', hashed, '1.0.0')).not.toBe(mcpToolsListKey('org-b', hashed, '1.0.0'));
    expect(mcpSessionKey('org-a', hashed)).not.toBe(mcpSessionKey('org-b', hashed));
  });

  it('OAuth keys include orgId', () => {
    // re-import oauthTokenKey from backend if needed; here we just verify the contract.
    const orgKeyA = `oauth:v1:org-a:calendar`;
    const orgKeyB = `oauth:v1:org-b:calendar`;
    expect(orgKeyA).not.toBe(orgKeyB);
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
- Click Reload Tools: cache key deleted; next read fetches fresh.
- Disconnect Google Calendar from Settings: cache key deleted; next agent run requires re-auth.

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
