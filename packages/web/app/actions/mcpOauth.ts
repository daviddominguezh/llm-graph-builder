'use server';

import { fetchFromBackend } from '@/app/lib/backendProxy';

interface ConnectionStatusResponse {
  connected: boolean;
}

function isConnectionStatus(val: unknown): val is ConnectionStatusResponse {
  return typeof val === 'object' && val !== null && 'connected' in val;
}

export async function getOAuthConnectionStatus(
  orgId: string,
  libraryItemId: string
): Promise<{ connected: boolean }> {
  try {
    const params = new URLSearchParams({ orgId, libraryItemId });
    const data = await fetchFromBackend('GET', `/agents/mcp-oauth/status?${params.toString()}`);
    if (!isConnectionStatus(data)) return { connected: false };
    return { connected: data.connected };
  } catch {
    return { connected: false };
  }
}
