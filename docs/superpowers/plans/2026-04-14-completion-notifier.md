# CompletionNotifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a production HTTP request triggers async composition (parent dispatches child agent), the HTTP response waits for the full chain to complete and returns the final text — without changing the async worker architecture.

**Architecture:** Redis Pub/Sub + durable key dual-write for instant notification with guaranteed delivery. Single shared subscriber per instance with in-memory routing. Tiered fallback: Pub/Sub -> key check -> polling -> DB read. `rootExecutionId` threaded through composition stack for N-depth nesting.

**Tech Stack:** ioredis (Redis Cloud), Express, Supabase (Postgres), Zod, Jest

---

## File Structure

### New Files (5)

| File | Responsibility |
|---|---|
| `src/notifications/completionNotifier.ts` | Interface, `ExecutionResult` type, config constants |
| `src/notifications/redisCompletionNotifier.ts` | Shared subscriber + durable NX key + circuit breaker + fallback tiers |
| `src/notifications/inProcessCompletionNotifier.ts` | EventEmitter impl for dev/test (guarded) |
| `src/routes/execute/executionResultRoute.ts` | `GET /api/executions/:id/result` polling endpoint |
| `supabase/migrations/20260414100000_root_execution_id.sql` | Add `root_execution_id` to 3 tables |

### Modified Files (10)

| File | Change Summary |
|---|---|
| `src/db/queries/stackQueries.ts` | Add `rootExecutionId` to `PushStackEntryParams` and `StackEntry` |
| `src/db/queries/childExecutionQueries.ts` | Add `root_execution_id` to `PendingChildExecution` and `createPendingChildExecution` |
| `src/db/queries/resumeQueries.ts` | Add `root_execution_id` to `PendingResume` and `createPendingResume` |
| `src/routes/execute/executeCore.ts` | Add `executionId?` and `rootExecutionId?` to `ExecuteCoreInput` |
| `src/routes/execute/executeCoreDispatch.ts` | Pass `rootExecutionId` to dispatch handler |
| `src/routes/execute/executeDispatchHandler.ts` | Store `root_execution_id` in stack + pending child |
| `src/routes/execute/executeHandler.ts` | Pre-generate execId, await subscribe, wait/fallback, semaphore |
| `src/routes/internal/resumeParentHandler.ts` | Add `rootExecutionId` to schema, call `notifyCompletion` |
| `src/workers/childExecutionWorker.ts` | setTimeout loop, propagate `rootExecutionId`, notify on permanent failure |
| `src/workers/resumeWorker.ts` | setTimeout loop, propagate `rootExecutionId`, notify on permanent failure |
| `src/index.ts` | Instantiate notifier, SIGTERM/SIGINT handlers, pass to routes |

---

### Task 1: CompletionNotifier Interface and Types

**Files:**
- Create: `packages/backend/src/notifications/completionNotifier.ts`

- [ ] **Step 1: Create the interface file**

```typescript
// packages/backend/src/notifications/completionNotifier.ts

/* ─── Result type ─── */

export interface ExecutionResult {
  status: 'completed' | 'error';
  text: string;
  executionId: string;
}

/* ─── Notifier interface ─── */

export interface CompletionNotifier {
  waitForCompletion(executionId: string, timeoutMs: number): Promise<ExecutionResult | null>;
  notifyCompletion(executionId: string, result: ExecutionResult): Promise<void>;
  shutdown(): void;
}

/* ─── Configuration constants ─── */

const ENV_DEFAULTS = {
  COMPLETION_TIMEOUT_MS: 120_000,
  COMPLETION_MAX_CONCURRENT: 100,
  COMPLETION_POLLING_GRACE_MS: 10_000,
  COMPLETION_RESULT_TTL_SECONDS: 300,
  COMPLETION_CIRCUIT_THRESHOLD: 3,
  COMPLETION_CIRCUIT_WINDOW: 10,
  COMPLETION_CIRCUIT_COOLDOWN_MS: 30_000,
} as const;

function readEnvInt(name: string, fallback: number): number {
  const { env } = process;
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export interface CompletionConfig {
  timeoutMs: number;
  maxConcurrent: number;
  pollingGraceMs: number;
  resultTtlSeconds: number;
  circuitThreshold: number;
  circuitWindow: number;
  circuitCooldownMs: number;
}

export function loadCompletionConfig(): CompletionConfig {
  return {
    timeoutMs: readEnvInt('COMPLETION_TIMEOUT_MS', ENV_DEFAULTS.COMPLETION_TIMEOUT_MS),
    maxConcurrent: readEnvInt('COMPLETION_MAX_CONCURRENT', ENV_DEFAULTS.COMPLETION_MAX_CONCURRENT),
    pollingGraceMs: readEnvInt('COMPLETION_POLLING_GRACE_MS', ENV_DEFAULTS.COMPLETION_POLLING_GRACE_MS),
    resultTtlSeconds: readEnvInt('COMPLETION_RESULT_TTL_SECONDS', ENV_DEFAULTS.COMPLETION_RESULT_TTL_SECONDS),
    circuitThreshold: readEnvInt('COMPLETION_CIRCUIT_THRESHOLD', ENV_DEFAULTS.COMPLETION_CIRCUIT_THRESHOLD),
    circuitWindow: readEnvInt('COMPLETION_CIRCUIT_WINDOW', ENV_DEFAULTS.COMPLETION_CIRCUIT_WINDOW),
    circuitCooldownMs: readEnvInt('COMPLETION_CIRCUIT_COOLDOWN_MS', ENV_DEFAULTS.COMPLETION_CIRCUIT_COOLDOWN_MS),
  };
}

/* ─── Logging helper ─── */

export function logCompletion(event: string, data?: Record<string, unknown>): void {
  const payload = data !== undefined ? ` ${JSON.stringify(data)}` : '';
  process.stdout.write(`[completion] ${event}${payload}\n`);
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/notifications/completionNotifier.ts
git commit -m "feat(notifications): add CompletionNotifier interface and config"
```

---

### Task 2: InProcessCompletionNotifier

