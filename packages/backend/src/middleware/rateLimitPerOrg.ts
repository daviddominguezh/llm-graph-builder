import type { NextFunction, Request, Response } from 'express';

const HTTP_TOO_MANY = 429;
const INITIAL_COUNT = 1;
const INCREMENT = 1;

export type OrgIdResolver = (req: Request) => Promise<string | null>;

export interface PerOrgRateLimitOptions {
  limit: number;
  windowMs: number;
  resolveOrgId: OrgIdResolver;
}

interface Bucket {
  count: number;
  windowStartedAt: number;
}

interface BucketCheckArgs {
  buckets: Map<string, Bucket>;
  orgId: string;
  windowMs: number;
  limit: number;
  now: number;
}

type BucketDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

function takeFromBucket(args: BucketCheckArgs): BucketDecision {
  const { buckets, orgId, windowMs, limit, now } = args;
  const existing = buckets.get(orgId);
  if (existing === undefined || now - existing.windowStartedAt > windowMs) {
    buckets.set(orgId, { count: INITIAL_COUNT, windowStartedAt: now });
    return { allowed: true };
  }
  if (existing.count >= limit) {
    return { allowed: false, retryAfterMs: windowMs - (now - existing.windowStartedAt) };
  }
  existing.count += INCREMENT;
  return { allowed: true };
}

/**
 * In-memory per-org token bucket. Single-process only — once Redis caching lands
 * (sub-project E), swap for a Redis-backed implementation. Until then, per-replica
 * limit; cluster fan-out is roughly limit × replica_count.
 */
export function createPerOrgRateLimiter(opts: PerOrgRateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const orgId = await opts.resolveOrgId(req);
    if (orgId === null) {
      next();
      return;
    }
    const decision = takeFromBucket({
      buckets,
      orgId,
      windowMs: opts.windowMs,
      limit: opts.limit,
      now: Date.now(),
    });
    if (!decision.allowed) {
      res.status(HTTP_TOO_MANY).json({ error: 'rate limited', retryAfterMs: decision.retryAfterMs });
      return;
    }
    next();
  };
}
