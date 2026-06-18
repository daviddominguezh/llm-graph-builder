// Edge function KV / RAG store service factories.
//
// These are thin HTTP clients over backend endpoints under
// `/internal/tools/{kv-store,rag}/*`. The backend owns the real service
// implementations (Vertex AI embeddings, RE2-validated regex, Postgres FTS) —
// the edge runtime can't load those deps cleanly, and we'd rather not duplicate
// the production logic in two places.
//
// Required env vars:
//   INTERNAL_TOOLS_BACKEND_URL — base URL of the backend (e.g. https://api.example.com)
//   EDGE_FUNCTION_MASTER_KEY   — shared secret matching the backend's EDGE_FUNCTION_MASTER_KEY
//
// On success the backend returns `{ ok: true, result }`; on a ToolError it
// returns `{ ok: false, error: { code, message } }` with HTTP 200 so the same
// shape is preserved end-to-end and the LLM tool layer can surface the code.
import type {
  KvPagedResult,
  KvRegexArgs,
  KvSearchArgs,
  KvStoreServices,
  RagRegexArgs,
  RagSearchArgs,
  RagStoreServices,
  ToolErrorCode,
} from '@daviddh/llm-graph-runner';
import { ToolError } from '@daviddh/llm-graph-runner';

const KNOWN_TOOL_ERROR_CODES: ReadonlySet<ToolErrorCode> = new Set<ToolErrorCode>([
  'no_store_bound',
  'protected_key',
  'key_too_long',
  'value_too_large',
  'invalid_pattern',
  'pattern_timeout',
  'tenant_not_allowed',
]);

function asToolErrorCode(code: string): ToolErrorCode | null {
  return KNOWN_TOOL_ERROR_CODES.has(code as ToolErrorCode) ? (code as ToolErrorCode) : null;
}

const NO_STORE_SENTINEL_ID = '__no_store__';
const NO_STORE_MESSAGE = 'No store is bound to this agent.';

function backendUrl(): string {
  return Deno.env.get('INTERNAL_TOOLS_BACKEND_URL') ?? '';
}

function sharedKey(): string {
  return Deno.env.get('EDGE_FUNCTION_MASTER_KEY') ?? '';
}

interface BackendOk<T> {
  ok: true;
  result: T;
}
interface BackendErr {
  ok: false;
  error: { code: string; message: string };
}
type BackendResponse<T> = BackendOk<T> | BackendErr;

function isBackendResponse(value: unknown): value is BackendResponse<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { ok?: unknown };
  return typeof v.ok === 'boolean';
}

async function callBackend<T>(path: string, body: unknown): Promise<T> {
  const url = `${backendUrl()}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-master-key': sharedKey(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok || !isBackendResponse(json)) {
    throw new Error(`Backend ${path} failed: HTTP ${String(res.status)}`);
  }
  if (!json.ok) {
    // Surface known ToolError codes as ToolError so the LLM tool layer sees
    // the same shape as backend simulation. Unknown codes (e.g. invalid_request)
    // fall through as a plain Error.
    const code = asToolErrorCode(json.error.code);
    if (code !== null) throw new ToolError(code, json.error.message);
    throw new Error(`${json.error.code}: ${json.error.message}`);
  }
  return json.result as T;
}

/* ─── KV factory ─── */

export function makeKvStoreService(storeId: string): KvStoreServices {
  return {
    storeId,
    listKeys: (tenantId: string, offset: number, limit: number) =>
      callBackend<KvPagedResult<string>>('/internal/tools/kv-store/list-keys', {
        tenantId,
        storeId,
        offset,
        limit,
      }),
    getValues: (tenantId: string, keys: string[]) =>
      callBackend<Record<string, string | null>>('/internal/tools/kv-store/get-values', {
        tenantId,
        storeId,
        keys,
      }),
    searchSubstring: (args: KvSearchArgs) =>
      callBackend<KvPagedResult<{ key: string; value: string }>>('/internal/tools/kv-store/search', {
        tenantId: args.tenantId,
        storeId,
        mode: 'substring',
        on: args.on,
        query: args.query,
        offset: args.offset,
        limit: args.limit,
      }),
    searchRegex: (args: KvRegexArgs) =>
      callBackend<KvPagedResult<{ key: string; value: string }>>('/internal/tools/kv-store/search', {
        tenantId: args.tenantId,
        storeId,
        mode: 'regex',
        on: args.on,
        pattern: args.pattern,
        offset: args.offset,
        limit: args.limit,
      }),
    updateValue: (tenantId: string, key: string, value: string) =>
      callBackend<{ success: true }>('/internal/tools/kv-store/update-value', {
        tenantId,
        storeId,
        key,
        value,
      }),
  };
}

/* ─── RAG factory ─── */

export function makeRagStoreService(storeId: string): RagStoreServices {
  return {
    storeId,
    searchBm25: (tenantId: string, query: string, offset: number, limit: number) =>
      callBackend<KvPagedResult<string>>('/internal/tools/rag/search', {
        tenantId,
        storeId,
        mode: 'bm25',
        query,
        offset,
        limit,
      }),
    searchSemantic: (args: RagSearchArgs) =>
      callBackend<KvPagedResult<string>>('/internal/tools/rag/search', {
        tenantId: args.tenantId,
        storeId,
        mode: 'semantic',
        query: args.query,
        minSimilarity: args.minSimilarity,
        offset: args.offset,
        limit: args.limit,
      }),
    searchHybrid: (args: RagSearchArgs) =>
      callBackend<KvPagedResult<string>>('/internal/tools/rag/search', {
        tenantId: args.tenantId,
        storeId,
        mode: 'hybrid',
        query: args.query,
        minSimilarity: args.minSimilarity,
        offset: args.offset,
        limit: args.limit,
      }),
    searchRegex: (args: RagRegexArgs) =>
      callBackend<KvPagedResult<string>>('/internal/tools/rag/search', {
        tenantId: args.tenantId,
        storeId,
        mode: 'regex',
        pattern: args.pattern,
        offset: args.offset,
        limit: args.limit,
      }),
  };
}

/* ─── No-store-bound sentinels ─── */

function failNoStore(): never {
  throw new ToolError('no_store_bound', NO_STORE_MESSAGE);
}

export function makeNoStoreBoundKvServices(): KvStoreServices {
  return {
    storeId: NO_STORE_SENTINEL_ID,
    listKeys: () => failNoStore(),
    getValues: () => failNoStore(),
    searchSubstring: () => failNoStore(),
    searchRegex: () => failNoStore(),
    updateValue: () => failNoStore(),
  };
}

export function makeNoStoreBoundRagServices(): RagStoreServices {
  return {
    storeId: NO_STORE_SENTINEL_ID,
    searchBm25: () => failNoStore(),
    searchSemantic: () => failNoStore(),
    searchHybrid: () => failNoStore(),
    searchRegex: () => failNoStore(),
  };
}
