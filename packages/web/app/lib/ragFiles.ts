import { fetchFromBackend } from './backendProxy';

export type RagFileStatus =
  | 'pending'
  | 'uploading'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'done'
  | 'failed';

export interface RagFileRow {
  id: string;
  rag_store_id: string;
  tenant_id: string;
  org_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  status: RagFileStatus;
  status_error: string | null;
  gcs_object: string;
  da_operation: string | null;
  parsed_uri: string | null;
  language_hints: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface RagChunkRow {
  id: string;
  rag_file_id: string;
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
  distance: number;
  rerank_score?: number;
}

export interface TenantUsage {
  files_count: number;
  pages_count: number;
  bytes_total: number;
}

export interface InitUploadInput {
  storeId: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  languageHints: string[];
  ocrMode: 'standard' | 'advanced' | 'plain' | null;
}

export interface InitUploadResponse {
  fileId: string;
  uploadUrl: string;
  gcsObject: string;
}

function isInitUploadResponse(v: unknown): v is InitUploadResponse {
  if (typeof v !== 'object' || v === null) return false;
  return 'fileId' in v && 'uploadUrl' in v && 'gcsObject' in v;
}

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export async function initUpload(
  input: InitUploadInput
): Promise<{ result: InitUploadResponse | null; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'POST',
      `/rag-stores/${encodeURIComponent(input.storeId)}/files/init`,
      {
        tenantId: input.tenantId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        languageHints: input.languageHints,
        ocrMode: input.ocrMode,
      }
    );
    if (!isInitUploadResponse(data)) return { result: null, error: 'invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function confirmUpload(storeId: string, fileId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend(
      'POST',
      `/rag-stores/${encodeURIComponent(storeId)}/files/${encodeURIComponent(fileId)}/start`
    );
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export interface CheckFilesResponse {
  changed: boolean;
  digest: string;
}

export interface ListFilesResponse {
  digest?: string;
  files: RagFileRow[];
  usage: TenantUsage;
}

function isListFilesResponse(v: unknown): v is ListFilesResponse {
  return typeof v === 'object' && v !== null && 'files' in v && 'usage' in v;
}

export async function listFiles(
  storeId: string,
  tenantId: string
): Promise<{ result: ListFilesResponse; error: string | null }> {
  const empty: ListFilesResponse = {
    files: [],
    usage: { files_count: 0, pages_count: 0, bytes_total: 0 },
  };
  try {
    const data = await fetchFromBackend(
      'GET',
      `/rag-stores/${encodeURIComponent(storeId)}/files?tenantId=${encodeURIComponent(tenantId)}`
    );
    if (!isListFilesResponse(data)) return { result: empty, error: 'invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: empty, error: extractError(err) };
  }
}

function isCheckFilesResponse(v: unknown): v is CheckFilesResponse {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as { changed?: unknown; digest?: unknown };
  return typeof r.changed === 'boolean' && typeof r.digest === 'string';
}

export async function checkFiles(
  storeId: string,
  tenantId: string,
  digest: string
): Promise<{ result: CheckFilesResponse | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', `/rag-stores/${encodeURIComponent(storeId)}/files/check`, {
      tenantId,
      digest,
    });
    if (!isCheckFilesResponse(data)) return { result: null, error: 'invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function deleteFile(storeId: string, fileId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend(
      'DELETE',
      `/rag-stores/${encodeURIComponent(storeId)}/files/${encodeURIComponent(fileId)}`
    );
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

interface ChunksResponse {
  chunks?: unknown;
  totalCount?: unknown;
}

function isChunksResponse(v: unknown): v is ChunksResponse {
  return typeof v === 'object' && v !== null;
}

function isChunkArray(v: unknown): v is RagChunkRow[] {
  return Array.isArray(v);
}

const ZERO_COUNT = 0;

export interface ChunksPage {
  rows: RagChunkRow[];
  totalCount: number;
}

export async function getChunks(
  storeId: string,
  fileId: string,
  page: number,
  pageSize: number
): Promise<{ result: ChunksPage; error: string | null }> {
  const empty: ChunksPage = { rows: [], totalCount: ZERO_COUNT };
  try {
    const data = await fetchFromBackend(
      'GET',
      `/rag-stores/${encodeURIComponent(storeId)}/files/${encodeURIComponent(fileId)}/chunks?page=${String(page)}&pageSize=${String(pageSize)}`
    );
    if (!isChunksResponse(data)) return { result: empty, error: 'invalid response' };
    const chunks = data.chunks;
    if (!isChunkArray(chunks)) return { result: empty, error: 'invalid response' };
    const totalCount = typeof data.totalCount === 'number' ? data.totalCount : chunks.length;
    return { result: { rows: chunks, totalCount }, error: null };
  } catch (err) {
    return { result: empty, error: extractError(err) };
  }
}

export type SearchMode = 'simple' | 'semantic' | 'hybrid';

export interface SearchResponse {
  mode: SearchMode;
  files?: RagFileRow[];
  chunks?: SemanticChunk[];
}

function isSearchResponse(v: unknown): v is SearchResponse {
  return typeof v === 'object' && v !== null && 'mode' in v;
}

export interface SearchOptions {
  topK?: number;
  minSimilarity?: number;
  rerank?: boolean;
}

export async function search(
  storeId: string,
  tenantId: string,
  mode: SearchMode,
  query: string,
  options: SearchOptions = {}
): Promise<{ result: SearchResponse; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', `/rag-stores/${encodeURIComponent(storeId)}/search`, {
      tenantId,
      mode,
      query,
      k: options.topK,
      minSimilarity: options.minSimilarity,
      rerank: options.rerank,
    });
    if (!isSearchResponse(data)) return { result: { mode }, error: 'invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: { mode }, error: extractError(err) };
  }
}
