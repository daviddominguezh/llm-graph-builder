import { describe, expect, it } from '@jest/globals';

import { ToolError } from '../types.js';
import { makeTavilyWebService, type TavilyFetch, type TavilyHttpResponse } from './tavilyClient.js';

function okResponse(body: unknown): TavilyHttpResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') };
}

interface Captured {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
}

function recordingFetch(body: unknown): { fetchImpl: TavilyFetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl: TavilyFetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(okResponse(body));
  };
  return { fetchImpl, calls };
}

describe('makeTavilyWebService', () => {
  it('posts to the right URL with bearer auth and always sets include_usage', async () => {
    const { fetchImpl, calls } = recordingFetch({ results: [], usage: { credits: 1 } });
    const svc = makeTavilyWebService({ apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl });

    await svc.search({ query: 'hello' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.tavily.com/search');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers.Authorization).toBe('Bearer k');
    const sent = JSON.parse(calls[0]?.init.body ?? '{}') as Record<string, unknown>;
    expect(sent.query).toBe('hello');
    expect(sent.include_usage).toBe(true);
  });

  it('returns the upstream JSON verbatim', async () => {
    const payload = { results: [{ url: 'u' }], usage: { credits: 2 } };
    const { fetchImpl } = recordingFetch(payload);
    const svc = makeTavilyWebService({ apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl });

    await expect(svc.extract({ urls: ['https://x'] })).resolves.toEqual(payload);
  });

  it('throws ToolError(upstream_error) on non-2xx', async () => {
    const fetchImpl: TavilyFetch = () =>
      Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve('rate limited'),
      });
    const svc = makeTavilyWebService({ apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl });

    await expect(svc.map({ url: 'https://x' })).rejects.toBeInstanceOf(ToolError);
  });
});
