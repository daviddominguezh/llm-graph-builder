// Portable RAG retrieval via supabase-js RPCs (rag_text_search, rag_semantic_search).
// Returns a minimal { id, content } chunk shape — the agent surface only needs text.
//
// Injection note: both RPCs take the query (text or vector) as a bound function
// PARAMETER, so the LLM-supplied query is never interpolated into a PostgREST
// filter string. There is therefore no `.or()`/`.ilike()` filter-building path
// here and no need for the `quotePostgrestValue` discipline used in kvQueries.ts.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RagChunk {
  id: string;
  content: string;
}

function isRagChunk(v: unknown): v is RagChunk {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as { id?: unknown; content?: unknown };
  return typeof r.id === 'string' && typeof r.content === 'string';
}

function mapChunks(data: unknown): RagChunk[] {
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const out: RagChunk[] = [];
  for (const row of rows) if (isRagChunk(row)) out.push({ id: row.id, content: row.content });
  return out;
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

interface FtsArgs {
  storeId: string;
  tenantId: string;
  query: string;
  k: number;
}

export async function ftsPool(
  supabase: SupabaseClient,
  args: FtsArgs
): Promise<{ rows: RagChunk[]; error: string | null }> {
  const { data, error } = (await supabase.rpc('rag_text_search', {
    p_rag_store_id: args.storeId,
    p_tenant_id: args.tenantId,
    p_query: args.query,
    p_k: args.k,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { rows: [], error: error.message };
  return { rows: mapChunks(data), error: null };
}

interface SemanticArgs {
  storeId: string;
  tenantId: string;
  queryVector: number[];
  k: number;
  maxDistance: number | null;
}

export async function semanticPool(
  supabase: SupabaseClient,
  args: SemanticArgs
): Promise<{ rows: RagChunk[]; error: string | null }> {
  const { data, error } = (await supabase.rpc('rag_semantic_search', {
    p_rag_store_id: args.storeId,
    p_tenant_id: args.tenantId,
    p_query_vector: vectorLiteral(args.queryVector),
    p_k: args.k,
    p_max_distance: args.maxDistance,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { rows: [], error: error.message };
  return { rows: mapChunks(data), error: null };
}
