import type { SupabaseClient } from '@supabase/supabase-js';

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
  created_at: string;
  updated_at: string;
}

const LIST_COLUMNS =
  'id, rag_store_id, tenant_id, org_id, filename, mime_type, size_bytes, page_count, status, status_error, gcs_object, da_operation, parsed_uri, created_at, updated_at';

const CLAIM_BATCH_SIZE = 5;
const ACTIVE_STATUSES: RagFileStatus[] = ['parsing', 'chunking', 'embedding'];

interface DigestRow {
  id: string;
  updated_at: string;
}

function isDigestRow(value: unknown): value is DigestRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as { id?: unknown; updated_at?: unknown };
  return typeof row.id === 'string' && typeof row.updated_at === 'string';
}

export async function getFilesDigestRows(
  supabase: SupabaseClient,
  storeId: string,
  tenantId: string
): Promise<{ result: DigestRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_files')
    .select('id, updated_at')
    .eq('rag_store_id', storeId)
    .eq('tenant_id', tenantId)
    .order('id', { ascending: true });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const filtered: DigestRow[] = rows.reduce<DigestRow[]>((acc, row) => {
    if (isDigestRow(row)) acc.push(row);
    return acc;
  }, []);
  return { result: filtered, error: null };
}

function isRagFileRow(value: unknown): value is RagFileRow {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    'rag_store_id' in value &&
    'tenant_id' in value &&
    'org_id' in value &&
    'filename' in value &&
    'status' in value &&
    'gcs_object' in value
  );
}

function mapRows(data: unknown[]): RagFileRow[] {
  return data.reduce<RagFileRow[]>((acc, row) => {
    if (isRagFileRow(row)) acc.push(row);
    return acc;
  }, []);
}

export interface CreatePendingInput {
  ragStoreId: string;
  tenantId: string;
  orgId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  gcsObject: string;
}

export async function createPendingFile(
  supabase: SupabaseClient,
  input: CreatePendingInput
): Promise<{ result: RagFileRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_files')
    .insert({
      rag_store_id: input.ragStoreId,
      tenant_id: input.tenantId,
      org_id: input.orgId,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      gcs_object: input.gcsObject,
      status: 'pending',
    })
    .select(LIST_COLUMNS)
    .single();
  if (error !== null) return { result: null, error: error.message };
  if (!isRagFileRow(data)) return { result: null, error: 'Invalid rag_file data' };
  return { result: data, error: null };
}

export async function getRagFileById(
  supabase: SupabaseClient,
  id: string
): Promise<{ result: RagFileRow | null; error: string | null }> {
  const { data, error } = await supabase.from('rag_files').select(LIST_COLUMNS).eq('id', id).maybeSingle();
  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isRagFileRow(data)) return { result: null, error: 'Invalid rag_file data' };
  return { result: data, error: null };
}

export async function listFilesByStoreTenant(
  supabase: SupabaseClient,
  storeId: string,
  tenantId: string
): Promise<{ result: RagFileRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_files')
    .select(LIST_COLUMNS)
    .eq('rag_store_id', storeId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { result: mapRows(rows), error: null };
}

export type StatusPatch = Partial<
  Pick<RagFileRow, 'status' | 'status_error' | 'da_operation' | 'parsed_uri' | 'page_count'>
>;

export async function updateStatus(
  supabase: SupabaseClient,
  id: string,
  patch: StatusPatch
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('rag_files')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error !== null) return { error: error.message };
  return { error: null };
}

// NOTE: This is a soft-claim — for v1 a single worker process is assumed.
// Multiple workers would need SELECT ... FOR UPDATE SKIP LOCKED via raw SQL/RPC.
export async function claimActiveFiles(
  supabase: SupabaseClient
): Promise<{ result: RagFileRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_files')
    .select(LIST_COLUMNS)
    .in('status', ACTIVE_STATUSES)
    .order('updated_at', { ascending: true })
    .limit(CLAIM_BATCH_SIZE);
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { result: mapRows(rows), error: null };
}

export async function deleteFile(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('rag_files').delete().eq('id', id);
  if (error !== null) return { error: error.message };
  return { error: null };
}
