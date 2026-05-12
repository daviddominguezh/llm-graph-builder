import type { SupabaseClient } from '@supabase/supabase-js';

import type { SourcedChunk } from '../../rag/chunker.js';

const PAGE_OFFSET = 1;
const ZERO_DISTANCE = 0;
const NO_CHUNKS = 0;
const NO_INSERTED = 0;

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
}

const LIST_COLUMNS =
  'id, rag_file_id, rag_store_id, tenant_id, org_id, page_number, page_end, paragraph_idx, char_start, char_end, content, content_hash, token_count, created_at';

function isRagChunkRow(value: unknown): value is RagChunkRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'rag_file_id' in value && 'content' in value;
}

function mapRows(data: unknown[]): RagChunkRow[] {
  return data.reduce<RagChunkRow[]>((acc, row) => {
    if (isRagChunkRow(row)) acc.push(row);
    return acc;
  }, []);
}

export interface InsertChunksInput {
  ragFileId: string;
  ragStoreId: string;
  tenantId: string;
  orgId: string;
  chunks: SourcedChunk[];
}

function chunkToRow(input: InsertChunksInput, c: SourcedChunk): Record<string, unknown> {
  return {
    rag_file_id: input.ragFileId,
    rag_store_id: input.ragStoreId,
    tenant_id: input.tenantId,
    org_id: input.orgId,
    page_number: c.page_number,
    page_end: c.page_end,
    paragraph_idx: c.paragraph_idx,
    char_start: c.char_start,
    char_end: c.char_end,
    content: c.content,
    content_hash: c.content_hash,
    token_count: c.token_count,
  };
}

export async function insertChunks(
  supabase: SupabaseClient,
  input: InsertChunksInput
): Promise<{ inserted: number; error: string | null }> {
  if (input.chunks.length === NO_CHUNKS) return { inserted: NO_INSERTED, error: null };
  const rows = input.chunks.map((c) => chunkToRow(input, c));
  const { error } = await supabase.from('rag_chunks').insert(rows);
  if (error !== null) return { inserted: NO_INSERTED, error: error.message };
  return { inserted: rows.length, error: null };
}

export async function listChunksForFile(
  supabase: SupabaseClient,
  fileId: string,
  page: number,
  pageSize: number
): Promise<{ result: RagChunkRow[]; error: string | null }> {
  const from = (page - PAGE_OFFSET) * pageSize;
  const to = from + pageSize - PAGE_OFFSET;
  const { data, error } = await supabase
    .from('rag_chunks')
    .select(LIST_COLUMNS)
    .eq('rag_file_id', fileId)
    .order('page_number', { ascending: true })
    .order('paragraph_idx', { ascending: true })
    .range(from, to);
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { result: mapRows(rows), error: null };
}

interface IdContentRow {
  id: string;
  content: string;
}

function isIdContentRow(value: unknown): value is IdContentRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as { id?: unknown; content?: unknown };
  return typeof row.id === 'string' && typeof row.content === 'string';
}

function splitIdsAndTexts(rows: unknown[]): { ids: string[]; texts: string[] } {
  const ids: string[] = [];
  const texts: string[] = [];
  for (const r of rows) {
    if (!isIdContentRow(r)) continue;
    ids.push(r.id);
    texts.push(r.content);
  }
  return { ids, texts };
}

export async function listChunkIdsWithoutEmbedding(
  supabase: SupabaseClient,
  fileId: string,
  limit: number
): Promise<{ ids: string[]; texts: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_chunks')
    .select('id, content')
    .eq('rag_file_id', fileId)
    .is('embedding', null)
    .limit(limit);
  if (error !== null) return { ids: [], texts: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const { ids, texts } = splitIdsAndTexts(rows);
  return { ids, texts, error: null };
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export async function setEmbedding(
  supabase: SupabaseClient,
  id: string,
  vector: number[]
): Promise<{ error: string | null }> {
  const literal = vectorLiteral(vector);
  const { error } = await supabase.from('rag_chunks').update({ embedding: literal }).eq('id', id);
  if (error !== null) return { error: error.message };
  return { error: null };
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
  const { data, error } = await supabase
    .from('rag_chunks')
    .select(LIST_COLUMNS)
    .eq('rag_store_id', input.ragStoreId)
    .eq('tenant_id', input.tenantId)
    .textSearch('content', input.query, { config: 'simple', type: 'plain' })
    .limit(input.k);
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

export interface SemanticChunk extends RagChunkRow {
  distance: number;
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

export async function searchBySemantic(
  supabase: SupabaseClient,
  input: SemanticSearchInput
): Promise<{ result: SemanticChunk[]; error: string | null }> {
  const literal = vectorLiteral(input.queryVector);
  const { data, error } = (await supabase.rpc('rag_semantic_search', {
    p_rag_store_id: input.ragStoreId,
    p_tenant_id: input.tenantId,
    p_query_vector: literal,
    p_k: input.k,
    p_max_distance: input.maxDistance,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { result: mapSemanticRows(rows), error: null };
}
