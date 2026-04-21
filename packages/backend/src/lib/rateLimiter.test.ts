import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createRateLimiter } from './rateLimiter.js';

const MAX_THREE = 3;
const MAX_TWO = 2;
const MAX_ONE = 1;
const WINDOW_60S = 60_000;
const WINDOW_1S = 1000;
const ADVANCE_PAST_WINDOW = 1001;

describe('rateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it('allows up to N within the window', () => {
    const rl = createRateLimiter({ max: MAX_THREE, windowMs: WINDOW_60S });
    expect(rl.consume('k')).toBe(true);
    expect(rl.consume('k')).toBe(true);
    expect(rl.consume('k')).toBe(true);
    expect(rl.consume('k')).toBe(false);
  });

  it('resets after the window', () => {
    const rl = createRateLimiter({ max: MAX_TWO, windowMs: WINDOW_1S });
    rl.consume('k');
    rl.consume('k');
    expect(rl.consume('k')).toBe(false);
    jest.advanceTimersByTime(ADVANCE_PAST_WINDOW);
    expect(rl.consume('k')).toBe(true);
  });

  it('tracks keys independently', () => {
    const rl = createRateLimiter({ max: MAX_ONE, windowMs: WINDOW_1S });
    expect(rl.consume('a')).toBe(true);
    expect(rl.consume('b')).toBe(true);
    expect(rl.consume('a')).toBe(false);
  });
});
