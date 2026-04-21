const INITIAL_COUNT = 1;

interface Bucket {
  count: number;
  windowStart: number;
}

export interface RateLimiter {
  consume: (key: string) => boolean;
}

export function createRateLimiter(opts: { max: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    consume(key: string): boolean {
      const now = Date.now();
      const bucket = buckets.get(key);

      if (bucket === undefined || now - bucket.windowStart >= opts.windowMs) {
        buckets.set(key, { count: INITIAL_COUNT, windowStart: now });
        return true;
      }

      if (bucket.count >= opts.max) return false;

      bucket.count += INITIAL_COUNT;
      return true;
    },
  };
}
