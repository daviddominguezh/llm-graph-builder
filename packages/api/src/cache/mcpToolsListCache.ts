const VERSION_SENTINEL = 'v0';
const KIB = 1024;
const MAX_CACHE_VALUE_KIB = 256;

export const MAX_CACHE_VALUE_BYTES = MAX_CACHE_VALUE_KIB * KIB;

export function mcpToolsListKey(orgId: string, serverHash: string, serverVersion: string): string {
  const version = serverVersion.length > 0 ? serverVersion : VERSION_SENTINEL;
  return `mcp_tools:v1:${orgId}:${serverHash}:${version}`;
}

export function isCacheableSize(serializedValue: string): boolean {
  return new TextEncoder().encode(serializedValue).byteLength <= MAX_CACHE_VALUE_BYTES;
}
