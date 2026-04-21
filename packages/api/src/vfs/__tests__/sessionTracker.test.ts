import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { VFSError, VFSErrorCode } from '../types.js';
import type { TrackerTestContext } from './sessionTrackerMocks.js';
import {
  AGENT_SLUG,
  COMMIT_SHA,
  EXPECTED_ONE_CALL,
  JUST_BEFORE_THROTTLE,
  SESSION_ID,
  SESSION_KEY,
  TENANT_SLUG,
  THROTTLE_MS,
  USER_ID,
  createErrorQb,
  createSuccessQb,
  createTrackerContext,
  defaultParams,
} from './sessionTrackerMocks.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function assertProviderError(err: unknown): void {
  expect(err).toBeInstanceOf(VFSError);
  if (err instanceof VFSError) {
    expect(err.code).toBe(VFSErrorCode.PROVIDER_ERROR);
  }
}

// ─── Initialize ─────────────────────────────────────────────────────────────

function describeInitialize(): void {
  let ctx: TrackerTestContext = createTrackerContext(createSuccessQb());
  beforeEach(() => {
    ctx = createTrackerContext(createSuccessQb());
  });

  it('calls upsert with correct session data', async () => {
    await ctx.tracker.initialize(defaultParams());
    expect(ctx.qb.upsert).toHaveBeenCalledWith(
      {
        session_key: SESSION_KEY,
        tenant_slug: TENANT_SLUG,
        agent_slug: AGENT_SLUG,
        user_id: USER_ID,
        session_id: SESSION_ID,
        commit_sha: COMMIT_SHA,
      },
      { onConflict: 'session_key' }
    );
    expect(ctx.qb.select).toHaveBeenCalled();
    expect(ctx.qb.single).toHaveBeenCalled();
  });
}

function describeInitializeError(): void {
  it('throws VFSError when upsert fails', async () => {
    const ctx = createTrackerContext(createErrorQb());
    try {
      await ctx.tracker.initialize(defaultParams());
      expect(true).toBe(false);
    } catch (err) {
      assertProviderError(err);
    }
  });
}

// ─── Touch — Throttled ──────────────────────────────────────────────────────

function describeTouchThrottled(): void {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips DB call when called within throttle window', async () => {
    const ctx = createTrackerContext(createSuccessQb());
    await ctx.tracker.initialize(defaultParams());
    ctx.qb.update.mockClear();
    jest.advanceTimersByTime(JUST_BEFORE_THROTTLE);
    await ctx.tracker.touch();
    expect(ctx.qb.update).not.toHaveBeenCalled();
  });
}

// ─── Touch — After Window ───────────────────────────────────────────────────

function describeTouchAfterWindow(): void {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates last_accessed_at after throttle window', async () => {
    const ctx = createTrackerContext(createSuccessQb());
    await ctx.tracker.initialize(defaultParams());
    ctx.qb.update.mockClear();
    jest.advanceTimersByTime(THROTTLE_MS);
    await ctx.tracker.touch();
    expect(ctx.qb.update).toHaveBeenCalledTimes(EXPECTED_ONE_CALL);
  });

  it('allows another touch after a second throttle window', async () => {
    const ctx = createTrackerContext(createSuccessQb());
    await ctx.tracker.initialize(defaultParams());
    ctx.qb.update.mockClear();
    jest.advanceTimersByTime(THROTTLE_MS);
    await ctx.tracker.touch();
    ctx.qb.update.mockClear();
    jest.advanceTimersByTime(THROTTLE_MS);
    await ctx.tracker.touch();
    expect(ctx.qb.update).toHaveBeenCalledTimes(EXPECTED_ONE_CALL);
  });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SessionTracker', () => {
  describe('initialize', describeInitialize);
  describe('initialize error', describeInitializeError);
  describe('touch throttled', describeTouchThrottled);
  describe('touch after window', describeTouchAfterWindow);
});
