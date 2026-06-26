export interface RateLimitDecision {
  ok: boolean;
  scope?: 'tenant' | 'org';
  retryAfterMs?: number;
}

export interface HttpRequestService {
  resolveSecret: (name: string) => Promise<string | null>;
  checkRateLimit: () => Promise<RateLimitDecision>;
}
