import type { SupabaseClient } from '@supabase/supabase-js';

const PG_STATEMENT_TIMEOUT = '57014';
const NO_CHUNKS = 0;

export interface RagRegexRow {
  id: string;
  content: string;
  page_number: number | null;
  rag_file_id: string;
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

export interface RegexSearchInput {
  storeId: string;
  tenantId: string;
  pattern: string;
  offset: number;
  limit: number;
}

export interface RegexSearchResult {
  result: RagRegexRow[];
  total: number;
  error: string | null;
  timedOut: boolean;
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
      return { result: [], total: NO_CHUNKS, error: null, timedOut: true };
    }
    return { result: [], total: NO_CHUNKS, error: error.message, timedOut: false };
  }
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const mapped = mapRegexRows(rows);
  return { result: mapped, total: mapped.length, error: null, timedOut: false };
}
