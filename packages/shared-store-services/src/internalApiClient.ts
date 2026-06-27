// Portable client for the two Node-only BE hops the Worker/Deno cannot run
// in-process: query embedding (Vertex SA auth) and rerank (Vertex
// semantic-ranker). Regex validation is gone — re2js runs in-process now.
// Uses the global `fetch` (available in Node 18+, Workers, and Deno); the
// concrete impl can be injected for tests and host-specific transports.
const HTTP_OK = 200;

export interface InternalApiConfig {
  baseUrl: string;
  masterKey: string;
  fetchImpl?: typeof fetch;
}

export interface RerankRecord {
  id: string;
  content: string;
}

export interface RerankInput {
  query: string;
  records: RerankRecord[];
  topN: number;
}

export interface RerankedRecord {
  id: string;
  score: number;
}

export interface InternalApiClient {
  embed: (text: string) => Promise<number[]>;
  rerank: (input: RerankInput) => Promise<RerankedRecord[]>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function postJson(
  cfg: InternalApiConfig,
  path: string,
  body: unknown
): Promise<{ status: number; json: unknown }> {
  const doFetch = cfg.fetchImpl ?? fetch;
  const res = await doFetch(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'x-master-key': cfg.masterKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json };
}

function parseVector(json: unknown): number[] {
  if (!isRecord(json) || !Array.isArray(json.vector)) return [];
  return json.vector.filter((n): n is number => typeof n === 'number');
}

function parseReranked(json: unknown): RerankedRecord[] {
  if (!isRecord(json) || !Array.isArray(json.records)) return [];
  const out: RerankedRecord[] = [];
  for (const r of json.records) {
    if (!isRecord(r)) continue;
    if (typeof r.id !== 'string' || typeof r.score !== 'number') continue;
    out.push({ id: r.id, score: r.score });
  }
  return out;
}

export function makeInternalApiClient(cfg: InternalApiConfig): InternalApiClient {
  return {
    embed: async (text) => {
      const { status, json } = await postJson(cfg, '/internal/embed', { text });
      if (status !== HTTP_OK) throw new Error(`embed failed: HTTP ${String(status)}`);
      return parseVector(json);
    },
    rerank: async (input) => {
      const { status, json } = await postJson(cfg, '/internal/rerank', input);
      if (status !== HTTP_OK) throw new Error(`rerank failed: HTTP ${String(status)}`);
      return parseReranked(json);
    },
  };
}
