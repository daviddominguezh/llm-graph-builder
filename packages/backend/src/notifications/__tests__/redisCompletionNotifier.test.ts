/**
 * Integration tests for RedisCompletionNotifier.
 *
 * These tests require a live Redis connection via REDIS_URL.
 * They are skipped automatically when REDIS_URL is not set.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';

import type { ExecutionResult } from '../completionNotifier.js';
import { RedisCompletionNotifier } from '../redisCompletionNotifier.js';

/* ─── Constants ─── */

const DELAY_NOTIFY_MS = 200;
const TIMEOUT_GENEROUS_MS = 3_000;
const TIMEOUT_MISS_MS = 500;
const TIMEOUT_NULL_TEST_MS = 15_000;
const UNIQUE_SUFFIX = Date.now();

/* ─── Helpers ─── */

function makeResult(executionId: string, status: ExecutionResult['status'] = 'completed'): ExecutionResult {
  return { status, text: `result-${executionId}`, executionId };
}

function makeExecId(label: string): string {
  return `test-${UNIQUE_SUFFIX}-${label}`;
}

/* ─── Test bodies ─── */

async function testPubSubResolution(notifier: RedisCompletionNotifier): Promise<void> {
  const execId = makeExecId('pubsub');
  const result = makeResult(execId);
  const waitPromise = notifier.waitForCompletion(execId, TIMEOUT_GENEROUS_MS);
  await setTimeoutPromise(DELAY_NOTIFY_MS);
  await notifier.notifyCompletion(execId, result);
  await expect(waitPromise).resolves.toEqual(result);
}

async function testDurableFallback(notifier: RedisCompletionNotifier): Promise<void> {
  const execId = makeExecId('fallback');
  const result = makeResult(execId);
  // Notify BEFORE waiting — Pub/Sub will miss the message
  await notifier.notifyCompletion(execId, result);
  await setTimeoutPromise(DELAY_NOTIFY_MS);
  const resolved = await notifier.waitForCompletion(execId, TIMEOUT_GENEROUS_MS);
  expect(resolved).toEqual(result);
}

async function testNullOnTimeout(notifier: RedisCompletionNotifier): Promise<void> {
  const execId = makeExecId('timeout');
  const resolved = await notifier.waitForCompletion(execId, TIMEOUT_MISS_MS);
  expect(resolved).toBeNull();
}

async function testFirstNotificationWins(notifier: RedisCompletionNotifier): Promise<void> {
  const execId = makeExecId('nx');
  const first = makeResult(execId, 'completed');
  const second = makeResult(execId, 'error');
  const waitPromise = notifier.waitForCompletion(execId, TIMEOUT_GENEROUS_MS);
  await notifier.notifyCompletion(execId, first);
  await notifier.notifyCompletion(execId, second);
  await expect(waitPromise).resolves.toEqual(first);
}

/* ─── Suite ─── */

const { env } = process;
const { REDIS_URL } = env;
const describeOrSkip = REDIS_URL !== undefined && REDIS_URL !== '' ? describe : describe.skip;

describeOrSkip('RedisCompletionNotifier (integration)', () => {
  let notifier: RedisCompletionNotifier | null = null;

  beforeEach(() => {
    notifier = new RedisCompletionNotifier();
  });

  afterEach(() => {
    notifier?.shutdown();
    notifier = null;
  });

  function mustNotifier(): RedisCompletionNotifier {
    if (notifier === null) throw new Error('notifier not initialized');
    return notifier;
  }

  it('resolves waitForCompletion when notifyCompletion is called', async () => {
    await testPubSubResolution(mustNotifier());
  });

  it('falls back to durable key when Pub/Sub misses', async () => {
    await testDurableFallback(mustNotifier());
  });

  it(
    'returns null on full timeout',
    async () => {
      await testNullOnTimeout(mustNotifier());
    },
    TIMEOUT_NULL_TEST_MS
  );

  it('first notification wins (NX)', async () => {
    await testFirstNotificationWins(mustNotifier());
  });
});
