import type { BuiltinProviderId } from './types';

const KV_TOOL_SLUGS: Record<string, string> = {
  list_keys: 'list-keys',
  get_values: 'get-values',
  search: 'search',
  update_value: 'update-value',
};

const RAG_TOOL_SLUGS: Record<string, string> = {
  search: 'search',
};

const PROVIDER_SLUGS: Record<BuiltinProviderId, string> = {
  kv_store: 'kv-store',
  rag: 'rag',
};

/**
 * Map a (providerId, toolName) coming from the registry to the backend internal
 * route slug (e.g. `kv_store.list_keys` → `/internal/tools/kv-store/list-keys`).
 * Returns null if the tool isn't recognized.
 */
export function resolveBackendPath(provider: BuiltinProviderId, toolName: string): string | null {
  const providerSlug = PROVIDER_SLUGS[provider];
  const slugMap = provider === 'kv_store' ? KV_TOOL_SLUGS : RAG_TOOL_SLUGS;
  const toolSlug = slugMap[toolName];
  if (toolSlug === undefined) return null;
  return `/internal/tools/${providerSlug}/${toolSlug}`;
}

const KV_LIST_KEYS_DEFAULT_LIMIT = 100;
const KV_SEARCH_DEFAULT_LIMIT = 50;
const RAG_SEARCH_DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;
const DEFAULT_MIN_SIMILARITY = 0.5;

interface KvArgs {
  offset?: unknown;
  limit?: unknown;
  on?: unknown;
  mode?: unknown;
  query?: unknown;
  key?: unknown;
  value?: unknown;
  keys?: unknown;
}

interface RagArgs {
  offset?: unknown;
  limit?: unknown;
  mode?: unknown;
  query?: unknown;
  minSimilarity?: unknown;
}

function pickOffset(raw: unknown): number {
  return typeof raw === 'number' ? raw : DEFAULT_OFFSET;
}

function pickLimit(raw: unknown, fallback: number): number {
  return typeof raw === 'number' ? raw : fallback;
}

function buildKvBody(
  tenantId: string,
  storeId: string,
  toolName: string,
  args: KvArgs
): Record<string, unknown> {
  const base = { tenantId, storeId };
  if (toolName === 'list_keys') {
    return {
      ...base,
      offset: pickOffset(args.offset),
      limit: pickLimit(args.limit, KV_LIST_KEYS_DEFAULT_LIMIT),
    };
  }
  if (toolName === 'get_values') {
    return { ...base, keys: Array.isArray(args.keys) ? args.keys : [] };
  }
  if (toolName === 'update_value') {
    return {
      ...base,
      key: typeof args.key === 'string' ? args.key : '',
      value: typeof args.value === 'string' ? args.value : '',
    };
  }
  return buildKvSearchBody(base, args);
}

function buildKvSearchBody(
  base: { tenantId: string; storeId: string },
  args: KvArgs
): Record<string, unknown> {
  const mode = args.mode === 'regex' ? 'regex' : 'substring';
  const on = typeof args.on === 'string' ? args.on : 'both';
  const offset = pickOffset(args.offset);
  const limit = pickLimit(args.limit, KV_SEARCH_DEFAULT_LIMIT);
  const queryStr = typeof args.query === 'string' ? args.query : '';
  if (mode === 'regex') {
    return { ...base, mode, on, pattern: queryStr, offset, limit };
  }
  return { ...base, mode, on, query: queryStr, offset, limit };
}

function buildRagBody(tenantId: string, storeId: string, args: RagArgs): Record<string, unknown> {
  const base = { tenantId, storeId };
  const mode = typeof args.mode === 'string' ? args.mode : 'bm25';
  const offset = pickOffset(args.offset);
  const limit = pickLimit(args.limit, RAG_SEARCH_DEFAULT_LIMIT);
  const queryStr = typeof args.query === 'string' ? args.query : '';
  if (mode === 'regex') {
    return { ...base, mode, pattern: queryStr, offset, limit };
  }
  if (mode === 'semantic' || mode === 'hybrid') {
    const minSimilarity =
      typeof args.minSimilarity === 'number' ? args.minSimilarity : DEFAULT_MIN_SIMILARITY;
    return { ...base, mode, query: queryStr, minSimilarity, offset, limit };
  }
  return { ...base, mode: 'bm25', query: queryStr, offset, limit };
}

/**
 * Build the JSON body the backend's `/internal/tools/...` endpoint expects.
 * Handles the two key transformations: tool-name keys (e.g. KV search's `query`
 * becomes `pattern` under `mode='regex'`) and JSON-schema defaults for
 * offset/limit/minSimilarity that the FE form omits when empty.
 */
export function buildBackendBody(
  provider: BuiltinProviderId,
  toolName: string,
  tenantId: string,
  storeId: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (provider === 'kv_store') return buildKvBody(tenantId, storeId, toolName, args);
  return buildRagBody(tenantId, storeId, args);
}
