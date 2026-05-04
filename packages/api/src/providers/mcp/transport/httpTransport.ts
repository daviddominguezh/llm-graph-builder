import { McpError, SessionExpiredError, TransportError } from './errors.js';
import {
  buildNotification,
  buildRequest,
  isJsonRpcError,
  isJsonRpcResponse,
  isJsonRpcSuccess,
} from './jsonRpc.js';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  type FetchLike,
  type McpTransport,
  type TransportOptions,
} from './transport.js';

const SESSION_EXPIRED_STATUS_404 = 404;
const SESSION_EXPIRED_STATUS_401 = 401;
const EMPTY_BODY_LENGTH = 0;
const FIRST_ID = 1;
const ID_INCREMENT = 1;

export interface HttpTransportConfig {
  url: string;
  headers?: Record<string, string>;
}

interface SendResult {
  parsed: unknown;
  sessionIdFromResponse: string | null;
  status: number;
}

function buildHeaders(config: HttpTransportConfig, sessionId: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...config.headers,
  };
  if (sessionId !== null) headers['Mcp-Session-Id'] = sessionId;
  return headers;
}

function parseJsonBody(text: string): unknown {
  if (text.length === EMPTY_BODY_LENGTH) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new TransportError('Invalid JSON in MCP HTTP response', err);
  }
}

const SSE_DATA_PREFIX = 'data:';
const LAST_INDEX_OFFSET = 1;

/**
 * MCP servers may respond to a POST with `Content-Type: text/event-stream`,
 * even for a single request/response cycle (Streamable HTTP transport spec).
 * In that case the body is one or more SSE events; the JSON-RPC message we
 * care about lives in the `data:` line of the last event.
 */
function parseSseBody(text: string): unknown {
  const dataLines = text
    .split('\n')
    .filter((line) => line.startsWith(SSE_DATA_PREFIX))
    .map((line) => line.slice(SSE_DATA_PREFIX.length).trim());
  const { [dataLines.length - LAST_INDEX_OFFSET]: last } = dataLines;
  if (last === undefined || last.length === EMPTY_BODY_LENGTH) {
    throw new TransportError('SSE response had no data line');
  }
  try {
    return JSON.parse(last);
  } catch (err) {
    throw new TransportError('Invalid JSON in MCP SSE data line', err);
  }
}

function parseBody(text: string, contentType: string | null): unknown {
  if (contentType?.includes('text/event-stream') === true) {
    return parseSseBody(text);
  }
  return parseJsonBody(text);
}

interface FetchArgs {
  fetchFn: FetchLike;
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

async function performFetch(args: FetchArgs): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, args.timeoutMs);
  try {
    return await args.fetchFn(args.url, {
      method: 'POST',
      headers: args.headers,
      body: args.body,
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new TransportError('HTTP transport failed', err);
  } finally {
    clearTimeout(timer);
  }
}

function checkSessionExpiredStatus(status: number): void {
  if (status === SESSION_EXPIRED_STATUS_404 || status === SESSION_EXPIRED_STATUS_401) {
    throw new SessionExpiredError(`HTTP ${String(status)} from MCP server`);
  }
}

function readResponse(parsed: unknown): unknown {
  if (!isJsonRpcResponse(parsed)) {
    throw new TransportError('Invalid JSON-RPC response: not a JSON-RPC message');
  }
  if (isJsonRpcError(parsed)) {
    throw new McpError(parsed.error.code, parsed.error.message, parsed.error.data);
  }
  if (!isJsonRpcSuccess(parsed)) {
    throw new TransportError('Invalid JSON-RPC response: no result');
  }
  return parsed.result;
}

interface HttpHandle {
  send: (body: unknown) => Promise<SendResult>;
  applyResponseSession: (sid: string | null) => void;
  takeNextId: () => number;
  getSessionId: () => string | null;
  setSessionId: (id: string) => void;
}

interface HandleDeps {
  config: HttpTransportConfig;
  timeoutMs: number;
  fetchFn: FetchLike;
}

function createHandle(deps: HandleDeps): HttpHandle {
  let sessionId: string | null = null;
  let nextId = FIRST_ID;
  return {
    send: async (body) => {
      const headers = buildHeaders(deps.config, sessionId);
      const res = await performFetch({
        fetchFn: deps.fetchFn,
        url: deps.config.url,
        headers,
        body: JSON.stringify(body),
        timeoutMs: deps.timeoutMs,
      });
      const text = await res.text();
      return {
        parsed: parseBody(text, res.headers.get('Content-Type')),
        sessionIdFromResponse: res.headers.get('Mcp-Session-Id'),
        status: res.status,
      };
    },
    applyResponseSession: (sid) => {
      if (sid !== null && sessionId === null) sessionId = sid;
    },
    takeNextId: () => {
      const id = nextId;
      nextId += ID_INCREMENT;
      return id;
    },
    getSessionId: () => sessionId,
    setSessionId: (id) => {
      sessionId = id;
    },
  };
}

async function doRequest(handle: HttpHandle, method: string, params?: unknown): Promise<unknown> {
  const id = handle.takeNextId();
  const reqBody = buildRequest(id, method, params);
  const { parsed, sessionIdFromResponse, status } = await handle.send(reqBody);
  checkSessionExpiredStatus(status);
  handle.applyResponseSession(sessionIdFromResponse);
  return readResponse(parsed);
}

async function doNotify(handle: HttpHandle, method: string, params?: unknown): Promise<void> {
  const body = buildNotification(method, params);
  const { sessionIdFromResponse, status } = await handle.send(body);
  checkSessionExpiredStatus(status);
  handle.applyResponseSession(sessionIdFromResponse);
}

/**
 * Create an HTTP MCP transport. Each request is a single POST whose body is a
 * JSON-RPC message and whose response body is a JSON-RPC reply. The session
 * ID is captured from the server's `Mcp-Session-Id` header on the first
 * response and echoed on every subsequent request.
 *
 * Stateless on the wire: `close()` is a no-op.
 */
export function createHttpTransport(
  config: HttpTransportConfig,
  options: TransportOptions = {}
): McpTransport {
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const fetchFn: FetchLike = options.fetch ?? (async (input, init) => await fetch(input, init));
  const handle = createHandle({ config, timeoutMs, fetchFn });
  return {
    request: async (method, params) => await doRequest(handle, method, params),
    notify: async (method, params): Promise<void> => {
      await doNotify(handle, method, params);
    },
    get sessionId(): string | null {
      return handle.getSessionId();
    },
    setSessionId: (id: string): void => {
      handle.setSessionId(id);
    },
    async close(): Promise<void> {
      // HTTP is stateless — nothing to release.
    },
  };
}
