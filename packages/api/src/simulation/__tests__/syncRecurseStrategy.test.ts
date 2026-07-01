import { describe, expect, it, jest } from '@jest/globals';

import type { ChildResult } from '../../runtime/childResult.js';
import { syncRecurseStrategy } from '../syncRecurseStrategy.js';

const MAX_DEPTH = 3;
const ROOT_DEPTH = 0;
const LAST_ALLOWED_DEPTH = 2;
const AT_LIMIT_DEPTH = 3;
const ONCE = 1;

const childMock = (result: ChildResult): jest.Mock<() => Promise<ChildResult>> =>
  jest.fn<() => Promise<ChildResult>>(async () => {
    await Promise.resolve();
    return result;
  });

describe('syncRecurseStrategy', () => {
  it('runs the child inline and returns completed carrying the child result', async () => {
    const childResult: ChildResult = { status: 'finished', result: 'x', outcome: 'success' };
    const runChild = childMock(childResult);

    const out = await syncRecurseStrategy.dispatch({ dispatchDepth: ROOT_DEPTH, maxDispatchDepth: MAX_DEPTH, runChild });

    expect(out).toEqual({ kind: 'completed', childResult });
    expect(runChild).toHaveBeenCalledTimes(ONCE);
  });

  it('runs the child at the last allowed depth (dispatchDepth + 1 === maxDispatchDepth)', async () => {
    const childResult: ChildResult = { status: 'awaiting_input', partial: 'wait' };
    const runChild = childMock(childResult);

    const out = await syncRecurseStrategy.dispatch({
      dispatchDepth: LAST_ALLOWED_DEPTH,
      maxDispatchDepth: MAX_DEPTH,
      runChild,
    });

    expect(out).toEqual({ kind: 'completed', childResult });
    expect(runChild).toHaveBeenCalledTimes(ONCE);
  });

  it('short-circuits over max depth without running the child', async () => {
    const runChild = childMock({ status: 'finished', result: 'x', outcome: 'success' });

    const out = await syncRecurseStrategy.dispatch({
      dispatchDepth: AT_LIMIT_DEPTH,
      maxDispatchDepth: MAX_DEPTH,
      runChild,
    });

    expect(out.kind).toBe('completed');
    if (out.kind === 'completed') {
      expect(out.childResult.status).toBe('error');
      if (out.childResult.status === 'error') {
        expect(out.childResult.code).toBe('max_depth_exceeded');
        expect(out.childResult.message).not.toBe('');
      }
    }
    expect(runChild).not.toHaveBeenCalled();
  });
});
