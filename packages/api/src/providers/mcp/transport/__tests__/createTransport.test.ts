import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import { createTransport } from '../createTransport.js';
import { constantFetch, makeJsonResponse } from './__fixtures__/fetchMock.js';

const TEST_URL = 'https://mcp.example.com/rpc';

const HTTP_SERVER: McpServerConfig = {
  id: 'srv-http',
  name: 'http-server',
  transport: { type: 'http', url: TEST_URL },
  enabled: true,
};

const SSE_SERVER: McpServerConfig = {
  id: 'srv-sse',
  name: 'sse-server',
  transport: { type: 'sse', url: TEST_URL },
  enabled: true,
};

const ECHO = constantFetch(makeJsonResponse({}));

describe('createTransport — variant dispatch', () => {
  it('dispatches http transport for type=http', async () => {
    const t = await createTransport(HTTP_SERVER, { fetch: ECHO.fn });
    expect(typeof t.request).toBe('function');
    expect(typeof t.notify).toBe('function');
    expect(t.sessionId).toBeNull();
  });

  it('dispatches sse transport for type=sse', async () => {
    const t = await createTransport(SSE_SERVER, { fetch: ECHO.fn });
    expect(typeof t.request).toBe('function');
    expect(typeof t.notify).toBe('function');
    expect(t.sessionId).toBeNull();
  });
});

describe('createTransport — common surface', () => {
  it('exposes setSessionId and close on every variant', async () => {
    const t = await createTransport(HTTP_SERVER, { fetch: ECHO.fn });
    t.setSessionId('preset');
    expect(t.sessionId).toBe('preset');
    await expect(t.close()).resolves.toBeUndefined();
  });
});
