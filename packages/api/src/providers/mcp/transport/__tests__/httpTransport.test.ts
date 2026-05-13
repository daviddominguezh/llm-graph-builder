import { describe, expect, it } from '@jest/globals';

import { McpError, SessionExpiredError, TransportError } from '../errors.js';
import { createHttpTransport } from '../httpTransport.js';
import type { FetchLike } from '../transport.js';
import { constantFetch, fetchSequence, makeJsonResponse } from './__fixtures__/fetchMock.js';

const TEST_URL = 'https://mcp.example.com/rpc';
const ERROR_CODE_METHOD_NOT_FOUND = -32601;
const STATUS_NOT_FOUND = 404;
const STATUS_UNAUTHORIZED = 401;
const TIMEOUT_VERY_SHORT_MS = 50;
const RACE_DELAY_MS = 200;
const REQ_ID_1 = 1;
const FIRST_INDEX = 0;
const SECOND_INDEX = 1;

describe('httpTransport — success path', () => {
  it('correlates request id with response and returns result', async () => {
    const mock = constantFetch(makeJsonResponse({ jsonrpc: '2.0', id: REQ_ID_1, result: { ok: true } }));
    const t = createHttpTransport({ url: TEST_URL }, { fetch: mock.fn });
    const result = await t.request('ping');
    expect(result).toEqual({ ok: true });
    expect(mock.calls).toHaveLength(REQ_ID_1);
    expect(mock.calls[FIRST_INDEX]?.url).toBe(TEST_URL);
  });
});

describe('httpTransport — error responses', () => {
  it('throws McpError on JSON-RPC error response', async () => {
    const mock = constantFetch(
      makeJsonResponse({
        jsonrpc: '2.0',
        id: REQ_ID_1,
        error: { code: ERROR_CODE_METHOD_NOT_FOUND, message: 'method not found' },
      })
    );
    const t = createHttpTransport({ url: TEST_URL }, { fetch: mock.fn });
    await expect(t.request('x')).rejects.toBeInstanceOf(McpError);
  });

  it('preserves the JSON-RPC error code on the McpError', async () => {
    const mock = constantFetch(
      makeJsonResponse({
        jsonrpc: '2.0',
        id: REQ_ID_1,
        error: { code: ERROR_CODE_METHOD_NOT_FOUND, message: 'nope' },
      })
    );
    const t = createHttpTransport({ url: TEST_URL }, { fetch: mock.fn });
    await expect(t.request('x')).rejects.toMatchObject({ code: ERROR_CODE_METHOD_NOT_FOUND });
  });

  it('throws SessionExpiredError on HTTP 404', async () => {
    const mock = constantFetch(makeJsonResponse({}, { status: STATUS_NOT_FOUND }));
    const t = createHttpTransport({ url: TEST_URL }, { fetch: mock.fn });
    await expect(t.request('x')).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('throws SessionExpiredError on HTTP 401', async () => {
    const mock = constantFetch(makeJsonResponse({}, { status: STATUS_UNAUTHORIZED }));
    const t = createHttpTransport({ url: TEST_URL }, { fetch: mock.fn });
    await expect(t.request('x')).rejects.toBeInstanceOf(SessionExpiredError);
  });
});

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value) || value instanceof Headers) return false;
  return true;
}

function getCallHeaders(init: RequestInit | undefined): Record<string, string> {
  const headers = init?.headers;
  if (!isStringRecord(headers)) return {};
  return headers;
}

describe('httpTransport — session handling', () => {
  it('captures Mcp-Session-Id from first response and sends on subsequent calls', async () => {
    const mock = fetchSequence((_call, idx) => {
      const headers = idx === FIRST_INDEX ? { 'Mcp-Session-Id': 'sess-abc' } : undefined;
      return makeJsonResponse({ jsonrpc: '2.0', id: idx + REQ_ID_1, result: idx + REQ_ID_1 }, { headers });
    });
    const t = createHttpTransport({ url: TEST_URL }, { fetch: mock.fn });
    await t.request('a');
    expect(t.sessionId).toBe('sess-abc');
    await t.request('b');
    const sentHeaders = getCallHeaders(mock.calls[SECOND_INDEX]?.init);
    expect(sentHeaders['Mcp-Session-Id']).toBe('sess-abc');
  });

  it('uses pre-set sessionId via setSessionId on the very first request', async () => {
    const mock = constantFetch(makeJsonResponse({ jsonrpc: '2.0', id: REQ_ID_1, result: 'ok' }));
    const t = createHttpTransport({ url: TEST_URL }, { fetch: mock.fn });
    t.setSessionId('preset-id');
    await t.request('x');
    const sentHeaders = getCallHeaders(mock.calls[FIRST_INDEX]?.init);
    expect(sentHeaders['Mcp-Session-Id']).toBe('preset-id');
  });
});

async function neverResolveFetch(_input: string, init: RequestInit): Promise<Response> {
  const { promise, reject } = Promise.withResolvers<Response>();
  const onAbort = (): void => {
    reject(new Error('aborted'));
  };
  init.signal?.addEventListener('abort', onAbort);
  setTimeout(onAbort, RACE_DELAY_MS);
  return await promise;
}

function makeAbortFetch(): FetchLike {
  return neverResolveFetch;
}

describe('httpTransport — timeouts', () => {
  it('aborts on timeout and surfaces a TransportError', async () => {
    const t = createHttpTransport(
      { url: TEST_URL },
      { fetch: makeAbortFetch(), requestTimeoutMs: TIMEOUT_VERY_SHORT_MS }
    );
    await expect(t.request('slow')).rejects.toBeInstanceOf(TransportError);
  });
});
