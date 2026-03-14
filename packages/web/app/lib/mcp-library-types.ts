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

export function isLibraryRow(value: unknown): value is McpLibraryRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'org_id' in value &&
    'transport_type' in value
  );
}

type RawLibraryRow = McpLibraryRow & { organizations?: { name: string } | null };

export function flattenOrgName(row: RawLibraryRow): McpLibraryRow {
  const { organizations, ...rest } = row;
  return { ...rest, org_name: organizations?.name };
}

export function mapRows(data: unknown[]): McpLibraryRow[] {
  return data.reduce<McpLibraryRow[]>((acc, row) => {
    if (isLibraryRow(row as RawLibraryRow)) acc.push(flattenOrgName(row as RawLibraryRow));
    return acc;
  }, []);
}

export const BROWSE_COLUMNS =
  'id, org_id, organizations(name), name, description, category, image_url, transport_type, transport_config, variables, installations_count, published_by, created_at';

export const DETAIL_COLUMNS =
  'id, org_id, organizations(name), name, description, category, image_url, transport_type, transport_config, variables, installations_count, published_by, created_at';
