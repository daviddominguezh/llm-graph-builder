/**
 * Typed errors surfaced by the MCP transport layer.
 *
 * - McpError: a JSON-RPC error response was received from the server.
 * - SessionExpiredError: the server signalled session loss (HTTP 401/404 or
 *   server-defined code -32001). Callers can catch this to retry the
 *   initialize handshake.
 * - TransportError: a transport-level failure (network, timeout, malformed
 *   payload). Distinct from server-reported errors.
 */

const SESSION_EXPIRED_CODE = -32001;

export class McpError extends Error {
  readonly code: number;
  readonly data: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.data = data;
  }
}

export class SessionExpiredError extends McpError {
  constructor(message = 'MCP session expired') {
    super(SESSION_EXPIRED_CODE, message);
    this.name = 'SessionExpiredError';
  }
}

export class TransportError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TransportError';
    this.cause = cause;
  }
}

export function isSessionExpired(err: unknown): boolean {
  if (err instanceof SessionExpiredError) return true;
  if (err instanceof McpError) return err.code === SESSION_EXPIRED_CODE;
  return false;
}

export { SESSION_EXPIRED_CODE };
