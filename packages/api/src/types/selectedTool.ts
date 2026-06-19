export type ProviderType = 'builtin' | 'mcp';

export interface SelectedTool {
  providerType: ProviderType;
  providerId: string;
  toolName: string;
}

/**
 * Canonical built-in provider IDs. These are part of the public contract — renaming
 * any of these requires a data migration of every agent's selected_tools. The single
 * source of truth lives in `providers/bundles.ts` because it also drives the typed
 * services resolver and the edge function's exhaustive preparer map; we re-export
 * here to keep the existing import path stable for downstream callers.
 */
export type { BuiltinProviderId } from '../providers/bundles.js';
export { BUILTIN_PROVIDER_IDS } from '../providers/bundles.js';

export function equalsSelectedTool(a: SelectedTool, b: SelectedTool): boolean {
  return a.providerType === b.providerType && a.providerId === b.providerId && a.toolName === b.toolName;
}
