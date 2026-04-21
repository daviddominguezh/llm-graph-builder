/**
 * RedisCompletionNotifier — production CompletionNotifier backed by Redis Cloud.
 *
 * Uses Pub/Sub for low-latency delivery and a durable NX key as fallback when
 * the subscriber misses the publish (race or reconnect). A circuit breaker
 * degrades to polling when Pub/Sub is repeatedly failing.
 */
import { Redis } from 'ioredis';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';

import { getRedisCloud } from '../messaging/services/redisCloud.js';
import { CircuitBreaker } from './circuitBreaker.js';
import type { CompletionConfig, CompletionNotifier, ExecutionResult } from './completionNotifier.js';
import { loadCompletionConfig, logCompletion } from './completionNotifier.js';

/* ─── Constants ─── */

const CHANNEL_PREFIX = 'completion:';
const KEY_PREFIX = 'completion_result:';
const RETRY_COUNT = 3;
const FIRST_ATTEMPT = 0;
const RETRY_INDEX_OFFSET = 1;
const LAST_RETRY_INDEX = RETRY_COUNT - RETRY_INDEX_OFFSET;
const RETRY_BASE_MS = 100;
const RETRY_EXPONENT_BASE = 2;
const POLLING_INTERVAL_MS = 2_000;
const MAX_JITTER_MS = 50;

/* ─── Types ─── */

type Resolver = (result: ExecutionResult | null) => void;

interface Waiter {
  resolve: Resolver;
  timer: ReturnType<typeof setTimeout>;
}

/* ─── Key helpers ─── */

function channelFor(execId: string): string {
  return `${CHANNEL_PREFIX}${execId}`;
}

function keyFor(execId: string): string {
  return `${KEY_PREFIX}${execId}`;
}

/* ─── Env helper ─── */

function getRedisUrl(): string {
  const { env } = process;
  const { REDIS_URL } = env;
  if (REDIS_URL === undefined || REDIS_URL === '') {
    throw new Error('Missing required env var: REDIS_URL');
  }
  return REDIS_URL;
}

/* ─── Type guard ─── */

interface RawResult {
  status: string;
  text: string;
  executionId: string;
}

function hasResultShape(value: unknown): value is RawResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<RawResult>;
  return typeof v.status === 'string' && typeof v.text === 'string' && typeof v.executionId === 'string';
}

function isExecutionResult(value: unknown): value is ExecutionResult {
  if (!hasResultShape(value)) return false;
  return value.status === 'completed' || value.status === 'error';
}

function parseResult(raw: string): ExecutionResult | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isExecutionResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/* ─── Redis helpers ─── */

async function readDurableKey(pub: Redis, execId: string): Promise<ExecutionResult | null> {
  try {
    const raw = await pub.get(keyFor(execId));
    return raw === null ? null : parseResult(raw);
  } catch {
    return null;
  }
}

/* ─── Backoff helpers ─── */

function jitter(): number {
  return Math.floor(Math.random() * MAX_JITTER_MS);
}

function backoffMs(attempt: number): number {
  return RETRY_BASE_MS * RETRY_EXPONENT_BASE ** attempt + jitter();
}

/* ─── Polling fallback ─── */

async function pollStep(pub: Redis, execId: string, deadline: number): Promise<ExecutionResult | null> {
  if (Date.now() >= deadline) return null;
  await setTimeoutPromise(POLLING_INTERVAL_MS);
  const result = await readDurableKey(pub, execId);
  if (result !== null) return result;
  return await pollStep(pub, execId, deadline);
}

async function pollForResult(pub: Redis, execId: string, graceMs: number): Promise<ExecutionResult | null> {
  return await pollStep(pub, execId, Date.now() + graceMs);
}

/* ─── Waiter lifecycle ─── */

function resolveWaiter(waiters: Map<string, Waiter>, execId: string, value: ExecutionResult | null): void {
  const waiter = waiters.get(execId);
  if (waiter === undefined) return;
  clearTimeout(waiter.timer);
  waiters.delete(execId);
  waiter.resolve(value);
}

/* ─── Publish with retry ─── */

