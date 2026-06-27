import { makeInternalApiClient } from '../internalApiClient.js';

const HTTP_OK = 200;
const HTTP_ERR = 500;
const EMBED_A = 0.1;
const EMBED_B = 0.2;
const SCORE_HI = 0.9;
const SCORE_LO = 0.4;
const TOP_N = 2;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Narrow a fetch `input` to a URL string. `RequestInfo` is not a resolvable
// type in this lib config, so we accept `unknown` and branch on the runtime
// shape (tests only ever pass a string URL).
function urlString(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return '';
}

interface Seen {
  url: string;
  init: RequestInit | undefined;
}

// `seen` is a closure-local (not a parameter) so recording into it does not trip
// `no-param-reassign`; the stub is genuinely async to satisfy both
// `promise-function-async` and `require-await`.
function capturingFetch(body: unknown): { fetchImpl: typeof fetch; seen: Seen } {
  const seen: Seen = { url: '', init: undefined };
  const fetchImpl: typeof fetch = async (input, init) => {
    await Promise.resolve();
    seen.url = urlString(input);
    seen.init = init;
    return jsonResponse(HTTP_OK, body);
  };
  return { fetchImpl, seen };
}

function constFetch(status: number, body: unknown): typeof fetch {
  return async () => {
    await Promise.resolve();
    return jsonResponse(status, body);
  };
}

describe('internalApiClient embed', () => {
  it('posts to /internal/embed with the master key and returns the vector', async () => {
    const { fetchImpl, seen } = capturingFetch({ vector: [EMBED_A, EMBED_B] });
    const client = makeInternalApiClient({ baseUrl: 'http://be', masterKey: 'k', fetchImpl });
    const vec = await client.embed('hello');
    expect(vec).toEqual([EMBED_A, EMBED_B]);
    expect(seen.url).toBe('http://be/internal/embed');
    const headers = new Headers(seen.init?.headers);
    expect(headers.get('x-master-key')).toBe('k');
  });

  it('throws on a non-200 response', async () => {
    const client = makeInternalApiClient({
      baseUrl: 'http://be',
      masterKey: 'k',
      fetchImpl: constFetch(HTTP_ERR, { error: 'boom' }),
    });
    await expect(client.embed('x')).rejects.toThrow('embed failed');
  });
});

describe('internalApiClient rerank', () => {
  it('posts to /internal/rerank and returns scored records', async () => {
    const body = {
      records: [
        { id: 'b', score: SCORE_HI },
        { id: 'a', score: SCORE_LO },
      ],
    };
    const client = makeInternalApiClient({
      baseUrl: 'http://be',
      masterKey: 'k',
      fetchImpl: constFetch(HTTP_OK, body),
    });
    const out = await client.rerank({
      query: 'q',
      records: [
        { id: 'a', content: 'x' },
        { id: 'b', content: 'y' },
      ],
      topN: TOP_N,
    });
    expect(out).toEqual([
      { id: 'b', score: SCORE_HI },
      { id: 'a', score: SCORE_LO },
    ]);
  });
});
