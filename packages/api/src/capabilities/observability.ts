export interface Observability {
  event: (name: string, data?: Record<string, unknown>) => void;
}

export interface RateLimiter {
  acquire: (tenantId: string) => Promise<void>;
}

export interface RunnerLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}
