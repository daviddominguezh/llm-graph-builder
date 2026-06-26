import type { OAuthTokenBundle } from '@daviddh/llm-graph-runner';
import { setTimeout as sleepMs } from 'node:timers/promises';

import type { RedisLikeClient } from './redis.js';

const LOCK_TTL_SECONDS = 10;
const DEFAULT_RETRY_DELAY_MS = 200;
const DEFAULT_RETRY_LIMIT = 30;
const FIRST_ATTEMPT = 0;
const NEXT_ATTEMPT_OFFSET = 1;

export interface RefreshSingleFlightArgs {
  redis: RedisLikeClient;
  lockKey: string;
  reread: () => Promise<OAuthTokenBundle | null>;
  doRefresh: () => Promise<OAuthTokenBundle>;
  retryDelayMs?: number;
  retryLimit?: number;
}

async function runUnderLock(args: RefreshSingleFlightArgs): Promise<OAuthTokenBundle> {
  try {
    const fresh = await args.reread();
    if (fresh !== null) return fresh;
    return await args.doRefresh();
  } finally {
    await args.redis.del(args.lockKey);
  }
}

async function attemptReread(
  reread: () => Promise<OAuthTokenBundle | null>,
  delayMs: number,
  limit: number,
  attempt: number
): Promise<OAuthTokenBundle> {
  await sleepMs(delayMs);
  const fresh = await reread();
  if (fresh !== null) return fresh;
  if (attempt >= limit - NEXT_ATTEMPT_OFFSET) {
    throw new Error(`OAuth refresh single-flight timeout after ${String(limit)} retries`);
  }
  return await attemptReread(reread, delayMs, limit, attempt + NEXT_ATTEMPT_OFFSET);
}

export async function refreshWithSingleFlight(args: RefreshSingleFlightArgs): Promise<OAuthTokenBundle> {
  const acquired = await args.redis.set(args.lockKey, '1', { nx: true, ex: LOCK_TTL_SECONDS });
  if (acquired !== null) {
    return await runUnderLock(args);
  }
  const limit = args.retryLimit ?? DEFAULT_RETRY_LIMIT;
  const delay = args.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  return await attemptReread(args.reread, delay, limit, FIRST_ATTEMPT);
}
