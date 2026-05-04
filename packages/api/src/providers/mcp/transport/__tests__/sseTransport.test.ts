import { describe, expect, it, jest } from '@jest/globals';

import { McpError, SessionExpiredError } from '../errors.js';
import { createSseTransport } from '../sseTransport.js';
import { constantFetch, encodeSse, makeStreamResponse } from './__fixtures__/fetchMock.js';

const TEST_URL = 'https://mcp.example.com/sse';
const ERROR_CODE_INTERNAL = -32603;
const STATUS_NOT_FOUND = 404;
const REQ_ID_1 = 1;

describe('sseTransport — success path', () => {
  it('correlates a request with a single SSE response event', async () => {
    const mock = constantFetch(
      makeStreamResponse([encodeSse([JSON.stringify({ jsonrpc: '2.0', id: REQ_ID_1, result: 'pong' })])])
    );
    const t = createSseTransport({ url: TEST_URL }, { fetch: mock.fn });
    const out = await t.request('ping');
    expect(out).toBe('pong');
  });
});

describe('sseTransport — session capture', () => {
  it('captures Mcp-Session-Id from the SSE response headers', async () => {
    const mock = constantFetch(
      makeStreamResponse([encodeSse([JSON.stringify({ jsonrpc: '2.0', id: REQ_ID_1, result: REQ_ID_1 })])], {
        headers: { 'Mcp-Session-Id': 'sse-sess-1' },
      })
    );
    const t = createSseTransport({ url: TEST_URL }, { fetch: mock.fn });
    await t.request('init');
    expect(t.sessionId).toBe('sse-sess-1');
  });
});

describe('sseTransport — error responses', () => {
  it('rejects with McpError when the response carries a JSON-RPC error', async () => {
    const mock = constantFetch(
      makeStreamResponse([
        encodeSse([
          JSON.stringify({
            jsonrpc: '2.0',
            id: REQ_ID_1,
            error: { code: ERROR_CODE_INTERNAL, message: 'boom' },
          }),
        ]),
      ])
    );
    const t = createSseTransport({ url: TEST_URL }, { fetch: mock.fn });
    await expect(t.request('x')).rejects.toBeInstanceOf(McpError);
  });

  it('throws SessionExpiredError on HTTP 404', async () => {
    const mock = constantFetch(
      new Response(null, { status: STATUS_NOT_FOUND, headers: { 'Content-Type': 'text/event-stream' } })
    );
    const t = createSseTransport({ url: TEST_URL }, { fetch: mock.fn });
    await expect(t.request('x')).rejects.toBeInstanceOf(SessionExpiredError);
  });
});

describe('sseTransport — notifications', () => {
  it('routes notifications to the onNotification handler', async () => {
    const handler = jest.fn<(notif: unknown) => void>();
    const mock = constantFetch(
      makeStreamResponse([
        encodeSse([
          JSON.stringify({ jsonrpc: '2.0', method: 'notifications/log', params: { msg: 'hi' } }),
          JSON.stringify({ jsonrpc: '2.0', id: REQ_ID_1, result: 'ok' }),
        ]),
      ])
    );
    const t = createSseTransport({ url: TEST_URL }, { fetch: mock.fn, onNotification: handler });
    await t.request('x');
    expect(handler).toHaveBeenCalledTimes(REQ_ID_1);
  });
});
