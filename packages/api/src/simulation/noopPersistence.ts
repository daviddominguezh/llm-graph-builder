import type { DispatchHandle, DispatchPersistence } from '../capabilities/dispatchPersistence.js';

/**
 * Simulation implementation of {@link DispatchPersistence}. Records nothing and
 * never restores pending work — dispatch bookkeeping is a no-op in sim runs.
 */
export const noopPersistence: DispatchPersistence = {
  beforeDispatch: async (): Promise<DispatchHandle> =>
    await Promise.resolve({ executionId: 'sim', childExecutionId: 'sim-child' }),
  onChildFinish: async (): Promise<void> => {
    await Promise.resolve();
  },
  onChildError: async (): Promise<void> => {
    await Promise.resolve();
  },
  listPending: async (): Promise<DispatchHandle[]> => await Promise.resolve([]),
};
