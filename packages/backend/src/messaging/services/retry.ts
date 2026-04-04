/**
 * Generic retry utility with exponential backoff and jitter.
 *
 * Pattern adapted from closer-back's replySendersHelpers.ts.
 */
import { setTimeout as sleepMs } from 'node:timers/promises';

/* ─── Constants ─── */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_BACKOFF_MS = 10_000;
const BASE_BACKOFF_MS = 1_000;
const BACKOFF_BASE = 2;
const HTTP_SERVER_ERROR_MIN = 500;
const HTTP_SERVER_ERROR_MAX = 599;
const FIRST_ATTEMPT = 0;
const NEXT_OFFSET = 1;

/* ─── Types ─── */

export type ShouldRetryFn = (error: Error) => boolean;

export interface RetryOptions {
  maxAttempts?: number;
  maxBackoffMs?: number;
  shouldRetry?: ShouldRetryFn;
}

interface ErrorWithStatusCode extends Error {
  statusCode?: number;
}

interface RetryConfig {
  maxAttempts: number;
  maxBackoffMs: number;
  predicate: ShouldRetryFn | undefined;
}

/* ─── Error classification ─── */

function isNetworkError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    (error instanceof TypeError && msg.includes('fetch failed')) ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('socket')
  );
}

function isServerError(error: Error): boolean {
  const { statusCode } = error as ErrorWithStatusCode;
  if (statusCode === undefined) return false;
  return statusCode >= HTTP_SERVER_ERROR_MIN && statusCode <= HTTP_SERVER_ERROR_MAX;
}

export function isRetryableError(error: Error): boolean {
  return isNetworkError(error) || isServerError(error);
}

/* ─── Backoff computation ─── */

function computeBackoff(attempt: number, maxBackoffMs: number): number {
  const exponential = BACKOFF_BASE ** attempt * BASE_BACKOFF_MS;
  const capped = Math.min(exponential, maxBackoffMs);
  const jitter = Math.random() * capped;
  return Math.floor(jitter);
}

/* ─── Single attempt ─── */

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function isLastAttempt(attempt: number, maxAttempts: number): boolean {
  return attempt === maxAttempts - NEXT_OFFSET;
}

function logRetry(attempt: number, maxAttempts: number, backoffMs: number): void {
  const tag = `[retry] attempt ${String(attempt + NEXT_OFFSET)}/${String(maxAttempts)}`;
  process.stdout.write(`${tag} failed, retrying in ${String(backoffMs)}ms\n`);
}

function shouldRetryError(error: Error, predicate: ShouldRetryFn | undefined): boolean {
  if (predicate !== undefined) return predicate(error);
  return isRetryableError(error);
}

async function handleFailure(error: Error, attempt: number, config: RetryConfig): Promise<void> {
  if (isLastAttempt(attempt, config.maxAttempts) || !shouldRetryError(error, config.predicate)) {
    throw error;
  }

  const backoffMs = computeBackoff(attempt, config.maxBackoffMs);
  logRetry(attempt, config.maxAttempts, backoffMs);
  await sleepMs(backoffMs);
}

/* ─── Retry wrapper ─── */

function buildConfig(opts: RetryOptions | undefined): RetryConfig {
  return {
    maxAttempts: opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    maxBackoffMs: opts?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
    predicate: opts?.shouldRetry,
  };
}

export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const config = buildConfig(opts);
  return await executeWithRetry(fn, FIRST_ATTEMPT, config);
}

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  attempt: number,
  config: RetryConfig
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await handleFailure(toError(err), attempt, config);
    return await executeWithRetry(fn, attempt + NEXT_OFFSET, config);
  }
}
