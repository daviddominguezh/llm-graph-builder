/**
 * InProcessCompletionNotifier — in-process implementation of CompletionNotifier.
 *
 * Intended for development and test environments only. Resolves waiters via
 * in-memory Maps; the first notification wins (idempotent). shutdown() resolves
 * all active waiters with null.
 */
import type { CompletionNotifier, ExecutionResult } from './completionNotifier.js';
import { logCompletion } from './completionNotifier.js';

/* ─── Types ─── */

type Resolver = (result: ExecutionResult | null) => void;

interface Waiter {
  resolve: Resolver;
  timer: ReturnType<typeof setTimeout>;
}

/* ─── Constants ─── */

const ALLOWED_ENVS = new Set(['development', 'test', '']);

/* ─── Helpers ─── */

function resolveAndClear(
  waiters: Map<string, Waiter>,
  executionId: string,
  value: ExecutionResult | null
): void {
  const waiter = waiters.get(executionId);
  if (waiter === undefined) return;
  clearTimeout(waiter.timer);
  waiters.delete(executionId);
  waiter.resolve(value);
}

async function registerWaiter(
  waiters: Map<string, Waiter>,
  executionId: string,
  timeoutMs: number
): Promise<ExecutionResult | null> {
  const { promise, resolve } = Promise.withResolvers<ExecutionResult | null>();
  const timer = setTimeout(() => {
    waiters.delete(executionId);
    logCompletion('wait:timeout', { executionId });
    resolve(null);
  }, timeoutMs);

  waiters.set(executionId, { resolve, timer });
  logCompletion('wait:registered', { executionId, timeoutMs });

  return await promise;
}

/* ─── Class ─── */

export class InProcessCompletionNotifier implements CompletionNotifier {
  private readonly waiters = new Map<string, Waiter>();
  private readonly results = new Map<string, ExecutionResult>();

  constructor() {
    const { env } = process;
    const nodeEnv = env.NODE_ENV ?? '';
    if (!ALLOWED_ENVS.has(nodeEnv)) {
      throw new Error(`InProcessCompletionNotifier is not allowed in NODE_ENV="${nodeEnv}"`);
    }
  }

  async waitForCompletion(executionId: string, timeoutMs: number): Promise<ExecutionResult | null> {
    const cached = this.results.get(executionId);
    if (cached !== undefined) {
      logCompletion('wait:cached', { executionId });
      return cached;
    }

    return await registerWaiter(this.waiters, executionId, timeoutMs);
  }

  async notifyCompletion(executionId: string, result: ExecutionResult): Promise<void> {
    await Promise.resolve();

    if (this.results.has(executionId)) {
      logCompletion('notify:duplicate', { executionId });
      return;
    }

    this.results.set(executionId, result);
    logCompletion('notify:stored', { executionId, status: result.status });
    resolveAndClear(this.waiters, executionId, result);
  }

  shutdown(): void {
    logCompletion('shutdown', { waiters: this.waiters.size });
    for (const executionId of this.waiters.keys()) {
      resolveAndClear(this.waiters, executionId, null);
    }
  }
}
