import { describe, expect, it } from '@jest/globals';

import type { ChildResult } from '../../runtime/childResult.js';
import type { DispatchOutcome, DispatchStrategy } from '../dispatchStrategy.js';

const START_DEPTH = 0;
const MAX_DEPTH = 10;

describe('DispatchStrategy contract', () => {
  it('a stub strategy returns a completed outcome', async () => {
    const strat: DispatchStrategy = {
      dispatch: async (args) => {
        const childResult = await args.runChild();
        const out: DispatchOutcome = { kind: 'completed', childResult };
        return out;
      },
    };
    const finished: ChildResult = { status: 'finished', result: 'x', outcome: 'success' };
    const outcome = await strat.dispatch({
      dispatchDepth: START_DEPTH,
      maxDispatchDepth: MAX_DEPTH,
      runChild: async () => {
        await Promise.resolve();
        return finished;
      },
    });
    expect(outcome.kind).toBe('completed');
  });
});