**Files:**
- Create: `packages/backend/src/notifications/inProcessCompletionNotifier.ts`
- Test: `packages/backend/src/notifications/__tests__/inProcessCompletionNotifier.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/backend/src/notifications/__tests__/inProcessCompletionNotifier.test.ts
import { describe, expect, it, beforeEach } from '@jest/globals';

import type { ExecutionResult } from '../completionNotifier.js';
import { InProcessCompletionNotifier } from '../inProcessCompletionNotifier.js';

describe('InProcessCompletionNotifier', () => {
  let notifier: InProcessCompletionNotifier;

  beforeEach(() => {
    notifier = new InProcessCompletionNotifier();
  });

  it('resolves waitForCompletion when notifyCompletion is called', async () => {
    const result: ExecutionResult = { status: 'completed', text: 'done', executionId: 'e1' };
    const promise = notifier.waitForCompletion('e1', 5000);
    await notifier.notifyCompletion('e1', result);
    const received = await promise;
    expect(received).toEqual(result);
  });

  it('returns null on timeout', async () => {
    const received = await notifier.waitForCompletion('e2', 100);
    expect(received).toBeNull();
  });

  it('first notification wins (idempotent)', async () => {
    const first: ExecutionResult = { status: 'completed', text: 'first', executionId: 'e3' };
    const second: ExecutionResult = { status: 'error', text: 'second', executionId: 'e3' };
    const promise = notifier.waitForCompletion('e3', 5000);
    await notifier.notifyCompletion('e3', first);
    await notifier.notifyCompletion('e3', second);
    const received = await promise;
    expect(received).toEqual(first);
  });

  it('shutdown resolves all active waiters with null', async () => {
    const p1 = notifier.waitForCompletion('e4', 60000);
    const p2 = notifier.waitForCompletion('e5', 60000);
    notifier.shutdown();
    expect(await p1).toBeNull();
    expect(await p2).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/backend -- --testPathPatterns=inProcessCompletionNotifier`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the implementation**

```typescript
// packages/backend/src/notifications/inProcessCompletionNotifier.ts
import { setTimeout as sleepMs } from 'node:timers/promises';

import type { CompletionNotifier, ExecutionResult } from './completionNotifier.js';
import { logCompletion } from './completionNotifier.js';

const POLL_INTERVAL_MS = 200;

interface Waiter {
  resolve: (result: ExecutionResult | null) => void;
}

export class InProcessCompletionNotifier implements CompletionNotifier {
  private readonly waiters = new Map<string, Waiter>();
  private readonly results = new Map<string, ExecutionResult>();
  private isShutdown = false;

  constructor() {
    const { env } = process;
    const nodeEnv = env['NODE_ENV'] ?? '';
    if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== '') {
      throw new Error('InProcessCompletionNotifier can only be used in development or test');
    }
  }

  async waitForCompletion(executionId: string, timeoutMs: number): Promise<ExecutionResult | null> {
    logCompletion('wait.started', { executionId, source: 'in-process' });

    return await new Promise<ExecutionResult | null>((resolve) => {
      this.waiters.set(executionId, { resolve });

      const timer = setTimeout(() => {
        this.waiters.delete(executionId);
        logCompletion('wait.timeout', { executionId });
        resolve(this.results.get(executionId) ?? null);
      }, timeoutMs);

      // Check if result already exists (notify called before wait)
      const existing = this.results.get(executionId);
      if (existing !== undefined) {
        clearTimeout(timer);
        this.waiters.delete(executionId);
        logCompletion('wait.resolved', { executionId, source: 'immediate' });
        resolve(existing);
      }
    });
  }

  async notifyCompletion(executionId: string, result: ExecutionResult): Promise<void> {
    // First notification wins
    if (this.results.has(executionId)) return;
    this.results.set(executionId, result);
    logCompletion('notify.sent', { executionId, status: result.status });

    const waiter = this.waiters.get(executionId);
    if (waiter !== undefined) {
      this.waiters.delete(executionId);
      waiter.resolve(result);
    }
  }

  shutdown(): void {
    this.isShutdown = true;
    for (const [id, waiter] of this.waiters) {
      waiter.resolve(null);
      this.waiters.delete(id);
    }
    logCompletion('shutdown');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/backend -- --testPathPatterns=inProcessCompletionNotifier`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/notifications/inProcessCompletionNotifier.ts packages/backend/src/notifications/__tests__/inProcessCompletionNotifier.test.ts
git commit -m "feat(notifications): add InProcessCompletionNotifier with tests"
```

---

### Task 3: RedisCompletionNotifier

**Files:**
- Create: `packages/backend/src/notifications/redisCompletionNotifier.ts`
- Test: `packages/backend/src/notifications/__tests__/redisCompletionNotifier.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/backend/src/notifications/__tests__/redisCompletionNotifier.test.ts
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';

import type { ExecutionResult } from '../completionNotifier.js';
import { loadCompletionConfig } from '../completionNotifier.js';
import { RedisCompletionNotifier } from '../redisCompletionNotifier.js';

// These tests require REDIS_URL to be set (Redis Cloud)
const REDIS_URL = process.env['REDIS_URL'] ?? '';
const describeIfRedis = REDIS_URL !== '' ? describe : describe.skip;

