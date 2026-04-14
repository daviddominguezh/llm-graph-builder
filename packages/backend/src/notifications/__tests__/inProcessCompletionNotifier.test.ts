import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { InProcessCompletionNotifier } from '../inProcessCompletionNotifier.js';
import type { ExecutionResult } from '../completionNotifier.js';

/* ─── Constants ─── */

const TIMEOUT_SHORT_MS = 100;
const TIMEOUT_GENEROUS_MS = 2_000;

/* ─── Helpers ─── */

function makeResult(executionId: string, status: ExecutionResult['status'] = 'completed'): ExecutionResult {
  return { status, text: `result-${executionId}`, executionId };
}

/* ─── Suite ─── */

describe('InProcessCompletionNotifier', () => {
  let notifier: InProcessCompletionNotifier = new InProcessCompletionNotifier();

  beforeEach(() => {
    notifier = new InProcessCompletionNotifier();
  });

  afterEach(() => {
    notifier.shutdown();
  });

  it('resolves waitForCompletion when notifyCompletion is called', async () => {
    const result = makeResult('exec-1');

    const waitPromise = notifier.waitForCompletion('exec-1', TIMEOUT_GENEROUS_MS);
    await notifier.notifyCompletion('exec-1', result);

    await expect(waitPromise).resolves.toEqual(result);
  });

  it('returns null on timeout', async () => {
    const resolved = await notifier.waitForCompletion('exec-timeout', TIMEOUT_SHORT_MS);

    expect(resolved).toBeNull();
  });

  it('first notification wins (idempotent)', async () => {
    const first = makeResult('exec-idem', 'completed');
    const second = makeResult('exec-idem', 'error');

    const waitPromise = notifier.waitForCompletion('exec-idem', TIMEOUT_GENEROUS_MS);
    await notifier.notifyCompletion('exec-idem', first);
    await notifier.notifyCompletion('exec-idem', second);

    await expect(waitPromise).resolves.toEqual(first);
  });

  it('shutdown resolves all active waiters with null', async () => {
    const wait1 = notifier.waitForCompletion('exec-a', TIMEOUT_GENEROUS_MS);
    const wait2 = notifier.waitForCompletion('exec-b', TIMEOUT_GENEROUS_MS);

    notifier.shutdown();

    await expect(wait1).resolves.toBeNull();
    await expect(wait2).resolves.toBeNull();
  });
});
