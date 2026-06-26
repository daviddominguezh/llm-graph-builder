import { describe, expect, it } from '@jest/globals';

import { ToolError } from '../types.js';
import { type TavilyFetch, type TavilyHttpResponse, makeTavilyWebService } from './tavilyClient.js';

const HTTP_OK = 200;
const HTTP_TOO_MANY = 429;
const EXPECTED_CALLS = 1;
const FIRST = 0;
const CREDITS_ONE = 1;
const CREDITS_TWO = 2;
const BASE_URL = 'https://api.tavily.com';

function okResponse(body: unknown): TavilyHttpResponse {
  return {
    ok: true,
    status: HTTP_OK,
    json: async () => await Promise.resolve(body),
    text: async () => await Promise.resolve(''),
  };
}

interface Captured {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
}

function recordingFetch(body: unknown): { fetchImpl: TavilyFetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl: TavilyFetch = async (url, init) => {
    calls.push({ url, init });
    return await Promise.resolve(okResponse(body));
  };
  return { fetchImpl, calls };
}

describe('makeTavilyWebService', () => {
  it('posts to the right URL with bearer auth and always sets include_usage', async () => {
    const { fetchImpl, calls } = recordingFetch({ results: [], usage: { credits: CREDITS_ONE } });
    const svc = makeTavilyWebService({ apiKey: 'k', baseUrl: BASE_URL, fetchImpl });

    await svc.search({ query: 'hello' });

    expect(calls).toHaveLength(EXPECTED_CALLS);
    expect(calls[FIRST]?.url).toBe(`${BASE_URL}/search`);
    expect(calls[FIRST]?.init.method).toBe('POST');
    expect(calls[FIRST]?.init.headers.Authorization).toBe('Bearer k');
    const sent: unknown = JSON.parse(calls[FIRST]?.init.body ?? '{}');
    expect(sent).toMatchObject({ query: 'hello', include_usage: true });
  });

  it('returns the upstream JSON verbatim', async () => {
    const payload = { results: [{ url: 'u' }], usage: { credits: CREDITS_TWO } };
    const { fetchImpl } = recordingFetch(payload);
    const svc = makeTavilyWebService({ apiKey: 'k', baseUrl: BASE_URL, fetchImpl });

    await expect(svc.extract({ urls: ['https://x'] })).resolves.toEqual(payload);
  });

  it('throws ToolError(upstream_error) on non-2xx', async () => {
    const fetchImpl: TavilyFetch = async () =>
      await Promise.resolve({
        ok: false,
        status: HTTP_TOO_MANY,
        json: async () => await Promise.resolve(null),
        text: async () => await Promise.resolve('rate limited'),
      });
    const svc = makeTavilyWebService({ apiKey: 'k', baseUrl: BASE_URL, fetchImpl });

    await expect(svc.map({ url: 'https://x' })).rejects.toBeInstanceOf(ToolError);
  });
});
