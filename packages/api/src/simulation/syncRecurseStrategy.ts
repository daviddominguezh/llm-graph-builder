import type { DispatchArgs, DispatchOutcome, DispatchStrategy } from '../capabilities/dispatchStrategy.js';

const ONE_LEVEL = 1;

/**
 * Simulation dispatch strategy: runs the child agent INLINE (awaited via
 * `runChild`) and returns a `completed` outcome carrying the child's result.
 *
 * Enforces the depth guard: if dispatching the child would exceed
 * `maxDispatchDepth` (`dispatchDepth + 1 > maxDispatchDepth`), it short-circuits
 * with a `max_depth_exceeded` child error and never invokes `runChild`.
 */
export const syncRecurseStrategy: DispatchStrategy = {
  dispatch: async (args: DispatchArgs): Promise<DispatchOutcome> => {
    if (args.dispatchDepth + ONE_LEVEL > args.maxDispatchDepth) {
      return {
        kind: 'completed',
        childResult: {
          status: 'error',
          code: 'max_depth_exceeded',
          message: 'Max dispatch depth exceeded.',
        },
      };
    }

    const childResult = await args.runChild();
    return { kind: 'completed', childResult };
  },
};
