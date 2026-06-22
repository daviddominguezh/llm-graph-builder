import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AbortTimeoutError, withAbortTimeout } from '../withAbortTimeout.js';

const TIMEOUT_MS = 1000;
const PAST_DEADLINE_MS = 5000;
const NO_TIMERS = 0;

type Fn<T> = (signal: AbortSignal) => Promise<T>;

/** Records the most recent signal handed to a `withAbortTimeout` operation. */
class SignalRecorder {
  public last: AbortSignal | null = null;

  public noop(): Fn<void> {
    return async (signal): Promise<void> => {
      this.last = signal;
      await Promise.resolve();
    };
  }

  /** Never settles on its own; rejects only when its signal aborts. */
  public neverSettling(): Fn<never> {
    return async (signal): Promise<never> => {
      this.last = signal;
      const { promise, reject } = Promise.withResolvers<never>();
      signal.addEventListener('abort', (): void => {
        reject(new Error('aborted'));
      });
      return await promise;
    };
  }
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('withAbortTimeout — success path', () => {
  it('resolves with the value when fn finishes in time', async () => {
    const value: Fn<string> = async (): Promise<string> => {
      await Promise.resolve();
      return 'ok';
    };
    await expect(withAbortTimeout(TIMEOUT_MS, value)).resolves.toBe('ok');
  });

  it('passes an un-aborted signal to fn before the timeout', async () => {
    const recorder = new SignalRecorder();
    await withAbortTimeout(TIMEOUT_MS, recorder.noop());
    expect(recorder.last?.aborted).toBe(false);
  });

  it('clears the timer on success so no late abort fires', async () => {
    const recorder = new SignalRecorder();
    await withAbortTimeout(TIMEOUT_MS, recorder.noop());
    await jest.advanceTimersByTimeAsync(PAST_DEADLINE_MS);
    expect(recorder.last?.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(NO_TIMERS);
  });
});

describe('withAbortTimeout — timeout path', () => {
  it('rejects with AbortTimeoutError and aborts the signal when fn never resolves', async () => {
    const recorder = new SignalRecorder();
    const pending = withAbortTimeout(TIMEOUT_MS, recorder.neverSettling());
    const assertion = expect(pending).rejects.toBeInstanceOf(AbortTimeoutError);
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS);
    await assertion;
    expect(recorder.last?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(NO_TIMERS);
  });
});

describe('withAbortTimeout — failure path', () => {
  it('rethrows the original error when fn rejects before the timeout', async () => {
    const failure = new Error('boom');
    const failing: Fn<never> = async (): Promise<never> => {
      await Promise.resolve();
      throw failure;
    };
    await expect(withAbortTimeout(TIMEOUT_MS, failing)).rejects.toBe(failure);
    expect(jest.getTimerCount()).toBe(NO_TIMERS);
  });
});
