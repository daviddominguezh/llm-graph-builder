/**
 * CircuitBreaker — sliding-window circuit breaker for Redis Pub/Sub reliability.
 *
 * Tracks success/failure outcomes over a fixed window of recent attempts.
 * When failures reach the threshold, the circuit opens (rejects new operations).
 * After a cooldown period, the circuit half-closes and allows retry.
 */

/* ─── Types ─── */

export interface CircuitBreakerConfig {
  threshold: number;
  windowSize: number;
  cooldownMs: number;
}

type Outcome = 'success' | 'failure';

/* ─── Class ─── */

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly outcomes: Outcome[] = [];
  private openedAt: number | null = null;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  isOpen(): boolean {
    if (this.openedAt === null) return false;
    const { config, openedAt } = this;
    const { cooldownMs } = config;
    const elapsed = Date.now() - openedAt;
    if (elapsed >= cooldownMs) {
      this.openedAt = null;
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.push('success');
  }

  recordFailure(): void {
    this.push('failure');
    const { config, outcomes } = this;
    const { threshold } = config;
    const { length: failures } = outcomes.filter((o) => o === 'failure');
    if (failures >= threshold) {
      this.openedAt = Date.now();
    }
  }

  private push(outcome: Outcome): void {
    const { config, outcomes } = this;
    const { windowSize } = config;
    outcomes.push(outcome);
    if (outcomes.length > windowSize) {
      outcomes.shift();
    }
  }
}