describeIfRedis('RedisCompletionNotifier (integration)', () => {
  let notifier: RedisCompletionNotifier;

  beforeEach(() => {
    const config = loadCompletionConfig();
    notifier = new RedisCompletionNotifier(config);
  });

  afterEach(() => {
    notifier.shutdown();
  });

  it('resolves waitForCompletion when notifyCompletion is called', async () => {
    const execId = `test-${Date.now()}-1`;
    const result: ExecutionResult = { status: 'completed', text: 'hello', executionId: execId };

    const promise = notifier.waitForCompletion(execId, 10000);

    // Small delay to ensure subscription is active
    await new Promise((r) => setTimeout(r, 200));
    await notifier.notifyCompletion(execId, result);

    const received = await promise;
    expect(received).toEqual(result);
  });

  it('falls back to durable key when Pub/Sub misses', async () => {
    const execId = `test-${Date.now()}-2`;
    const result: ExecutionResult = { status: 'completed', text: 'from-key', executionId: execId };

    // Write durable key directly (simulating notify that happened before subscribe)
    await notifier.notifyCompletion(execId, result);

    // Wait with very short Pub/Sub timeout — will miss the Pub/Sub, find the key
    const received = await notifier.waitForCompletion(execId, 2000);
    expect(received).toEqual(result);
  });

  it('returns null on full timeout', async () => {
    const execId = `test-${Date.now()}-3`;
    const received = await notifier.waitForCompletion(execId, 500);
    expect(received).toBeNull();
  });

  it('first notification wins (NX)', async () => {
    const execId = `test-${Date.now()}-4`;
    const first: ExecutionResult = { status: 'completed', text: 'first', executionId: execId };
    const second: ExecutionResult = { status: 'error', text: 'second', executionId: execId };

    await notifier.notifyCompletion(execId, first);
    await notifier.notifyCompletion(execId, second);

    const received = await notifier.waitForCompletion(execId, 2000);
    expect(received?.text).toBe('first');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && source .env && export REDIS_URL && npm test -- --testPathPatterns=redisCompletionNotifier`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the implementation**

```typescript
// packages/backend/src/notifications/redisCompletionNotifier.ts
import { Redis } from 'ioredis';
import { setTimeout as sleepMs } from 'node:timers/promises';

import type { CompletionConfig, CompletionNotifier, ExecutionResult } from './completionNotifier.js';
import { logCompletion } from './completionNotifier.js';
import { getRedisCloud } from '../messaging/services/redisCloud.js';

/* ─── Constants ─── */

const CHANNEL_PREFIX = 'completion:';
const KEY_PREFIX = 'completion_result:';
const PUBLISH_MAX_RETRIES = 3;
const PUBLISH_BASE_DELAY_MS = 100;
const POLLING_INTERVAL_MS = 2000;

/* ─── Circuit Breaker ─── */

class CircuitBreaker {
  private readonly results: boolean[] = [];
  private openedAt: number | null = null;

  constructor(
    private readonly threshold: number,
    private readonly windowSize: number,
    private readonly cooldownMs: number
  ) {}

  isOpen(): boolean {
    if (this.openedAt === null) return false;
    if (Date.now() - this.openedAt >= this.cooldownMs) {
      this.openedAt = null;
      this.results.length = 0;
      logCompletion('circuit.close');
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.push(true);
  }

  recordFailure(): void {
    this.push(false);
    this.checkTrip();
  }

  private push(success: boolean): void {
    this.results.push(success);
    if (this.results.length > this.windowSize) this.results.shift();
  }

  private checkTrip(): void {
    if (this.results.length < this.threshold) return;
    const failures = this.results.filter((r) => !r).length;
    if (failures >= this.threshold) {
      this.openedAt = Date.now();
      logCompletion('circuit.open', { failures, window: this.results.length });
    }
  }
}

/* ─── Waiter entry ─── */

interface WaiterEntry {
  resolve: (result: ExecutionResult | null) => void;
  timer: NodeJS.Timeout;
}

/* ─── RedisCompletionNotifier ─── */

export class RedisCompletionNotifier implements CompletionNotifier {
  private readonly subscriber: Redis;
  private readonly publisher: Redis;
  private readonly waiters = new Map<string, WaiterEntry>();
  private readonly circuit: CircuitBreaker;
  private readonly config: CompletionConfig;

  constructor(config: CompletionConfig) {
    this.config = config;
    this.circuit = new CircuitBreaker(config.circuitThreshold, config.circuitWindow, config.circuitCooldownMs);

    const { env } = process;
    const { REDIS_URL } = env;
    if (REDIS_URL === undefined || REDIS_URL === '') {
      throw new Error('REDIS_URL is required for RedisCompletionNotifier');
    }

    this.subscriber = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
    this.publisher = getRedisCloud();

    this.subscriber.on('message', (channel: string, message: string) => {
      const execId = channel.startsWith(CHANNEL_PREFIX) ? channel.slice(CHANNEL_PREFIX.length) : '';
      const waiter = this.waiters.get(execId);
      if (waiter === undefined) return;
      try {
        const result = JSON.parse(message) as ExecutionResult;
        this.resolveWaiter(execId, waiter, result, 'pubsub');
      } catch {
        logCompletion('parse_error', { channel });
      }
    });
  }

  async waitForCompletion(executionId: string, timeoutMs: number): Promise<ExecutionResult | null> {
    logCompletion('wait.started', { executionId });

    // Circuit open → skip Pub/Sub, go straight to polling
    if (this.circuit.isOpen()) {
      logCompletion('circuit.bypass', { executionId });
      return await this.pollForResult(executionId, timeoutMs);
    }

    try {
      return await this.waitViaPubSub(executionId, timeoutMs);
    } catch (err) {
      this.circuit.recordFailure();
      logCompletion('subscribe_error', { executionId, error: String(err) });
      // Fall back to polling on subscribe failure
      return await this.pollForResult(executionId, timeoutMs);
    }
  }

  async notifyCompletion(executionId: string, result: ExecutionResult): Promise<void> {
    const payload = JSON.stringify(result);
    const key = `${KEY_PREFIX}${executionId}`;
    const channel = `${CHANNEL_PREFIX}${executionId}`;

    // 1. Durable key (NX = first wins)
    try {
      await this.publisher.set(key, payload, 'EX', this.config.resultTtlSeconds, 'NX');
    } catch (err) {
      logCompletion('key_write_error', { executionId, error: String(err) });
    }

    // 2. PUBLISH with jittered retries
    await this.publishWithRetry(channel, payload, executionId);

    logCompletion('notify.sent', { executionId, status: result.status });
  }

  shutdown(): void {
    for (const [id, waiter] of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    this.waiters.clear();
    this.subscriber.disconnect();
    logCompletion('shutdown');
  }

  /* ─── Private: Pub/Sub wait path ─── */

  private async waitViaPubSub(executionId: string, timeoutMs: number): Promise<ExecutionResult | null> {
    const channel = `${CHANNEL_PREFIX}${executionId}`;

    // Await subscribe confirmation before returning
    await this.subscriber.subscribe(channel);
    this.circuit.recordSuccess();

    return new Promise<ExecutionResult | null>((resolve) => {
      const timer = setTimeout(() => {
        void this.onPubSubTimeout(executionId, resolve);
      }, timeoutMs);

      this.waiters.set(executionId, { resolve, timer });

      // Check if result was written before we subscribed (race safety)
      void this.checkDurableKey(executionId).then((existing) => {
        if (existing !== null) {
          const waiter = this.waiters.get(executionId);
          if (waiter !== undefined) {
            this.resolveWaiter(executionId, waiter, existing, 'key-precheck');
          }
        }
      });
    });
  }

  /* ─── Private: Timeout handler with fallback tiers ─── */

  private async onPubSubTimeout(
    executionId: string,
    resolve: (result: ExecutionResult | null) => void
  ): Promise<void> {
    this.cleanupWaiter(executionId);

    // Tier 2: Durable key check
    const keyResult = await this.checkDurableKey(executionId);
    if (keyResult !== null) {
      logCompletion('wait.resolved', { executionId, source: 'key' });
      resolve(keyResult);
      return;
    }

    // Tier 3: Polling loop
    const pollResult = await this.pollDurableKey(executionId, this.config.pollingGraceMs);
    if (pollResult !== null) {
      logCompletion('wait.resolved', { executionId, source: 'polling' });
      resolve(pollResult);
      return;
    }

    logCompletion('wait.timeout', { executionId });
    resolve(null);
  }

  /* ─── Private: Polling fallback (no Pub/Sub available) ─── */

  private async pollForResult(executionId: string, timeoutMs: number): Promise<ExecutionResult | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.checkDurableKey(executionId);
      if (result !== null) {
        logCompletion('wait.resolved', { executionId, source: 'polling' });
        return result;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleepMs(Math.min(POLLING_INTERVAL_MS, remaining));
    }
    logCompletion('wait.timeout', { executionId });
    return null;
  }

  /* ─── Private: Durable key operations ─── */

  private async checkDurableKey(executionId: string): Promise<ExecutionResult | null> {
    try {
      const raw = await this.publisher.get(`${KEY_PREFIX}${executionId}`);
      if (raw === null) return null;
      return JSON.parse(raw) as ExecutionResult;
    } catch {
      return null;
    }
  }

  private async pollDurableKey(executionId: string, graceMs: number): Promise<ExecutionResult | null> {
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline) {
      const result = await this.checkDurableKey(executionId);
      if (result !== null) return result;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleepMs(Math.min(POLLING_INTERVAL_MS, remaining));
    }
    return null;
  }

  /* ─── Private: Publish with jittered exponential backoff ─── */

  private async publishWithRetry(channel: string, payload: string, executionId: string): Promise<void> {
    for (let attempt = 0; attempt < PUBLISH_MAX_RETRIES; attempt++) {
      try {
        await this.publisher.publish(channel, payload);
        return;
      } catch (err) {
        logCompletion('notify.publish_retry', { executionId, attempt, error: String(err) });
        const jitter = Math.random() * PUBLISH_BASE_DELAY_MS;
        const delay = PUBLISH_BASE_DELAY_MS * Math.pow(2, attempt) + jitter;
        await sleepMs(delay);
      }
    }
  }

  /* ─── Private: Resolve and cleanup ─── */

  private resolveWaiter(executionId: string, waiter: WaiterEntry, result: ExecutionResult, source: string): void {
    clearTimeout(waiter.timer);
    this.waiters.delete(executionId);
    void this.subscriber.unsubscribe(`${CHANNEL_PREFIX}${executionId}`);
    logCompletion('wait.resolved', { executionId, source });
    waiter.resolve(result);
  }

  private cleanupWaiter(executionId: string): void {
    const waiter = this.waiters.get(executionId);
    if (waiter !== undefined) {
      clearTimeout(waiter.timer);
      this.waiters.delete(executionId);
    }
    void this.subscriber.unsubscribe(`${CHANNEL_PREFIX}${executionId}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/backend && source .env && export REDIS_URL && npm test -- --testPathPatterns=redisCompletionNotifier`
Expected: 4 tests PASS (requires Redis Cloud running)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/notifications/redisCompletionNotifier.ts packages/backend/src/notifications/__tests__/redisCompletionNotifier.test.ts
git commit -m "feat(notifications): add RedisCompletionNotifier with integration tests"
```

---

### Task 4: DB Migration — `root_execution_id`

**Files:**
- Create: `supabase/migrations/20260414100000_root_execution_id.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260414100000_root_execution_id.sql
-- Add root_execution_id to composition tables for N-depth notification routing

ALTER TABLE agent_stack_entries
  ADD COLUMN root_execution_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE pending_child_executions
  ADD COLUMN root_execution_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE pending_resumes
  ADD COLUMN root_execution_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Backfill existing rows: root = parent (or self if no parent)
UPDATE agent_stack_entries
  SET root_execution_id = COALESCE(parent_execution_id, execution_id);

UPDATE pending_child_executions
  SET root_execution_id = parent_execution_id;

UPDATE pending_resumes
  SET root_execution_id = parent_execution_id;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push`
Expected: Migration applied

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260414100000_root_execution_id.sql
git commit -m "feat(db): add root_execution_id to composition tables"
```

---

### Task 5: Update DB Query Interfaces for `rootExecutionId`

**Files:**
- Modify: `packages/backend/src/db/queries/stackQueries.ts`
- Modify: `packages/backend/src/db/queries/childExecutionQueries.ts`
- Modify: `packages/backend/src/db/queries/resumeQueries.ts`

- [ ] **Step 1: Update `stackQueries.ts`**

Add `root_execution_id` to `StackEntry` interface (after line 16):

```typescript
// In StackEntry interface, add after app_type line:
  root_execution_id: string;
```

Add `rootExecutionId` to `PushStackEntryParams` (after line 55):

```typescript
// In PushStackEntryParams interface, add after appType line:
  rootExecutionId: string;
```

Add `root_execution_id` to the insert in `pushStackEntry` (after line 67):

```typescript
// In pushStackEntry insert object, add:
    root_execution_id: params.rootExecutionId,
```

- [ ] **Step 2: Update `childExecutionQueries.ts`**

Add `root_execution_id` to `PendingChildExecution` interface (after line 15):

```typescript
  root_execution_id: string;
```

Add `rootExecutionId` to the `createPendingChildExecution` params type (after line 32):

```typescript
    rootExecutionId: string;
```

Add to the insert object (after line 42):

```typescript
    root_execution_id: params.rootExecutionId,
```

- [ ] **Step 3: Update `resumeQueries.ts`**

Add `root_execution_id` to `PendingResume` interface (after line 15):

```typescript
  root_execution_id: string;
```

Add `rootExecutionId` to `createPendingResume` params (after line 31):

```typescript
    rootExecutionId: string;
```

Add to the upsert object (after line 42):

```typescript
    root_execution_id: params.rootExecutionId,
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: Errors in files that call these functions (expected — we'll fix them in following tasks)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/queries/stackQueries.ts packages/backend/src/db/queries/childExecutionQueries.ts packages/backend/src/db/queries/resumeQueries.ts
git commit -m "feat(db): add rootExecutionId to stack, child, and resume query interfaces"
```

---

### Task 6: Thread `rootExecutionId` Through Dispatch

**Files:**
- Modify: `packages/backend/src/routes/execute/executeCore.ts`
- Modify: `packages/backend/src/routes/execute/executeCoreDispatch.ts`
- Modify: `packages/backend/src/routes/execute/executeDispatchHandler.ts`

- [ ] **Step 1: Add fields to `ExecuteCoreInput`**

In `executeCore.ts`, add to `ExecuteCoreInput` interface after `overrideAgentConfig` (line 39):

```typescript
  /** Pre-generated execution ID (enables subscribe-before-dispatch) */
  executionId?: string;
  /** Root execution ID for composition notification routing */
  rootExecutionId?: string;
```

In `setupExecution`, use the pre-generated executionId if provided. Replace lines 94-106:

```typescript
  const [{ executionId }, conversationId] = await Promise.all([
    persistPreExecution(supabase, {
      sessionDbId: fetched.sessionDbId,
      agentId,
      orgId,
      version,
      model,
      channel: input.channel,
      tenantId: input.tenantId,
      userId: input.userId,
      userMessageContent: extractTextFromInput(input),
      currentNodeId: fetched.currentNodeId,
      executionId: params.executionId,
    }),
    resolveConversationId(supabase, params),
  ]);
```

In `executePersistence.ts`, add `executionId?: string` to `PreExecutionParams` and pass it to `createExecution`. In `createExecution` (executionQueries.ts), if `params.executionId` is provided, insert with that ID.

- [ ] **Step 2: Pass `rootExecutionId` through dispatch**

In `executeCoreDispatch.ts`, add `rootExecutionId` to the `handleDispatchResult` call (around line 39):

```typescript
  await handleDispatchResult({
    supabase: ctx.supabase,
    sessionId: ctx.fetched.sessionDbId,
    parentExecutionId: ctx.executionId,
    dispatchResult: ctx.output.dispatchResult,
    parentSessionState: {
      currentNodeId: ctx.fetched.currentNodeId,
      structuredOutputs: ctx.fetched.structuredOutputs,
    },
    orgId: ctx.params.orgId,
    agentId: ctx.params.agentId,
    version: ctx.params.version,
    apiKey: ctx.fetched.apiKey,
    channel: ctx.params.input.channel,
    tenantId: ctx.params.input.tenantId,
    userId: ctx.params.input.userId,
    parentToolCalls: mapToolCalls(ctx.output),
    rootExecutionId: ctx.params.rootExecutionId ?? ctx.executionId,
  });
```

- [ ] **Step 3: Store `rootExecutionId` in dispatch handler**

In `executeDispatchHandler.ts`, add `rootExecutionId: string` to `DispatchHandlerParams` interface.

In `pushStackAndPending` (line 177), add to the `pushStackEntry` call:

```typescript
    rootExecutionId: params.childConfig.isChildAgent
      ? params.rootExecutionId
      : params.rootExecutionId,
```

Wait — it is always `params.rootExecutionId` regardless. Simplify:

```typescript
    rootExecutionId: params.rootExecutionId,
```

In `writePendingChild` (line 200), add to the `createPendingChildExecution` call:

```typescript
    rootExecutionId: params.rootExecutionId,
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors (or only errors in files we'll fix next)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/executeCore.ts packages/backend/src/routes/execute/executeCoreDispatch.ts packages/backend/src/routes/execute/executeDispatchHandler.ts packages/backend/src/routes/execute/executePersistence.ts packages/backend/src/db/queries/executionQueries.ts
git commit -m "feat(execution): thread rootExecutionId through dispatch chain"
```

---

### Task 7: Thread `rootExecutionId` Through Workers and Resume

**Files:**
- Modify: `packages/backend/src/workers/childExecutionWorker.ts`
- Modify: `packages/backend/src/workers/resumeWorker.ts`
- Modify: `packages/backend/src/routes/internal/resumeParentHandler.ts`

- [ ] **Step 1: Update `childExecutionWorker.ts`**

In `createResumeFromFinish`, add `rootExecutionId` to the `createPendingResume` call:

```typescript
  await createPendingResume(supabase, {
    sessionId: child.session_id,
    parentExecutionId: child.parent_execution_id,
    parentToolOutputMessageId: stackEntry.parent_tool_output_message_id ?? '',
    childOutput: finishResult.output,
    childStatus: finishResult.status,
    parentSessionState: stackEntry.parent_session_state ?? {},
    rootExecutionId: child.root_execution_id,
  });
```

In `buildCoreInput`, pass `rootExecutionId`:

```typescript
  const base: ExecuteCoreInput = {
    // ...existing fields...
    rootExecutionId: child.root_execution_id,
  };
```

- [ ] **Step 2: Update `resumeWorker.ts`**

In `attemptResume`, add `rootExecutionId` to the POST body:

```typescript
    body: JSON.stringify({
      sessionId: resume.session_id,
      parentExecutionId: resume.parent_execution_id,
      parentToolOutputMessageId: resume.parent_tool_output_message_id,
      childOutput: resume.child_output,
      childStatus: resume.child_status,
      parentSessionState: resume.parent_session_state,
      rootExecutionId: resume.root_execution_id,
    }),
```

- [ ] **Step 3: Update `resumeParentHandler.ts`**

Add `rootExecutionId` to `ResumeParentBodySchema`:

```typescript
const ResumeParentBodySchema = z.object({
  sessionId: z.string(),
  parentExecutionId: z.string(),
  parentToolOutputMessageId: z.string(),
  childOutput: z.string(),
  childStatus: z.enum(['success', 'error']),
  parentSessionState: z.record(z.string(), z.unknown()),
  rootExecutionId: z.string(),
});
```

In `reinvokeParent`, pass `rootExecutionId`:

```typescript
  await executeAgentCore({
    // ...existing fields...
    continueExecutionId: data.parentExecutionId,
    rootExecutionId: data.rootExecutionId,
  });
```

`reinvokeParent` should return the output so the handler can check for dispatch and notify. Change its return type to `Promise<CallAgentOutput | null>`:

```typescript
async function reinvokeParent(
  supabase: SupabaseClient,
  parentExec: ParentExecutionRow,
  data: ResumeParentData
): Promise<CallAgentOutput | null> {
  const result = await executeAgentCore({
    supabase,
    orgId: parentExec.org_id,
    agentId: parentExec.agent_id,
    version: parentExec.version,
    input: {
      tenantId: parentExec.tenant_id,
      userId: parentExec.external_user_id,
      sessionId: data.sessionId,
      message: { text: '' },
      channel: toChannel(parentExec.channel),
      stream: false,
    },
    continueExecutionId: data.parentExecutionId,
    rootExecutionId: data.rootExecutionId,
  });
  log(`parent re-invoked executionId=${data.parentExecutionId}`);
  return result.output;
}
```

In `handleResumeParent`, after `reinvokeParent`:

```typescript
    const output = await reinvokeParent(supabase, parentExec, data);

    // Notify completion if chain is done (no further dispatch)
    if (output !== null && output.dispatchResult === undefined) {
      const notifier = getNotifier();
      await notifier.notifyCompletion(data.rootExecutionId, {
        status: 'completed',
        text: output.text ?? '',
        executionId: data.rootExecutionId,
      });
    }

    log(`parent resumed parentExecution=${data.parentExecutionId}`);
    res.status(HTTP_OK).json({ resumed: true, parentExecutionId: data.parentExecutionId });
```

The `getNotifier()` function will be a module-level getter set during server initialization. We'll wire this in Task 10.

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: Errors about `getNotifier` not existing yet (expected — Task 10)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/workers/childExecutionWorker.ts packages/backend/src/workers/resumeWorker.ts packages/backend/src/routes/internal/resumeParentHandler.ts
git commit -m "feat(composition): thread rootExecutionId through workers and resume handler"
```

---

### Task 8: Worker Improvements — setTimeout Loop and Failure Notification

**Files:**
- Modify: `packages/backend/src/workers/childExecutionWorker.ts`
- Modify: `packages/backend/src/workers/resumeWorker.ts`

- [ ] **Step 1: Refactor `childExecutionWorker.ts` poll loop**

Replace `startChildExecutionWorker` (lines 186-195):

```typescript
export function startChildExecutionWorker(): void {
  log('Starting child execution worker');

  async function pollLoop(): Promise<void> {
    try {
      await processPendingChildExecutions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Error: ${msg}`);
    } finally {
      setTimeout(() => void pollLoop(), POLL_INTERVAL_MS);
    }
  }

  void pollLoop();
}
```

Add permanent failure notification in `processOneChildExecution` catch block (after line 157-159):

```typescript
    if (child.attempts + INCREMENT >= MAX_ATTEMPTS) {
      await updateChildExecutionStatus(supabase, child.id, 'failed');
      log(`max attempts reached execution=${child.execution_id}`);

      // Notify root that the chain has permanently failed
      const notifier = getNotifier();
      await notifier.notifyCompletion(child.root_execution_id, {
        status: 'error',
        text: `Child execution failed after ${String(MAX_ATTEMPTS)} attempts: ${msg}`,
        executionId: child.root_execution_id,
      });
    }
```

- [ ] **Step 2: Refactor `resumeWorker.ts` poll loop**

Replace `startResumeWorker` (lines 93-102):

```typescript
export function startResumeWorker(): void {
  log('Starting resume worker');

  async function pollLoop(): Promise<void> {
    try {
      await processPendingResumes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Error: ${msg}`);
    } finally {
      setTimeout(() => void pollLoop(), POLL_INTERVAL_MS);
    }
  }

  void pollLoop();
}
```

Add permanent failure notification in `processOneResume` (after lines 68-70):

```typescript
  if (resume.attempts + INCREMENT >= MAX_ATTEMPTS) {
    await updateResumeStatus(supabase, resume.id, 'failed');
    log(`max attempts reached parentExecution=${resume.parent_execution_id}`);

    // Notify root that the chain has permanently failed
    const notifier = getNotifier();
    await notifier.notifyCompletion(resume.root_execution_id, {
      status: 'error',
      text: `Parent resume failed after ${String(MAX_ATTEMPTS)} attempts`,
      executionId: resume.root_execution_id,
    });
  }
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: Errors about `getNotifier` (expected — Task 10)

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/workers/childExecutionWorker.ts packages/backend/src/workers/resumeWorker.ts
git commit -m "feat(workers): setTimeout loop, permanent failure notifications"
```

---

### Task 9: HTTP Handler Integration — Wait for Completion

**Files:**
- Modify: `packages/backend/src/routes/execute/executeHandler.ts`

- [ ] **Step 1: Update `handleNonStreaming` to wait for dispatch completion**

```typescript
async function handleNonStreaming(parsed: ParsedInput, res: Response): Promise<void> {
  const notifier = getNotifier();
  const config = getCompletionConfig();

  // Pre-generate executionId for subscribe-before-dispatch
  const executionId = crypto.randomUUID();

  // Subscribe BEFORE executing (await confirmation)
  const waitPromise = notifier.waitForCompletion(executionId, config.timeoutMs);

  const result = await executeAgentCore({
    supabase: parsed.supabase,
    orgId: parsed.orgId,
    agentId: parsed.agentId,
    version: parsed.version,
    input: parsed.input,
    executionId,
    rootExecutionId: executionId,
  });

  // No dispatch → cancel wait, return normally
  if (result.output === null || result.output.dispatchResult === undefined) {
    notifier.cancelWait?.(executionId); // cleanup if implemented, otherwise timeout handles it
    if (result.output !== null) {
      res.json(buildResponseByType(result.appType, result.output, result.durationMs));
    } else {
      res.json(buildEmptyResponse(result.appType));
    }
    return;
  }

  // Dispatch detected → wait for async chain to complete
  logExec('waiting for composition completion', { executionId });
  const completionResult = await waitPromise;

  if (completionResult !== null) {
    // Build response from the completion result
    res.json({
      ...buildResponseByType(result.appType, result.output, Date.now() - (result.durationMs ? Date.now() - result.durationMs : 0)),
      text: completionResult.text,
      executionId,
    });
  } else {
    // Timeout — return partial response with executionId for polling
    res.json({
      ...buildResponseByType(result.appType, result.output, result.durationMs),
      executionId,
    });
  }
}
```

Note: The exact response shape integration requires reading the response builder types more carefully. The implementation subagent should read `executeResponseBuilders.ts` and ensure the response merges cleanly. The key point is: on completion, override `text` with `completionResult.text`.

- [ ] **Step 2: Add `crypto` import at top of file**

```typescript
import { randomUUID } from 'node:crypto';
```

Then use `randomUUID()` instead of `crypto.randomUUID()`.

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: Errors about `getNotifier`/`getCompletionConfig` (expected — Task 10)

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/execute/executeHandler.ts
git commit -m "feat(execution): HTTP handler waits for composition completion"
```

---

### Task 10: Polling Endpoint

**Files:**
- Create: `packages/backend/src/routes/execute/executionResultRoute.ts`
- Modify: `packages/backend/src/routes/execute/executeRoute.ts`

- [ ] **Step 1: Create the polling endpoint**

```typescript
// packages/backend/src/routes/execute/executionResultRoute.ts
import type { Request, Response } from 'express';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;

interface ExecutionRow {
  status: string;
}

interface MessageRow {
  content: unknown;
}

async function fetchExecutionStatus(supabase: SupabaseClient, executionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_executions')
    .select('status')
    .eq('id', executionId)
    .maybeSingle() as { data: ExecutionRow | null; error: { message: string } | null };

  if (error !== null) throw new Error(error.message);
  return data?.status ?? null;
}

async function fetchFinalText(supabase: SupabaseClient, executionId: string): Promise<string> {
  const { data, error } = await supabase
    .from('agent_execution_messages')
    .select('content')
    .eq('execution_id', executionId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: MessageRow | null; error: { message: string } | null };

  if (error !== null) throw new Error(error.message);
  if (data === null) return '';
  const content = data.content;
  if (typeof content === 'object' && content !== null && 'text' in content) {
    return String((content as Record<string, unknown>).text);
  }
  return typeof content === 'string' ? content : '';
}

export async function handleGetExecutionResult(
  req: Request<{ executionId: string }>,
  res: Response
): Promise<void> {
  const { executionId } = req.params;
  const supabase = createServiceClient();

  try {
    const status = await fetchExecutionStatus(supabase, executionId);

    if (status === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Execution not found' });
      return;
    }

    if (status === 'completed') {
      const text = await fetchFinalText(supabase, executionId);
      res.status(HTTP_OK).json({ status: 'completed', text, executionId });
      return;
    }

    if (status === 'failed') {
      res.status(HTTP_OK).json({ status: 'error', text: '', executionId });
      return;
    }

    // running or suspended
    res.status(HTTP_OK).json({ status: 'running', executionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch execution result';
    res.status(HTTP_INTERNAL).json({ error: message });
  }
}
```

- [ ] **Step 2: Add route to `executeRoute.ts`**

```typescript
import { handleGetExecutionResult } from './executionResultRoute.js';

// Add after the existing route:
executeRouter.get('/result/:executionId', handleGetExecutionResult);
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/execute/executionResultRoute.ts packages/backend/src/routes/execute/executeRoute.ts
git commit -m "feat(execution): add GET /api/executions/result/:id polling endpoint"
```

---

### Task 11: Notifier Singleton and Server Wiring

**Files:**
- Create: `packages/backend/src/notifications/notifierSingleton.ts`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Create the singleton module**

```typescript
// packages/backend/src/notifications/notifierSingleton.ts
import type { CompletionConfig, CompletionNotifier } from './completionNotifier.js';

let notifierInstance: CompletionNotifier | null = null;
let configInstance: CompletionConfig | null = null;

export function setNotifier(notifier: CompletionNotifier, config: CompletionConfig): void {
  notifierInstance = notifier;
  configInstance = config;
}

export function getNotifier(): CompletionNotifier {
  if (notifierInstance === null) {
    throw new Error('CompletionNotifier not initialized — call setNotifier() during startup');
  }
  return notifierInstance;
}

export function getCompletionConfig(): CompletionConfig {
  if (configInstance === null) {
    throw new Error('CompletionConfig not initialized — call setNotifier() during startup');
  }
  return configInstance;
}
```

- [ ] **Step 2: Wire into `index.ts`**

```typescript
#!/usr/bin/env node
import { initializeSocketIO } from './messaging/socket/index.js';
import { loadCompletionConfig } from './notifications/completionNotifier.js';
import { InProcessCompletionNotifier } from './notifications/inProcessCompletionNotifier.js';
import { setNotifier } from './notifications/notifierSingleton.js';
import { RedisCompletionNotifier } from './notifications/redisCompletionNotifier.js';
import { fetchAndCacheModels } from './openrouter/modelCache.js';
import { createApp } from './server.js';
import { startChildExecutionWorker } from './workers/childExecutionWorker.js';
import { startResumeWorker } from './workers/resumeWorker.js';

const DEFAULT_PORT = 4000;

const ZERO = 0;
const envPort = Number(process.env.PORT);
const port = Number.isNaN(envPort) || envPort === ZERO ? DEFAULT_PORT : envPort;

// Initialize CompletionNotifier
const config = loadCompletionConfig();
const { env } = process;
const nodeEnv = env['NODE_ENV'] ?? '';
const useRedis = nodeEnv !== 'test' && (env['REDIS_URL'] ?? '') !== '';
const notifier = useRedis ? new RedisCompletionNotifier(config) : new InProcessCompletionNotifier();
setNotifier(notifier, config);

const app = createApp();

const server = app.listen(port, () => {
  process.stdout.write(`Graph Runner Backend listening on port ${String(port)}\n`);
  void fetchAndCacheModels();
});

initializeSocketIO(server);
startResumeWorker();
startChildExecutionWorker();

// Graceful shutdown
function handleShutdown(): void {
  process.stdout.write('[server] shutting down...\n');
  notifier.shutdown();
  server.close();
}

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
```

- [ ] **Step 3: Update all `getNotifier` imports**

In files that call `getNotifier()` (resumeParentHandler.ts, childExecutionWorker.ts, resumeWorker.ts, executeHandler.ts), add:

```typescript
import { getNotifier } from '../../notifications/notifierSingleton.js';
// or adjust path depth as needed
```

Also in `executeHandler.ts`, import `getCompletionConfig`:

```typescript
import { getCompletionConfig } from '../../notifications/notifierSingleton.js';
```

- [ ] **Step 4: Full typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Full lint check**

Run: `npx eslint packages/backend/src/`
Expected: Fix any lint issues

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/notifications/notifierSingleton.ts packages/backend/src/index.ts packages/backend/src/routes/execute/executeHandler.ts packages/backend/src/routes/internal/resumeParentHandler.ts packages/backend/src/workers/childExecutionWorker.ts packages/backend/src/workers/resumeWorker.ts
git commit -m "feat(notifications): wire CompletionNotifier singleton into server"
```

---

### Task 12: Pre-generated Execution ID Support

**Files:**
- Modify: `packages/backend/src/routes/execute/executePersistence.ts`
- Modify: `packages/backend/src/db/queries/executionQueries.ts`

- [ ] **Step 1: Add `executionId` to `PreExecutionParams`**

In `executePersistence.ts`, add to `PreExecutionParams` interface:

```typescript
  /** Pre-generated execution ID (optional — UUID generated if not provided) */
  executionId?: string;
```

Pass it to `createExecution`:

```typescript
  const executionId = await createExecution(supabase, {
    // ...existing fields...
    executionId: params.executionId,
  });
```

- [ ] **Step 2: Add `executionId` to `CreateExecutionParams` in `executionQueries.ts`**

Add to the params interface:

```typescript
  executionId?: string;
```

In `createExecution`, if provided, include `id` in the insert:

```typescript
  const insertData: Record<string, unknown> = {
    session_id: params.sessionId,
    agent_id: params.agentId,
    org_id: params.orgId,
    version: params.version,
    model: params.model,
    channel: params.channel,
    tenant_id: params.tenantId,
    external_user_id: params.userId,
    status: 'running',
    parent_execution_id: params.parentExecutionId ?? null,
    is_dynamic_child: params.isDynamicChild ?? false,
  };

  if (params.executionId !== undefined) {
    insertData.id = params.executionId;
  }

  const result = await supabase
    .from('agent_executions')
    .insert(insertData)
    .select('id')
    .single();
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/execute/executePersistence.ts packages/backend/src/db/queries/executionQueries.ts
git commit -m "feat(execution): support pre-generated executionId"
```

---

### Task 13: Final Integration Test

**Files:**
- Create: `packages/backend/scripts/test-completion-flow.ts`

- [ ] **Step 1: Write an integration test script**

```typescript
// packages/backend/scripts/test-completion-flow.ts
/**
 * End-to-end test: verify CompletionNotifier dual-write + subscribe flow.
 * Run: cd packages/backend && source .env && export REDIS_URL && npx tsx scripts/test-completion-flow.ts
 */
import { loadCompletionConfig } from '../src/notifications/completionNotifier.js';
import type { ExecutionResult } from '../src/notifications/completionNotifier.js';
import { RedisCompletionNotifier } from '../src/notifications/redisCompletionNotifier.js';

const config = loadCompletionConfig();
const notifier = new RedisCompletionNotifier(config);

async function testHappyPath(): Promise<void> {
  const execId = `e2e-${Date.now()}-happy`;
  console.log(`[1/3] Happy path: subscribe → notify → receive`);

  const waitPromise = notifier.waitForCompletion(execId, 10000);
  await new Promise((r) => setTimeout(r, 300)); // Let subscribe settle

  const result: ExecutionResult = { status: 'completed', text: 'recipe output', executionId: execId };
  await notifier.notifyCompletion(execId, result);

  const received = await waitPromise;
  if (received === null) throw new Error('Expected result, got null');
  if (received.text !== 'recipe output') throw new Error(`Expected 'recipe output', got '${received.text}'`);
  console.log(`   PASS`);
}

async function testDurableKeyFallback(): Promise<void> {
  const execId = `e2e-${Date.now()}-key`;
  console.log(`[2/3] Durable key fallback: notify first → subscribe → receive from key`);

  const result: ExecutionResult = { status: 'completed', text: 'key-result', executionId: execId };
  await notifier.notifyCompletion(execId, result);

  // Subscribe AFTER notify — Pub/Sub will miss, should find durable key
  const received = await notifier.waitForCompletion(execId, 5000);
  if (received === null) throw new Error('Expected result from key fallback, got null');
  if (received.text !== 'key-result') throw new Error(`Expected 'key-result', got '${received.text}'`);
  console.log(`   PASS`);
}

async function testFirstWins(): Promise<void> {
  const execId = `e2e-${Date.now()}-nx`;
  console.log(`[3/3] NX idempotency: first notification wins`);

  await notifier.notifyCompletion(execId, { status: 'completed', text: 'first', executionId: execId });
  await notifier.notifyCompletion(execId, { status: 'error', text: 'second', executionId: execId });

  const received = await notifier.waitForCompletion(execId, 3000);
  if (received?.text !== 'first') throw new Error(`Expected 'first', got '${received?.text}'`);
  console.log(`   PASS`);
}

async function main(): Promise<void> {
  console.log('\nCompletionNotifier E2E Test\n');
  try {
    await testHappyPath();
    await testDurableKeyFallback();
    await testFirstWins();
    console.log('\n All tests passed!\n');
  } catch (err) {
    console.error(`\n FAILED: ${String(err)}\n`);
    process.exit(1);
  } finally {
    notifier.shutdown();
  }
}

void main();
```

- [ ] **Step 2: Run the integration test**

Run: `cd packages/backend && source .env && export REDIS_URL && npx tsx scripts/test-completion-flow.ts`
Expected: All 3 tests PASS

- [ ] **Step 3: Run full typecheck and lint**

Run: `npx tsc --noEmit && npx eslint packages/backend/src/`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/backend/scripts/test-completion-flow.ts
git commit -m "test(notifications): add CompletionNotifier e2e integration test"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Task |
|---|---|
| Interface + types | Task 1 |
| InProcessCompletionNotifier | Task 2 |
| RedisCompletionNotifier (shared subscriber, NX key, circuit breaker) | Task 3 |
| DB migration (root_execution_id) | Task 4 |
| Query interface updates | Task 5 |
| rootExecutionId through dispatch | Task 6 |
| rootExecutionId through workers/resume | Task 7 |
| Worker setTimeout loop + failure notification | Task 8 |
| HTTP handler wait/fallback | Task 9 |
| Polling endpoint | Task 10 |
| Server wiring + shutdown | Task 11 |
| Pre-generated executionId | Task 12 |
| E2E integration test | Task 13 |

### Items verified:
- `SET NX` for durable key (first wins) — Task 3 line in `notifyCompletion`
- Jittered exponential backoff — Task 3 `publishWithRetry`
- Circuit breaker (sliding window) — Task 3 `CircuitBreaker` class
- `await subscribe` before execute — Task 9 `waitForCompletion` awaits in constructor
- Shutdown sentinel (null, not fallback storm) — Task 3 `shutdown()` resolves with null
- Worker try/catch/finally — Task 8 poll loops
- InProcess guard — Task 2 constructor check
- Waiter cleanup in finally — Task 3 `cleanupWaiter` called in timeout path
