import type { SupabaseClient } from './operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type McpAuthType = 'none' | 'token' | 'oauth';

export interface McpLibraryRow {
  id: string;
  org_id: string;
  org_name?: string;
  name: string;
  description: string;
  category: string;
  image_url: string | null;
  transport_type: string;
  transport_config: Record<string, unknown>;
  variables: Array<{ name: string; description?: string }>;
  installations_count: number;
  published_by: string;
  created_at: string;
  auth_type: McpAuthType;
}

export interface BrowseOptions {
  query?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface PublishInput {
  org_id: string;
  name: string;
  description: string;
  category: string;
  transport_type: string;
  transport_config: Record<string, unknown>;
  variables: Array<{ name: string; description?: string }>;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isLibraryRow(value: unknown): value is McpLibraryRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'org_id' in value &&
    'transport_type' in value &&
    'auth_type' in value
  );
}

interface RawLibraryRow extends McpLibraryRow {
  organizations?: { name: string } | null;
}

function isRawLibraryRow(value: unknown): value is RawLibraryRow {
  return isLibraryRow(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const BROWSE_COLUMNS =
  'id, org_id, organizations(name), name, description, category, image_url, transport_type, transport_config, variables, installations_count, published_by, created_at, auth_type';

const DETAIL_COLUMNS =
  'id, org_id, organizations(name), name, description, category, image_url, transport_type, transport_config, variables, installations_count, published_by, created_at, auth_type';

const DEFAULT_BROWSE_LIMIT = 20;
const RANGE_OFFSET = 1;

function flattenOrgName(row: RawLibraryRow): McpLibraryRow {
  const { organizations, ...rest } = row;
  return { ...rest, org_name: organizations?.name };
}

function mapRows(data: unknown[]): McpLibraryRow[] {
  return data.reduce<McpLibraryRow[]>((acc, row) => {
    if (isRawLibraryRow(row)) acc.push(flattenOrgName(row));
    return acc;
  }, []);
}

function toSafeArray(data: unknown): unknown[] {
  if (isUnknownArray(data)) return data;
  return [];
}

function toFlatRow(data: unknown): McpLibraryRow | null {
  if (!isRawLibraryRow(data)) return null;
  return flattenOrgName(data);
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

function getTextFilter(options: BrowseOptions): { field: string; pattern: string } | null {
  if (options.query === undefined || options.query === '') return null;
  return { field: 'name', pattern: `%${options.query}%` };
}

function getCategoryFilter(options: BrowseOptions): string | null {
  if (options.category === undefined || options.category === '') return null;
  return options.category;
}

function computeBrowseRange(options: BrowseOptions): { from: number; to: number } | null {
  if (options.offset === undefined) return null;
  const limit = options.limit ?? DEFAULT_BROWSE_LIMIT;
  return { from: options.offset, to: options.offset + limit - RANGE_OFFSET };
}

export async function browseLibrary(
  supabase: SupabaseClient,
  options?: BrowseOptions
): Promise<{ result: McpLibraryRow[]; error: string | null }> {
  let query = supabase
    .from('mcp_library')
    .select(BROWSE_COLUMNS)
    .order('installations_count', { ascending: false });

  if (options !== undefined) {
    const textFilter = getTextFilter(options);
    if (textFilter !== null) query = query.ilike(textFilter.field, textFilter.pattern);
    const category = getCategoryFilter(options);
    if (category !== null) query = query.eq('category', category);
    if (options.limit !== undefined) query = query.limit(options.limit);
    const range = computeBrowseRange(options);
    if (range !== null) query = query.range(range.from, range.to);
  }

  const { data, error } = await query;
  if (error !== null) return { result: [], error: error.message };
  return { result: mapRows(toSafeArray(data)), error: null };
}

export async function getLibraryItemById(
  supabase: SupabaseClient,
  id: string
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  const { data, error } = await supabase.from('mcp_library').select(DETAIL_COLUMNS).eq('id', id).single();

  if (error !== null) return { result: null, error: error.message };
  const row = toFlatRow(data);
  if (row === null) return { result: null, error: 'Invalid library item data' };
  return { result: row, error: null };
}

export async function publishToLibrary(
  supabase: SupabaseClient,
  item: PublishInput,
  userId: string
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  const result = await supabase
    .from('mcp_library')
    .insert({ ...item, published_by: userId })
    .select(DETAIL_COLUMNS)
    .single();

  if (result.error !== null) return { result: null, error: result.error.message };
  const row = toFlatRow(result.data);
  if (row === null) return { result: null, error: 'Invalid library item data' };
  return { result: row, error: null };
}

export async function unpublishFromLibrary(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('mcp_library').delete().eq('id', id);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateLibraryImageUrl(
  supabase: SupabaseClient,
  libraryItemId: string,
  imageUrl: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('mcp_library')
    .update({ image_url: imageUrl })
    .eq('id', libraryItemId);
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
