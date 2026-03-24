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
