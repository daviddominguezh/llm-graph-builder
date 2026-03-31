// GitHub HTTP client — fetch wrapper with retry, timeout, rate limit parsing, error mapping
// Browser-compatible delay (no node:timers/promises — this module runs in Deno Edge Functions too)
async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

import { VFSError, VFSErrorCode } from '../types.js';
import type {
  GitHubErrorBody,
  GitHubFetchResult,
  GitHubRequestOptions,
  ParsedRateLimit,
} from './githubTypes.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 1_000;
const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60_000;
const SERVER_ERROR_THRESHOLD = 500;
const CLIENT_ERROR_THRESHOLD = 400;
const GITHUB_API_VERSION = '2022-11-28';
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;
const STATUS_UNPROCESSABLE = 422;
const STATUS_TOO_MANY = 429;
const EPOCH_ZERO = 0;

// ─── Header builders ─────────────────────────────────────────────────────────

export function buildHeaders(token: string, acceptRaw: boolean): Record<string, string> {
  const accept = acceptRaw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json';
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

// ─── Rate limit parsing ──────────────────────────────────────────────────────

function parseHeader(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

export function parseRateLimit(headers: Headers): ParsedRateLimit {
  const remaining = parseHeader(headers.get('x-ratelimit-remaining'), Infinity);
  const limit = parseHeader(headers.get('x-ratelimit-limit'), Infinity);
  const resetRaw = headers.get('x-ratelimit-reset');
  const resetEpoch = resetRaw === null ? NaN : Number(resetRaw);
  const resetAt = Number.isNaN(resetEpoch) ? new Date(EPOCH_ZERO) : new Date(resetEpoch * MS_PER_SECOND);
  return { remaining, resetAt, limit };
}

export function formatResetDuration(resetAt: Date): string {
  const diffMs = resetAt.getTime() - Date.now();
  if (diffMs <= EPOCH_ZERO) return 'now';
  const minutes = Math.ceil(diffMs / MS_PER_MINUTE);
  return `${String(minutes)} minute(s)`;
}

// ─── Error mapping ───────────────────────────────────────────────────────────

function map403Error(headers: Headers, body: GitHubErrorBody): VFSError {
  const rateLimitRemaining = headers.get('x-ratelimit-remaining');
  if (rateLimitRemaining === '0') {
    const { resetAt } = parseRateLimit(headers);
    const msg = `GitHub API rate limit exceeded. Resets in ${formatResetDuration(resetAt)}.`;
    return new VFSError(VFSErrorCode.RATE_LIMITED, msg);
  }
  const retryAfter = headers.get('retry-after');
  if (retryAfter !== null) {
    const msg = `GitHub API secondary rate limit. Retry after ${retryAfter} seconds.`;
    return new VFSError(VFSErrorCode.RATE_LIMITED, msg);
  }
  const hasTooLarge = body.errors?.some((e) => e.code === 'too_large') === true;
  if (hasTooLarge) {
    return new VFSError(VFSErrorCode.TOO_LARGE, "File exceeds GitHub's 100 MB blob API limit.");
  }
  return new VFSError(
    VFSErrorCode.PERMISSION_DENIED,
    'GitHub App may be missing required permissions for this operation.'
  );
}

export function mapGitHubError(
  status: number,
  headers: Headers,
  body: GitHubErrorBody,
  commitSha: string
): VFSError {
  if (status === STATUS_UNAUTHORIZED) {
    return new VFSError(
      VFSErrorCode.PERMISSION_DENIED,
      'GitHub access has been revoked. Please reconnect your repository.'
    );
  }
  if (status === STATUS_FORBIDDEN) return map403Error(headers, body);
  if (status === STATUS_NOT_FOUND) {
    return new VFSError(VFSErrorCode.FILE_NOT_FOUND, `File not found in repository at commit ${commitSha}.`);
  }
  if (status === STATUS_UNPROCESSABLE) {
    return new VFSError(
      VFSErrorCode.INVALID_PARAMETER,
      `Invalid or missing commit SHA: ${commitSha}. Ensure the commit exists.`
    );
  }
  if (status === STATUS_TOO_MANY) {
    const retryAfter = headers.get('retry-after') ?? 'unknown';
    return new VFSError(
      VFSErrorCode.RATE_LIMITED,
      `GitHub API rate limit exceeded (secondary). Retry after ${retryAfter} seconds.`
    );
  }
  return new VFSError(VFSErrorCode.PROVIDER_ERROR, `GitHub API error: ${String(status)} ${body.message}`);
}

// ─── JSON parsing ────────────────────────────────────────────────────────────

function isErrorBody(raw: unknown): raw is GitHubErrorBody {
  return typeof raw === 'object' && raw !== null && 'message' in raw;
}

async function readJsonBody(response: Response): Promise<GitHubErrorBody> {
  const raw: unknown = await response.json();
  if (isErrorBody(raw)) return raw;
  return { message: 'Unknown GitHub API error' };
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function readErrorBody(response: Response, commitSha: string, retryable: boolean): Promise<VFSError> {
  const body = await readJsonBody(response);
  const error = mapGitHubError(response.status, response.headers, body, commitSha);
  if (retryable) {
    return new VFSError(error.code, error.message, { ...error.details, retryable: true });
  }
  return error;
}

function normalizeError(err: unknown): VFSError {
  if (err instanceof VFSError) return err;
  const msg = err instanceof Error ? err.message : 'Unknown error';
  if (msg.includes('abort') || msg.includes('timeout') || msg.includes('Timeout')) {
    return new VFSError(VFSErrorCode.PROVIDER_ERROR, `GitHub API request timeout: ${msg}`, {
      retryable: true,
    });
  }
  return new VFSError(VFSErrorCode.PROVIDER_ERROR, `GitHub API network error: ${msg}`, { retryable: true });
}

function shouldRetry(error: VFSError): boolean {
  return error.details?.retryable === true;
}

// ─── Single attempt (JSON) ───────────────────────────────────────────────────

async function singleFetch(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  commitSha: string
): Promise<GitHubFetchResult<unknown>> {
  const response = await globalThis.fetch(url, { headers, signal });
  if (response.status >= SERVER_ERROR_THRESHOLD) {
    throw await readErrorBody(response, commitSha, true);
  }
  if (response.status >= CLIENT_ERROR_THRESHOLD) {
    throw await readErrorBody(response, commitSha, false);
  }
  const rateLimit = parseRateLimit(response.headers);
  const data: unknown = await response.json();
  return { data, rateLimit };
}

// ─── Single attempt (raw binary) ────────────────────────────────────────────

async function singleFetchRaw(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  commitSha: string
): Promise<GitHubFetchResult<Uint8Array>> {
  const response = await globalThis.fetch(url, { headers, signal });
  if (response.status >= SERVER_ERROR_THRESHOLD) {
    throw await readErrorBody(response, commitSha, true);
  }
  if (response.status >= CLIENT_ERROR_THRESHOLD) {
    throw await readErrorBody(response, commitSha, false);
  }
  const rateLimit = parseRateLimit(response.headers);
  const buffer = await response.arrayBuffer();
  return { data: new Uint8Array(buffer), rateLimit };
}

// ─── Retry wrapper ───────────────────────────────────────────────────────────

async function retryOnce<T>(firstAttempt: () => Promise<T>, secondAttempt: () => Promise<T>): Promise<T> {
  try {
    return await firstAttempt();
  } catch (err) {
    const normalized = normalizeError(err);
    if (!shouldRetry(normalized)) throw normalized;
    await delay(RETRY_DELAY_MS);
    return await runSecondAttempt(secondAttempt);
  }
}

async function runSecondAttempt<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    throw normalizeError(err);
  }
}

// ─── Main fetch wrapper ──────────────────────────────────────────────────────

export async function githubFetch<T>(
  options: GitHubRequestOptions,
  validate: (raw: unknown) => T
): Promise<GitHubFetchResult<T>> {
  const { token, url, acceptRaw = false, commitSha, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const headers = buildHeaders(token, acceptRaw);
  const signal = AbortSignal.timeout(timeoutMs);
  const attempt = async (): Promise<GitHubFetchResult<unknown>> =>
    await singleFetch(url, headers, signal, commitSha);
  const result = await retryOnce(attempt, attempt);
  return { data: validate(result.data), rateLimit: result.rateLimit };
}

export async function githubFetchRaw(options: GitHubRequestOptions): Promise<GitHubFetchResult<Uint8Array>> {
  const { token, url, commitSha, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const headers = buildHeaders(token, true);
  const signal = AbortSignal.timeout(timeoutMs);
  const attempt = async (): Promise<GitHubFetchResult<Uint8Array>> =>
    await singleFetchRaw(url, headers, signal, commitSha);
  return await retryOnce(attempt, attempt);
}
