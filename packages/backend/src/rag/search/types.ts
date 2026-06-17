// Shared types for net-new RAG agent-facing search cores.
//
// These cores live alongside (but separate from) the FE-facing handlers in
// `routes/ragStores/ragFiles/searchChunks.ts`. They return a paginated,
// agent-friendly shape (string content only) and skip rerank entirely so
// pagination composes cleanly with top-k retrieval.

export interface PaginatedSearchResult {
  items: string[];
  total: number;
  offset: number;
  limit: number;
  truncated?: true;
}

export interface SearchParams {
  storeId: string;
  tenantId: string;
  query: string;
  offset: number;
  limit: number;
}

export interface SemanticSearchParams extends SearchParams {
  minSimilarity: number;
}

export interface RegexSearchParams {
  storeId: string;
  tenantId: string;
  pattern: string;
  offset: number;
  limit: number;
}

// Hard cap on the largest (offset + limit) window agents can request. Prevents
// agents from paging deep into a haystack and degrading retrieval cost.
export const MAX_OFFSET = 1000;

const MIN_OFFSET = 0;

export function clampOffset(offset: number, limit: number): { offset: number; truncated: boolean } {
  if (offset + limit > MAX_OFFSET) {
    return { offset: Math.max(MIN_OFFSET, MAX_OFFSET - limit), truncated: true };
  }
  return { offset, truncated: false };
}
