// Thin Deno-side clients for the two Node-only helpers exposed by the backend:
//   POST /internal/embed           { text } -> { vector }
//   POST /internal/regex/validate  { pattern } -> 200 {ok:true} | 400 {ok:false,error}
//
// Required env vars:
//   BACKEND_URL              — base URL of the backend (e.g. https://api.example.com)
//   EDGE_FUNCTION_MASTER_KEY — shared secret matching the backend's EDGE_FUNCTION_MASTER_KEY
import { ToolError } from '@daviddh/llm-graph-runner';

const HTTP_BAD_REQUEST = 400;

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
  if (status !== 200 || !isRecord(json) || !Array.isArray(json.vector)) {
    throw new Error(`embed failed: HTTP ${String(status)}`);
  }
  return json.vector.filter((n): n is number => typeof n === 'number');
}

export async function validateRegexPattern(pattern: string): Promise<void> {
  const { status, json } = await postJson('/internal/regex/validate', { pattern });
  if (status === 200) return;
  if (status === HTTP_BAD_REQUEST && isRecord(json)) {
    const message = typeof json.error === 'string' ? json.error : 'invalid regex';
    throw new ToolError('invalid_pattern', message);
  }
  throw new Error(`regex validate failed: HTTP ${String(status)}`);
}
