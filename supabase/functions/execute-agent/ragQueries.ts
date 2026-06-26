// Deno-side mirror of the Postgres-touching helpers in
// `packages/backend/src/db/queries/ragChunks*` and `ragRegexQueries.ts`.
//
// Same RPC names, same argument names, same returned shapes — only the host
// changes (Deno -> Postgres via the supabase-js service client instead of the
// Node backend doing the round-trip).
import type { SupabaseClient } from '@supabase/supabase-js';

const NO_TOTAL = 0;
const ZERO_DISTANCE = 0;
const PG_STATEMENT_TIMEOUT = '57014';

export interface RagChunkRow {
  id: string;
  rag_file_id: string;
  rag_store_id: string;
  tenant_id: string;
  org_id: string;
  page_number: number | null;
  page_end: number | null;
  paragraph_idx: number | null;
  char_start: number | null;
  char_end: number | null;
  content: string;
  content_hash: string;
  token_count: number | null;
  created_at: string;
  rank?: number;
}

export interface SemanticChunk extends RagChunkRow {
  distance?: number;
}

function isRagChunkRow(value: unknown): value is RagChunkRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'rag_file_id' in value && 'content' in value;
}

function mapRows(data: unknown[]): RagChunkRow[] {
  const out: RagChunkRow[] = [];
  for (const row of data) if (isRagChunkRow(row)) out.push(row);
  return out;
}

function isSemanticRow(value: unknown): value is RagChunkRow & { distance: unknown } {
  return isRagChunkRow(value) && 'distance' in value;
}

function mapSemanticRows(rows: unknown[]): SemanticChunk[] {
  const out: SemanticChunk[] = [];
  for (const r of rows) {
    if (!isSemanticRow(r)) continue;
    const distance = typeof r.distance === 'number' ? r.distance : ZERO_DISTANCE;
    out.push({ ...r, distance });
  }
  return out;
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export interface ContentSearchInput {
  ragStoreId: string;
  tenantId: string;
  query: string;
  k: number;
}

export async function searchByContent(
  supabase: SupabaseClient,
  input: ContentSearchInput
): Promise<{ result: RagChunkRow[]; error: string | null }> {
  const { data, error } = (await supabase.rpc('rag_text_search', {
    p_rag_store_id: input.ragStoreId,
    p_tenant_id: input.tenantId,
    p_query: input.query,
    p_k: input.k,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { result: mapRows(rows), error: null };
}

export interface SemanticSearchInput {
  ragStoreId: string;
  tenantId: string;
  queryVector: number[];
  k: number;
  maxDistance: number | null;
}

export async function searchBySemantic(
  supabase: SupabaseClient,
  input: SemanticSearchInput
): Promise<{ result: SemanticChunk[]; error: string | null }> {
  const { data, error } = (await supabase.rpc('rag_semantic_search', {
    p_rag_store_id: input.ragStoreId,
    p_tenant_id: input.tenantId,
    p_query_vector: vectorLiteral(input.queryVector),
    p_k: input.k,
    p_max_distance: input.maxDistance,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { result: mapSemanticRows(rows), error: null };
}

export interface CountByContentInput {
  ragStoreId: string;
  tenantId: string;
  query: string;
  countCap: number;
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

export interface CountBySemanticInput {
  ragStoreId: string;
  tenantId: string;
  queryVector: number[];
  maxDistance: number | null;
  countCap: number;
}

export async function countBySemantic(
  supabase: SupabaseClient,
  input: CountBySemanticInput
): Promise<{ total: number; error: string | null }> {
  const { data, error } = (await supabase.rpc('rag_semantic_search', {
    p_rag_store_id: input.ragStoreId,
    p_tenant_id: input.tenantId,
    p_query_vector: vectorLiteral(input.queryVector),
    p_k: input.countCap,
    p_max_distance: input.maxDistance,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { total: NO_TOTAL, error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { total: rows.length, error: null };
}

export interface RegexSearchInput {
  storeId: string;
  tenantId: string;
  pattern: string;
  offset: number;
  limit: number;
}

export interface RagRegexRow {
  id: string;
  content: string;
  page_number: number | null;
  rag_file_id: string;
}

export interface RegexSearchResult {
  result: RagRegexRow[];
  total: number;
  error: string | null;
  timedOut: boolean;
}

function isRagRegexRow(value: unknown): value is RagRegexRow {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { id?: unknown; content?: unknown; rag_file_id?: unknown };
  return typeof r.id === 'string' && typeof r.content === 'string' && typeof r.rag_file_id === 'string';
}

function mapRegexRows(rows: unknown[]): RagRegexRow[] {
  const out: RagRegexRow[] = [];
  for (const row of rows) if (isRagRegexRow(row)) out.push(row);
  return out;
}

export async function searchByRegex(
  supabase: SupabaseClient,
  input: RegexSearchInput
): Promise<RegexSearchResult> {
  const { data, error } = (await supabase.rpc('rag_regex_search', {
    p_store_id: input.storeId,
    p_tenant_id: input.tenantId,
    p_pattern: input.pattern,
    p_offset: input.offset,
    p_limit: input.limit,
  })) as { data: unknown; error: { message: string; code?: string } | null };
  if (error !== null) {
    if (error.code === PG_STATEMENT_TIMEOUT) {
      return { result: [], total: NO_TOTAL, error: null, timedOut: true };
    }
    return { result: [], total: NO_TOTAL, error: error.message, timedOut: false };
  }
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const mapped = mapRegexRows(rows);
  return { result: mapped, total: mapped.length, error: null, timedOut: false };
}
