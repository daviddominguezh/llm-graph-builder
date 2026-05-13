export type ProviderType = 'builtin' | 'mcp';

export interface SelectedTool {
  providerType: ProviderType;
  providerId: string;
  toolName: string;
}

/**
 * Canonical built-in provider IDs. These are part of the public contract — renaming
 * any of these requires a data migration of every agent's selected_tools.
 */
export const BUILTIN_PROVIDER_IDS = ['calendar', 'forms', 'lead_scoring', 'composition'] as const;
export type BuiltinProviderId = (typeof BUILTIN_PROVIDER_IDS)[number];

export function equalsSelectedTool(a: SelectedTool, b: SelectedTool): boolean {
  return a.providerType === b.providerType && a.providerId === b.providerId && a.toolName === b.toolName;
}
