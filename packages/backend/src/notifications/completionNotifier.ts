/**
 * CompletionNotifier — interface and configuration for execution completion signalling.
 *
 * Provides a contract for waiting on and notifying about the completion of
 * async agent executions, along with config loading from environment variables.
 */

/* ─── Types ─── */

export interface ExecutionResult {
  status: 'completed' | 'error';
  text: string;
  executionId: string;
}

export interface CompletionNotifier {
  waitForCompletion: (executionId: string, timeoutMs: number) => Promise<ExecutionResult | null>;
  notifyCompletion: (executionId: string, result: ExecutionResult) => Promise<void>;
  shutdown: () => void;
}

export interface CompletionConfig {
  timeoutMs: number;
  maxConcurrent: number;
  pollingGraceMs: number;
  resultTtlSeconds: number;
  circuitThreshold: number;
  circuitWindow: number;
  circuitCooldownMs: number;
}

/* ─── Constants ─── */

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_CONCURRENT = 100;
const DEFAULT_POLLING_GRACE_MS = 10_000;
const DEFAULT_RESULT_TTL_SECONDS = 300;
const DEFAULT_CIRCUIT_THRESHOLD = 3;
const DEFAULT_CIRCUIT_WINDOW = 10;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 30_000;

/* ─── Helpers ─── */

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/* ─── Config loader ─── */

export function loadCompletionConfig(): CompletionConfig {
  const { env } = process;
  const {
    COMPLETION_TIMEOUT_MS,
    COMPLETION_MAX_CONCURRENT,
    COMPLETION_POLLING_GRACE_MS,
    COMPLETION_RESULT_TTL_SECONDS,
    COMPLETION_CIRCUIT_THRESHOLD,
    COMPLETION_CIRCUIT_WINDOW,
    COMPLETION_CIRCUIT_COOLDOWN_MS,
  } = env;

  return {
    timeoutMs: parseEnvInt(COMPLETION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxConcurrent: parseEnvInt(COMPLETION_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT),
    pollingGraceMs: parseEnvInt(COMPLETION_POLLING_GRACE_MS, DEFAULT_POLLING_GRACE_MS),
    resultTtlSeconds: parseEnvInt(COMPLETION_RESULT_TTL_SECONDS, DEFAULT_RESULT_TTL_SECONDS),
    circuitThreshold: parseEnvInt(COMPLETION_CIRCUIT_THRESHOLD, DEFAULT_CIRCUIT_THRESHOLD),
    circuitWindow: parseEnvInt(COMPLETION_CIRCUIT_WINDOW, DEFAULT_CIRCUIT_WINDOW),
    circuitCooldownMs: parseEnvInt(COMPLETION_CIRCUIT_COOLDOWN_MS, DEFAULT_CIRCUIT_COOLDOWN_MS),
  };
}

/* ─── Logging ─── */

export function logCompletion(event: string, data?: Record<string, unknown>): void {
  const payload = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  process.stdout.write(`[completion] ${event}${payload}\n`);
}
