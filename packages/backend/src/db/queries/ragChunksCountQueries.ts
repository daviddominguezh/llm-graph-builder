import type { SupabaseClient } from '@supabase/supabase-js';

export interface CountByContentInput {
  ragStoreId: string;
  tenantId: string;
  query: string;
  countCap: number;
}

export interface CountBySemanticInput {
  ragStoreId: string;
  tenantId: string;
  queryVector: number[];
  maxDistance: number | null;
  countCap: number;
}

// Companion "count" queries for the RAG agent-facing search cores. Lives in a
// separate file purely to keep `ragChunksQueries.ts` under the 300-line cap.
//
// Note: the underlying RPCs (`rag_text_search`, `rag_semantic_search`) use
// `LIMIT p_k` and have no count-only variant. We therefore call the RPC with a
// large `countCap` and use rows.length as the total. The result is exact up to
// `countCap` and saturates at that value when there are more matches.
// Since the agent search path already bounds the addressable window via
// MAX_OFFSET, this approximation is acceptable.

const NO_TOTAL = 0;

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export async function countByContent(
  supabase: SupabaseClient,
  input: CountByContentInput
): Promise<{ total: number; error: string | null }> {
  const { data, error } = (await supabase.rpc('rag_text_search', {
    p_rag_store_id: input.ragStoreId,
    p_tenant_id: input.tenantId,
    p_query: input.query,
    p_k: input.countCap,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { total: NO_TOTAL, error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { total: rows.length, error: null };
}

export async function countBySemantic(
  supabase: SupabaseClient,
  input: CountBySemanticInput
): Promise<{ total: number; error: string | null }> {
  const literal = vectorLiteral(input.queryVector);
  const { data, error } = (await supabase.rpc('rag_semantic_search', {
    p_rag_store_id: input.ragStoreId,
    p_tenant_id: input.tenantId,
    p_query_vector: literal,
    p_k: input.countCap,
    p_max_distance: input.maxDistance,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { total: NO_TOTAL, error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { total: rows.length, error: null };
}
