import type { JsonRpcNotification } from './jsonRpc.js';

/**
 * Common interface for all MCP transports (HTTP, SSE, stdio). Higher-level
 * client code only depends on this surface, so transports remain swappable.
 */
export interface McpTransport {
  /**
   * Send a JSON-RPC request and await the matching response. Returns the raw
   * JSON-RPC `result` payload as `unknown`; callers (typically the high-level
   * MCP client) are responsible for validating the shape with zod or similar.
   */
  request: (method: string, params?: unknown) => Promise<unknown>;

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  notify: (method: string, params?: unknown) => Promise<void>;

  /**
   * Current session ID, if the server has assigned one. Updated after the
   * initialize handshake (when the server sends Mcp-Session-Id).
   */
  readonly sessionId: string | null;

  /**
   * Resume an existing session — pre-populate the session ID so subsequent
   * requests include it as a header. Used by session-cache reuse.
   */
  setSessionId: (id: string) => void;

  /**
   * Close the transport. Idempotent.
   */
  close: () => Promise<void>;
}

export type OnNotificationHandler = (notif: JsonRpcNotification) => void;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface TransportOptions {
  /** Optional handler for server-initiated notifications. Useful for logging. */
  onNotification?: OnNotificationHandler;
  /** Request timeout in ms. Default 30s. */
  requestTimeoutMs?: number;
  /** Override the global fetch implementation. Mainly for testing. */
  fetch?: FetchLike;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
