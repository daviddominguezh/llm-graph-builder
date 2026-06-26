const HEX_PREFIX_LEN = 12;
const HEX_RADIX = 16;
const HEX_PAD_LEN = 2;
const HEX_START = 0;
const SIDE_TABLE_PREFIX = 'mcp_url:v1:';

/**
 * Async-only sha256 prefix of an MCP server URL. Works in both Node (≥16 with
 * globalThis.crypto.subtle) and Deno. The Web Crypto API is available natively
 * in both runtimes, so no platform shim is needed.
 *
 * Use as a stable, opaque identifier in cache keys to avoid leaking
 * customer-supplied URLs into Redis logs/metrics. The 12-hex-char prefix
 * gives ~10^14 possible values — safe against collision for any realistic
 * MCP server population per org.
 */
export async function hashServerUrl(serverUrl: string): Promise<string> {
  const data = new TextEncoder().encode(serverUrl);
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const b of bytes) hex += b.toString(HEX_RADIX).padStart(HEX_PAD_LEN, '0');
  return hex.slice(HEX_START, HEX_PREFIX_LEN);
}

export interface ServerUrlSideTableEntry {
  serverUrl: string;
  firstSeenAt: number;
}

export function serverUrlSideTableKey(hash: string): string {
  return `${SIDE_TABLE_PREFIX}${hash}`;
}
