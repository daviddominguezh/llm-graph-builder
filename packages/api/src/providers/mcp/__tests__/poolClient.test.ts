import { describe, expect, it, jest } from '@jest/globals';

import { type FetchLike, type McpInvokeArgs, McpPoolError, createMcpPoolClient } from '../poolClient.js';

const HTTP_OK = 200;
const HTTP_SERVER_ERROR = 500;

const SAMPLE_ARGS: McpInvokeArgs = {
  agentId: 'ag1',
  tenantId: 't1',
  mcpBindingId: 'srv1',
  toolName: 'do',
  args: {},
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: HTTP_OK,
    headers: { 'content-type': 'application/json' },
  });
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

function client(fetchMock: FetchLike): ReturnType<typeof createMcpPoolClient> {
  return createMcpPoolClient({ baseUrl: 'http://be:4000', masterKey: 'secret', fetch: fetchMock });
}

describe('createMcpPoolClient — happy path', () => {
  it('POSTs invoke with poolKey + master-key headers and returns the result', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = jest.fn<FetchLike>(async (url, init) => {
      calls.push({ url, init });
      return await Promise.resolve(jsonResponse({ kind: 'result', result: { content: [] } }));
    });

    const out = await client(fetchMock).invoke(SAMPLE_ARGS);

    expect(out).toEqual({ content: [] });
    const [call] = calls;
    expect(call?.url).toBe('http://be:4000/internal/mcp/invoke');
    expect(call?.init.method).toBe('POST');
    expect(header(call?.init ?? {}, 'x-mcp-poolkey')).toBe('ag1::t1::srv1');
    expect(header(call?.init ?? {}, 'x-master-key')).toBe('secret');
    expect(call?.init.body).toBe(
      JSON.stringify({ agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', toolName: 'do', args: {} })
    );
  });

  it('includes tenantId in the POSTed request body so BE BodySchema validation passes', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = jest.fn<FetchLike>(async (url, init) => {
      calls.push({ url, init });
      return await Promise.resolve(jsonResponse({ kind: 'result', result: {} }));
    });

    await client(fetchMock).invoke(SAMPLE_ARGS);

    const [call] = calls;
    const rawBody = typeof call?.init.body === 'string' ? call.init.body : '';
    const parsedBody: unknown = JSON.parse(rawBody);
    expect(parsedBody).toMatchObject({ tenantId: 't1' });
  });
});

describe('createMcpPoolClient — tool_error mapping', () => {
  it('throws McpPoolError carrying the category on an uncertain_outcome tool_error', async () => {
    const fetchMock = jest.fn<FetchLike>(
      async () => await Promise.resolve(jsonResponse({ kind: 'tool_error', category: 'uncertain_outcome' }))
    );

    const promise = client(fetchMock).invoke(SAMPLE_ARGS);

    await expect(promise).rejects.toBeInstanceOf(McpPoolError);
    await expect(promise).rejects.toMatchObject({ category: 'uncertain_outcome' });
  });
});

describe('createMcpPoolClient — transport mapping', () => {
  it('maps a fetch rejection to a transport McpPoolError', async () => {
    const fetchMock = jest.fn<FetchLike>(async () => await Promise.reject(new Error('connection refused')));

    const promise = client(fetchMock).invoke(SAMPLE_ARGS);

    await expect(promise).rejects.toBeInstanceOf(McpPoolError);
    await expect(promise).rejects.toMatchObject({ category: 'transport' });
  });

  it('maps a non-ok HTTP status to a transport McpPoolError', async () => {
    const fetchMock = jest.fn<FetchLike>(
      async () => await Promise.resolve(new Response('boom', { status: HTTP_SERVER_ERROR }))
    );

    const promise = client(fetchMock).invoke(SAMPLE_ARGS);

    await expect(promise).rejects.toMatchObject({ category: 'transport' });
  });
});
