import type { SupabaseClient } from '@supabase/supabase-js';

import { countByContent } from '../../db/queries/ragChunksCountQueries.js';
import { searchByContent } from '../../db/queries/ragChunksQueries.js';
import { MAX_OFFSET, type PaginatedSearchResult, type SearchParams, clampOffset } from './types.js';

// runSimpleSearch — paginated BM25/text-rank search for the agent path.
//
// Reuses the FE-side `searchByContent` query (top-k via `LIMIT p_k`). Because
// the underlying RPC has no offset, we ask for the top `(offset + limit)` rows
// and slice in JS. This is bounded by MAX_OFFSET via clampOffset.
//
// No rerank. No filename-file pool. Items are chunk contents only.
export async function runSimpleSearch(
  supabase: SupabaseClient,
  params: SearchParams
): Promise<PaginatedSearchResult> {
  const clamp = clampOffset(params.offset, params.limit);
  const k = clamp.offset + params.limit;
  const [hits, count] = await Promise.all([
    searchByContent(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      query: params.query,
      k,
    }),
    countByContent(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      query: params.query,
      countCap: MAX_OFFSET,
    }),
  ]);
  if (hits.error !== null) throw new Error(hits.error);
  if (count.error !== null) throw new Error(count.error);
  const slice = hits.result.slice(clamp.offset, clamp.offset + params.limit);
  const items = slice.map((r) => r.content);
  return buildResult(items, count.total, clamp, params.limit);
}

function buildResult(
  items: string[],
  total: number,
  clamp: { offset: number; truncated: boolean },
  limit: number
): PaginatedSearchResult {
  if (clamp.truncated) {
    return { items, total, offset: clamp.offset, limit, truncated: true };
  }
  return { items, total, offset: clamp.offset, limit };
}
