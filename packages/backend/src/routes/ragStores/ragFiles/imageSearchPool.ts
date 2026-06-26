import type { SupabaseClient } from '@supabase/supabase-js';

import { type SemanticChunk, searchByImageSemantic } from '../../../db/queries/ragChunksQueries.js';
import { cachedHasImageChunks } from '../../../rag/imagePresenceCache.js';
import { embedQueryMultimodal } from '../../../rag/multimodalEmbeddings.js';

const EMPTY = 0;
const NEUTRAL_SCORE = 0;
const ONE = 1;

export interface ImagePoolParams {
  storeId: string;
  tenantId: string;
  query: string;
  k: number;
}

export async function fetchImagePoolIfAny(
  supabase: SupabaseClient,
  params: ImagePoolParams
): Promise<SemanticChunk[]> {
  const hasImages = await cachedHasImageChunks(supabase, params.storeId, params.tenantId);
  if (!hasImages) return [];
  const vector = await embedQueryMultimodal(params.query);
  if (vector.length === EMPTY) return [];
  const { result, error } = await searchByImageSemantic(supabase, {
    ragStoreId: params.storeId,
    tenantId: params.tenantId,
    queryVector: vector,
    k: params.k,
    maxDistance: null,
  });
  if (error !== null) return [];
  return result;
}

function scoreOf(chunk: SemanticChunk): number {
  if (typeof chunk.rerank_score === 'number') return chunk.rerank_score;
  if (typeof chunk.distance === 'number') return ONE - chunk.distance;
  return NEUTRAL_SCORE;
}

export function mergePoolsByScore(
  primary: SemanticChunk[],
  secondary: SemanticChunk[],
  topK: number
): SemanticChunk[] {
  const seen = new Set<string>();
  const sorted = [...primary, ...secondary].sort((a, b) => scoreOf(b) - scoreOf(a));
  const out: SemanticChunk[] = [];
  for (const c of sorted) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
    if (out.length >= topK) break;
  }
  return out;
}
