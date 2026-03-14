import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { BrowseOptions, McpLibraryRow, PublishInput } from './mcp-library-types';
import { BROWSE_COLUMNS, DETAIL_COLUMNS, isLibraryRow, mapRows } from './mcp-library-types';

export type { McpLibraryRow } from './mcp-library-types';
export { isLibraryRow } from './mcp-library-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase generic builder without codegen
type AnyFilterBuilder = PostgrestFilterBuilder<any, any, any, any, any>;

function applyBrowseFilters(q: AnyFilterBuilder, options?: BrowseOptions): AnyFilterBuilder {
  let query = q;
  if (options?.query) query = query.ilike('name', `%${options.query}%`);
  if (options?.category) query = query.eq('category', options.category);
  if (options?.limit !== undefined) query = query.limit(options.limit);
  if (options?.offset !== undefined)
    query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1);
  return query;
}

export async function browseLibrary(
  supabase: SupabaseClient,
  options?: BrowseOptions
): Promise<{ result: McpLibraryRow[]; error: string | null }> {
  const base = supabase
    .from('mcp_library')
    .select(BROWSE_COLUMNS)
    .order('installations_count', { ascending: false });
  const q = applyBrowseFilters(base, options);
  const { data, error } = await q;

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function getLibraryItemById(
  supabase: SupabaseClient,
  id: string
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  const { data, error } = await supabase.from('mcp_library').select(DETAIL_COLUMNS).eq('id', id).single();

  if (error !== null) return { result: null, error: error.message };
  if (!isLibraryRow(data)) return { result: null, error: 'Invalid library item data' };
  return { result: data, error: null };
}

export async function publishToLibrary(
  supabase: SupabaseClient,
  item: PublishInput
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const result = await supabase
    .from('mcp_library')
    .insert({ ...item, published_by: userId })
    .select(DETAIL_COLUMNS)
    .single();

  if (result.error !== null) return { result: null, error: result.error.message };
  if (!isLibraryRow(result.data)) return { result: null, error: 'Invalid library item data' };
  return { result: result.data, error: null };
}

export async function unpublishFromLibrary(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('mcp_library').delete().eq('id', id);

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function incrementInstallations(
  supabase: SupabaseClient,
  libraryItemId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('increment_installations_count', {
    p_library_item_id: libraryItemId,
  });

  if (error !== null) return { error: error.message };
  return { error: null };
}