async function tryPublish(pub: Redis, channel: string, payload: string, attempt: number): Promise<void> {
  try {
    await pub.publish(channel, payload);
  } catch (err) {
    logCompletion('notify:publish-error', { attempt, err: String(err) });
    if (attempt < LAST_RETRY_INDEX) {
      await setTimeoutPromise(backoffMs(attempt));
      await tryPublish(pub, channel, payload, attempt + RETRY_INDEX_OFFSET);
    }
  }
}

async function publishWithRetry(pub: Redis, channel: string, payload: string): Promise<void> {
  await tryPublish(pub, channel, payload, FIRST_ATTEMPT);
}

/* ─── Class ─── */

export class RedisCompletionNotifier implements CompletionNotifier {
  private readonly config: CompletionConfig;
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly waiters = new Map<string, Waiter>();
  private readonly circuit: CircuitBreaker;

  constructor(config?: CompletionConfig) {
    this.config = config ?? loadCompletionConfig();
    this.pub = getRedisCloud();
    this.sub = new Redis(getRedisUrl());
    this.circuit = new CircuitBreaker({
      threshold: this.config.circuitThreshold,
      windowSize: this.config.circuitWindow,
      cooldownMs: this.config.circuitCooldownMs,
    });
    this.sub.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });
  }

  async waitForCompletion(execId: string, timeoutMs: number): Promise<ExecutionResult | null> {
    if (this.circuit.isOpen()) {
      logCompletion('wait:circuit-open', { execId });
      return await this.durableFallback(execId);
    }
    try {
      await this.sub.subscribe(channelFor(execId));
      this.circuit.recordSuccess();
    } catch (err) {
      this.circuit.recordFailure();
      logCompletion('wait:subscribe-error', { execId, err: String(err) });
      return await this.durableFallback(execId);
    }
    return await this.awaitWithTimeout(execId, timeoutMs);
  }

  async notifyCompletion(execId: string, result: ExecutionResult): Promise<void> {
    const payload = JSON.stringify(result);
    const stored = await this.pub.set(keyFor(execId), payload, 'EX', this.config.resultTtlSeconds, 'NX');
    if (stored !== 'OK') {
      logCompletion('notify:duplicate', { execId });
      return;
    }
    await publishWithRetry(this.pub, channelFor(execId), payload);
    logCompletion('notify:sent', { execId, status: result.status });
  }

  shutdown(): void {
    logCompletion('shutdown', { waiters: this.waiters.size });
    for (const execId of this.waiters.keys()) {
      resolveWaiter(this.waiters, execId, null);
    }
    try {
      this.sub.disconnect();
    } catch {
      // Ignore disconnect errors during shutdown
    }
  }

  private handleMessage(channel: string, message: string): void {
    const execId = channel.slice(CHANNEL_PREFIX.length);
    const waiter = this.waiters.get(execId);
    if (waiter === undefined) return;
    const result = parseResult(message);
    if (result === null) {
      logCompletion('wait:parse-error', { execId });
      resolveWaiter(this.waiters, execId, null);
    } else {
      logCompletion('wait:resolved', { execId });
      resolveWaiter(this.waiters, execId, result);
    }
    this.sub.unsubscribe(channel).catch(() => undefined);
  }

  private async awaitWithTimeout(execId: string, timeoutMs: number): Promise<ExecutionResult | null> {
    const { promise, resolve } = Promise.withResolvers<ExecutionResult | null>();
    const { waiters } = this;

    const timer = setTimeout(() => {
      waiters.delete(execId);
      void this.onTimeout(execId, resolve);
    }, timeoutMs);

    waiters.set(execId, { resolve, timer });

    const immediate = await readDurableKey(this.pub, execId);
    if (immediate !== null) resolveWaiter(waiters, execId, immediate);

    const result = await promise;
    this.sub.unsubscribe(channelFor(execId)).catch(() => undefined);
    return result;
  }

  private async onTimeout(execId: string, resolve: Resolver): Promise<void> {
    logCompletion('wait:timeout', { execId });
    const tier2 = await readDurableKey(this.pub, execId);
    if (tier2 !== null) {
      resolve(tier2);
      return;
    }
    const tier3 = await pollForResult(this.pub, execId, this.config.pollingGraceMs);
    resolve(tier3);
  }

  private async durableFallback(execId: string): Promise<ExecutionResult | null> {
    const immediate = await readDurableKey(this.pub, execId);
    if (immediate === null) return await pollForResult(this.pub, execId, this.config.pollingGraceMs);
    return immediate;
  }
}
