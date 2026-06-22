import { AbortTimeoutError, McpError, SessionExpiredError } from '@daviddh/llm-graph-runner';

import { EgressBlockedError, EgressDnsError } from './egressGuard.js';

/**
 * Closed taxonomy of failure reasons we surface to the client for MCP
 * discovery. The category is ALL we ever return — never the raw message,
 * URL, headers, or upstream body, which can carry secrets / probe targets.
 */
export type DiscoveryErrorCategory =
  | 'blocked'
  | 'dns'
  | 'timeout'
  | 'tls'
  | 'auth'
  | 'client_error'
  | 'server_error'
  | 'protocol'
  | 'unknown';

const HTTP_CLIENT_MIN = 400;
const HTTP_SERVER_MIN = 500;
const HTTP_SERVER_MAX = 600;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const TIMEOUT_CODES = new Set(['ABORT_ERR']);
const TLS_CODE_PATTERN = /^ERR_TLS|CERT|DEPTH_ZERO_SELF_SIGNED/v;

/** Read a string `.code` off an unknown error without unsafe casts. */
function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { code } = err as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
}

/** Read a numeric HTTP status off an unknown error (`status` or `statusCode`). */
function httpStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  if (typeof status === 'number') return status;
  if (typeof statusCode === 'number') return statusCode;
  return undefined;
}

/** Read an error `.name` off an unknown error. */
function errorName(err: unknown): string | undefined {
  return err instanceof Error ? err.name : undefined;
}

/** Classify an HTTP status code into auth / client_error / server_error. */
function httpStatusCategory(status: number): DiscoveryErrorCategory {
  if (status === STATUS_UNAUTHORIZED || status === STATUS_FORBIDDEN) return 'auth';
  if (status >= HTTP_SERVER_MIN && status < HTTP_SERVER_MAX) return 'server_error';
  if (status >= HTTP_CLIENT_MIN && status < HTTP_SERVER_MIN) return 'client_error';
  return 'unknown';
}

function isTimeout(err: unknown): boolean {
  return err instanceof AbortTimeoutError || errorName(err) === 'AbortError' || hasCode(err, TIMEOUT_CODES);
}

function isDns(err: unknown): boolean {
  return err instanceof EgressDnsError || hasCode(err, DNS_CODES);
}

function isTls(err: unknown): boolean {
  const code = errorCode(err);
  return code !== undefined && TLS_CODE_PATTERN.test(code);
}

function isProtocol(err: unknown): boolean {
  return err instanceof McpError || errorName(err) === 'TransportError';
}

function hasCode(err: unknown, codes: ReadonlySet<string>): boolean {
  const code = errorCode(err);
  return code !== undefined && codes.has(code);
}

/**
 * Map any thrown value to a redacted category. Order matters: more specific
 * library errors (egress, abort, session) win over generic status/code checks.
 * NEVER reads `err.message` — only types, `.name`, `.code`, and numeric status.
 */
export function classifyDiscoveryError(err: unknown): DiscoveryErrorCategory {
  if (err instanceof EgressBlockedError) return 'blocked';
  if (isDns(err)) return 'dns';
  if (isTimeout(err)) return 'timeout';
  if (isTls(err)) return 'tls';
  if (err instanceof SessionExpiredError) return 'auth';
  const status = httpStatus(err);
  if (status !== undefined) return httpStatusCategory(status);
  if (isProtocol(err)) return 'protocol';
  return 'unknown';
}
