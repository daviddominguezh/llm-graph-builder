/**
 * Maps a redacted MCP discovery error category (returned by the discover route)
 * to a static, localized i18n key. No raw upstream error text is ever surfaced.
 */

export const DISCOVERY_ERROR_CATEGORIES = [
  'blocked',
  'dns',
  'timeout',
  'tls',
  'auth',
  'client_error',
  'server_error',
  'protocol',
  'unknown',
] as const;

export type DiscoveryErrorCategory = (typeof DISCOVERY_ERROR_CATEGORIES)[number];

const DISCOVERY_ERROR_NAMESPACE = 'mcpLibrary.discoveryErrors';

/**
 * Narrows an arbitrary value to a known discovery error category, falling back
 * to `'unknown'` for anything missing or unrecognized.
 */
export function toDiscoveryErrorCategory(value: unknown): DiscoveryErrorCategory {
  return DISCOVERY_ERROR_CATEGORIES.includes(value as DiscoveryErrorCategory)
    ? (value as DiscoveryErrorCategory)
    : 'unknown';
}

/**
 * Returns the fully-qualified i18n key for a category, e.g.
 * `mcpLibrary.discoveryErrors.blocked`.
 */
export function discoveryErrorMessageKey(category: DiscoveryErrorCategory): string {
  return `${DISCOVERY_ERROR_NAMESPACE}.${category}`;
}

/**
 * Returns the relative key (within the `mcpLibrary` namespace) for a category,
 * e.g. `discoveryErrors.blocked`. Intended for `useTranslations('mcpLibrary')`.
 */
export function discoveryErrorRelativeKey(category: DiscoveryErrorCategory): string {
  return `discoveryErrors.${category}`;
}
