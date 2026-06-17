import type { SupabaseClient } from '@supabase/supabase-js';

import { countBySemantic } from '../../db/queries/ragChunksCountQueries.js';
import { searchBySemantic } from '../../db/queries/ragChunksQueries.js';
import { embedQuery } from '../embeddings.js';
import { MAX_OFFSET, type PaginatedSearchResult, type SemanticSearchParams, clampOffset } from './types.js';

const MIN_SIMILARITY = 0;
const MAX_SIMILARITY = 1;

function toMaxDistance(minSimilarity: number): number | null {
  if (minSimilarity <= MIN_SIMILARITY) return null;
  return MAX_SIMILARITY - minSimilarity;
}

// runSemanticSearch — paginated vector similarity search for the agent path.
//
// Reuses `embedQuery` + `searchBySemantic`. Same JS-slice pattern as
// runSimpleSearch: the RPC is top-k only, so we request top `(offset + limit)`
// rows and slice. No rerank — plain top-k composed with offset pagination.
export async function runSemanticSearch(
  supabase: SupabaseClient,
  params: SemanticSearchParams
): Promise<PaginatedSearchResult> {
  const clamp = clampOffset(params.offset, params.limit);
  const k = clamp.offset + params.limit;
  const queryVector = await embedQuery(params.query);
  const maxDistance = toMaxDistance(params.minSimilarity);
  const [hits, count] = await Promise.all([
    searchBySemantic(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      queryVector,
      k,
      maxDistance,
    }),
    countBySemantic(supabase, {
      ragStoreId: params.storeId,
      tenantId: params.tenantId,
      queryVector,
      maxDistance,
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
