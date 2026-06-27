// Thin Deno-side clients for the two Node-only helpers exposed by the backend:
//   POST /internal/embed    { text }                  -> { vector }
//   POST /internal/rerank   { query, records, topN }  -> { records }
//
// Regex validation is gone — re2js runs in-process now (RU1).
//
// Required env vars:
//   BACKEND_URL              — base URL of the backend (e.g. https://api.example.com)
//   EDGE_FUNCTION_MASTER_KEY — shared secret matching the backend's EDGE_FUNCTION_MASTER_KEY

const HTTP_OK = 200;

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

function backendUrl(): string {
  return Deno.env.get('BACKEND_URL') ?? '';
}

function sharedKey(): string {
  return Deno.env.get('EDGE_FUNCTION_MASTER_KEY') ?? '';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${backendUrl()}${path}`, {
    method: 'POST',
    headers: {
      'x-master-key': sharedKey(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json };
}

export async function embedText(text: string): Promise<number[]> {
  const { status, json } = await postJson('/internal/embed', { text });
  if (status !== HTTP_OK || !isRecord(json) || !Array.isArray(json.vector)) {
    throw new Error(`embed failed: HTTP ${String(status)}`);
  }
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

export async function rerank(input: RerankInput): Promise<RerankedRecord[]> {
  const { status, json } = await postJson('/internal/rerank', input);
  if (status !== HTTP_OK) {
    throw new Error(`rerank failed: HTTP ${String(status)}`);
  }
  return parseReranked(json);
}
