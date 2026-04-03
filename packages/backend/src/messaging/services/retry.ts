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

interface RetryOptions {
  maxAttempts?: number;
  maxBackoffMs?: number;
}

interface ErrorWithStatusCode extends Error {
  statusCode?: number;
}

/* ─── Error classification ─── */

function isNetworkError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    (error instanceof TypeError && msg.includes('fetch failed')) ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
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

async function handleFailure(error: Error, attempt: number, maxAttempts: number, maxBackoffMs: number): Promise<void> {
  if (isLastAttempt(attempt, maxAttempts) || !isRetryableError(error)) {
    throw error;
  }

  const backoffMs = computeBackoff(attempt, maxBackoffMs);
  logRetry(attempt, maxAttempts, backoffMs);
  await sleepMs(backoffMs);
}

/* ─── Retry wrapper ─── */

export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxBackoffMs = opts?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;

  return await executeWithRetry(fn, FIRST_ATTEMPT, maxAttempts, maxBackoffMs);
}

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  attempt: number,
  maxAttempts: number,
  maxBackoffMs: number
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await handleFailure(toError(err), attempt, maxAttempts, maxBackoffMs);
    return await executeWithRetry(fn, attempt + NEXT_OFFSET, maxAttempts, maxBackoffMs);
  }
}
