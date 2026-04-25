'use server';

import { fetchFromBackend } from '@/app/lib/backendProxy';

interface GoogleConnectionStatusResponse {
  connected: boolean;
  connectedBy?: string;
  expiresAt?: string;
  scopes?: string;
}

function isGoogleConnectionStatus(val: unknown): val is GoogleConnectionStatusResponse {
  return typeof val === 'object' && val !== null && 'connected' in val;
}

export async function getGoogleCalendarConnectionStatus(
  orgId: string
): Promise<GoogleConnectionStatusResponse> {
  try {
    const params = new URLSearchParams({ orgId });
    const data = await fetchFromBackend('GET', `/agents/google-oauth/status?${params.toString()}`);
    if (!isGoogleConnectionStatus(data)) return { connected: false };
    return data;
  } catch {
    return { connected: false };
  }
}

export async function disconnectGoogleCalendar(orgId: string): Promise<boolean> {
  try {
    const params = new URLSearchParams({ orgId });
    await fetchFromBackend('DELETE', `/agents/google-oauth/connections?${params.toString()}`);
    return true;
  } catch {
    return false;
  }
}
