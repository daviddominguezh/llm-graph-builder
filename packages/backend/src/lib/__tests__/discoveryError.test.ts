import { AbortTimeoutError, McpError, SessionExpiredError } from '@daviddh/llm-graph-runner';
import { describe, expect, it } from '@jest/globals';

import { classifyDiscoveryError } from '../discoveryError.js';
import { EgressBlockedError, EgressDnsError } from '../egressGuard.js';

const BUDGET_MS = 8000;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;
const STATUS_TOO_MANY = 429;
const STATUS_SERVER_ERROR = 500;
const STATUS_UNAVAILABLE = 503;
const JSON_RPC_INVALID_REQUEST = -32600;

/** A status-bearing error like an HTTP client would throw (status carries no secret). */
function statusError(status: number): Error {
  const e = new Error(`HTTP ${String(status)} from https://10.0.0.5/secret`);
  return Object.assign(e, { status });
}

/** A node errno error with a redacting `.code`. */
function codeError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('classifyDiscoveryError — egress / network', () => {
  it('maps EgressBlockedError → blocked', () => {
    expect(classifyDiscoveryError(new EgressBlockedError('blocked'))).toBe('blocked');
  });

  it('maps EgressDnsError and ENOTFOUND / EAI_AGAIN → dns', () => {
    expect(classifyDiscoveryError(new EgressDnsError())).toBe('dns');
    expect(classifyDiscoveryError(codeError('ENOTFOUND', 'getaddrinfo ENOTFOUND secret.internal'))).toBe(
      'dns'
    );
    expect(classifyDiscoveryError(codeError('EAI_AGAIN', 'getaddrinfo EAI_AGAIN secret.internal'))).toBe(
      'dns'
    );
  });

  it('maps AbortTimeoutError and AbortError → timeout', () => {
    expect(classifyDiscoveryError(new AbortTimeoutError(BUDGET_MS))).toBe('timeout');
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    expect(classifyDiscoveryError(aborted)).toBe('timeout');
    expect(classifyDiscoveryError(codeError('ABORT_ERR', 'aborted'))).toBe('timeout');
  });

  it('maps TLS errors → tls', () => {
    expect(
      classifyDiscoveryError(codeError('DEPTH_ZERO_SELF_SIGNED_CERT', 'self signed cert at https://10.0.0.5'))
    ).toBe('tls');
    expect(classifyDiscoveryError(codeError('ERR_TLS_CERT_ALTNAME_INVALID', 'bad altname'))).toBe('tls');
  });
});

describe('classifyDiscoveryError — http status / protocol', () => {
  it('maps session expiry / 401 / 403 → auth', () => {
    expect(classifyDiscoveryError(new SessionExpiredError())).toBe('auth');
    expect(classifyDiscoveryError(statusError(STATUS_UNAUTHORIZED))).toBe('auth');
    expect(classifyDiscoveryError(statusError(STATUS_FORBIDDEN))).toBe('auth');
  });

  it('maps other 4xx → client_error and 5xx → server_error', () => {
    expect(classifyDiscoveryError(statusError(STATUS_NOT_FOUND))).toBe('client_error');
    expect(classifyDiscoveryError(statusError(STATUS_TOO_MANY))).toBe('client_error');
    expect(classifyDiscoveryError(statusError(STATUS_SERVER_ERROR))).toBe('server_error');
    expect(classifyDiscoveryError(statusError(STATUS_UNAVAILABLE))).toBe('server_error');
  });

  it('maps JSON-RPC / McpError / parse failures → protocol', () => {
    expect(
      classifyDiscoveryError(new McpError(JSON_RPC_INVALID_REQUEST, 'Invalid Request at https://10.0.0.5'))
    ).toBe('protocol');
    const transportParse = new Error('Invalid JSON in MCP HTTP response');
    transportParse.name = 'TransportError';
    expect(classifyDiscoveryError(transportParse)).toBe('protocol');
  });
});

describe('classifyDiscoveryError — fallback + redaction', () => {
  it('maps a plain Error / non-error → unknown', () => {
    expect(classifyDiscoveryError(new Error('something with https://10.0.0.5/x'))).toBe('unknown');
    expect(classifyDiscoveryError('a string')).toBe('unknown');
    expect(classifyDiscoveryError(null)).toBe('unknown');
  });

  it('never lets a secret substring escape via the category', () => {
    const leak = new Error(
      'connect ECONNREFUSED https://user:s3cr3t@10.0.0.5/path Authorization: Bearer abc'
    );
    const cat = classifyDiscoveryError(leak);
    expect(JSON.stringify({ errorCategory: cat })).not.toMatch(/s3cr3t|Bearer|10\.0\.0\.5/v);
  });
});
