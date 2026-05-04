import { SessionExpiredError, TransportError } from './errors.js';
import { buildNotification, buildRequest } from './jsonRpc.js';
import { parseSseChunk } from './sseParser.js';
import { PendingMap, dispatchEvent } from './sseState.js';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  type FetchLike,
  type McpTransport,
  type TransportOptions,
} from './transport.js';

const SESSION_EXPIRED_STATUS_404 = 404;
const SESSION_EXPIRED_STATUS_401 = 401;
const FIRST_ID = 1;
const ID_INCREMENT = 1;

export interface SseTransportConfig {
  url: string;
  headers?: Record<string, string>;
}

function buildHeaders(config: SseTransportConfig, sessionId: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...config.headers,
  };
  if (sessionId !== null) headers['Mcp-Session-Id'] = sessionId;
  return headers;
}

function checkSessionExpiredStatus(status: number): void {
  if (status === SESSION_EXPIRED_STATUS_404 || status === SESSION_EXPIRED_STATUS_401) {
    throw new SessionExpiredError(`HTTP ${String(status)} from MCP server`);
  }
}

interface ReaderCtx {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  pending: PendingMap;
  options: TransportOptions;
  decoder: InstanceType<typeof TextDecoder>;
}

async function consumeChunk(ctx: ReaderCtx, buffer: string): Promise<string | null> {
  const chunk = await ctx.reader.read();
  if (chunk.done) return null;
  const next = buffer + ctx.decoder.decode(chunk.value, { stream: true });
  const parsed = parseSseChunk(next);
  for (const event of parsed.events) dispatchEvent(event, ctx.pending, ctx.options.onNotification);
  return parsed.remaining;
}

async function readChunks(ctx: ReaderCtx, buffer = ''): Promise<void> {
  const next = await consumeChunk(ctx, buffer);
  if (next === null) return;
  await readChunks(ctx, next);
}

function startReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pending: PendingMap,
  options: TransportOptions
): void {
  const ctx: ReaderCtx = { reader, pending, options, decoder: new TextDecoder() };
  void readChunks(ctx).catch((err: unknown) => {
    pending.rejectAll(new TransportError('SSE stream error', err));
  });
}

interface PostArgs {
  config: SseTransportConfig;
  sessionId: string | null;
  body: unknown;
  timeoutMs: number;
  fetchFn: FetchLike;
}

async function postBody(args: PostArgs): Promise<Response> {
  const headers = buildHeaders(args.config, args.sessionId);
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, args.timeoutMs);
  try {
    return await args.fetchFn(args.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(args.body),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new TransportError('SSE transport failed', err);
  } finally {
    clearTimeout(timer);
  }
}

async function awaitId(pending: PendingMap, id: number, timeoutMs: number): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  const timer = setTimeout(() => {
    pending.reject(id, new TransportError('SSE request timed out'));
  }, timeoutMs);
  pending.add(
    id,
    (value) => {
      clearTimeout(timer);
      resolve(value);
    },
    (reason) => {
      clearTimeout(timer);
      reject(reason instanceof Error ? reason : new TransportError(String(reason)));
    }
  );
  return await promise;
}

interface SseRuntime {
  config: SseTransportConfig;
  options: TransportOptions;
  timeoutMs: number;
  pending: PendingMap;
  fetchFn: FetchLike;
  getSession: () => string | null;
  setSession: (id: string) => void;
  applySession: (sid: string | null) => void;
  ensureReader: (res: Response) => void;
}

function makeRequest(rt: SseRuntime): (method: string, params?: unknown) => Promise<unknown> {
  let nextId = FIRST_ID;
  return async (method, params) => {
    const id = nextId;
    nextId += ID_INCREMENT;
    const reqBody = buildRequest(id, method, params);
    const responsePromise = awaitId(rt.pending, id, rt.timeoutMs);
    responsePromise.catch(() => undefined);
    try {
      const res = await postBody({
        config: rt.config,
        sessionId: rt.getSession(),
        body: reqBody,
        timeoutMs: rt.timeoutMs,
        fetchFn: rt.fetchFn,
      });
      checkSessionExpiredStatus(res.status);
      rt.applySession(res.headers.get('Mcp-Session-Id'));
      rt.ensureReader(res);
    } catch (err) {
      rt.pending.reject(id, err);
      throw err;
    }
    return await responsePromise;
  };
}

function makeNotify(rt: SseRuntime): (method: string, params?: unknown) => Promise<void> {
  return async (method, params): Promise<void> => {
    const body = buildNotification(method, params);
    const res = await postBody({
      config: rt.config,
      sessionId: rt.getSession(),
      body,
      timeoutMs: rt.timeoutMs,
      fetchFn: rt.fetchFn,
    });
    checkSessionExpiredStatus(res.status);
    rt.applySession(res.headers.get('Mcp-Session-Id'));
    rt.ensureReader(res);
  };
}

interface CloseDeps {
  pending: PendingMap;
  getReader: () => ReadableStreamDefaultReader<Uint8Array> | null;
}

function makeClose(deps: CloseDeps, isClosed: () => boolean, markClosed: () => void): () => Promise<void> {
  return async () => {
    if (isClosed()) return;
    markClosed();
    deps.pending.rejectAll(new TransportError('SSE transport closed'));
    const r = deps.getReader();
    if (r !== null) {
      try {
        await r.cancel();
      } catch {
        // ignore — the stream may already be in error
      }
    }
  };
}

interface SessionVars {
  getSession: () => string | null;
  setSession: (id: string) => void;
  applySession: (sid: string | null) => void;
}

function createSessionVars(): SessionVars {
  let sessionId: string | null = null;
  return {
    getSession: () => sessionId,
    setSession: (id) => {
      sessionId = id;
    },
    applySession: (sid) => {
      if (sid !== null && sessionId === null) sessionId = sid;
    },
  };
}

function createReaderVars(
  pending: PendingMap,
  options: TransportOptions
): {
  ensureReader: (res: Response) => void;
  getReader: () => ReadableStreamDefaultReader<Uint8Array> | null;
} {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return {
    ensureReader: (res) => {
      if (reader !== null) return;
      if (res.body === null) throw new TransportError('SSE response has no body');
      reader = res.body.getReader();
      startReader(reader, pending, options);
    },
    getReader: () => reader,
  };
}

/**
 * Create an SSE-based MCP transport. The first POST opens a streaming
 * connection; subsequent messages are sent as additional POSTs that the
 * server writes responses to over the same SSE stream. Multiple events
 * (notifications + the matching response) per request are supported.
 */
export function createSseTransport(config: SseTransportConfig, options: TransportOptions = {}): McpTransport {
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const fetchFn: FetchLike = options.fetch ?? (async (input, init) => await fetch(input, init));
  const pending = new PendingMap();
  const session = createSessionVars();
  const readerVars = createReaderVars(pending, options);
  const rt: SseRuntime = {
    config,
    options,
    timeoutMs,
    pending,
    fetchFn,
    ...session,
    ensureReader: readerVars.ensureReader,
  };
  let closed = false;
  const close = makeClose(
    { pending, getReader: readerVars.getReader },
    () => closed,
    () => {
      closed = true;
    }
  );
  return {
    request: makeRequest(rt),
    notify: makeNotify(rt),
    get sessionId(): string | null {
      return session.getSession();
    },
    setSessionId: session.setSession,
    close,
  };
}
