/**
 * Runs `fn` with an `AbortSignal` that auto-aborts after `ms` milliseconds.
 *
 * If the timeout fires first, the signal is aborted and `withAbortTimeout`
 * rejects with `AbortTimeoutError` (regardless of how `fn` surfaces the abort).
 * Otherwise it resolves/rejects with `fn`'s own result, and the timer is always
 * cleared in `finally` so no late abort or leaked timer remains.
 */
export class AbortTimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation aborted after ${String(ms)}ms`);
    this.name = 'AbortTimeoutError';
  }
}

export async function withAbortTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const state = { timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    ctrl.abort();
  }, ms);
  try {
    return await fn(ctrl.signal);
  } catch (err) {
    if (state.timedOut) throw new AbortTimeoutError(ms);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
