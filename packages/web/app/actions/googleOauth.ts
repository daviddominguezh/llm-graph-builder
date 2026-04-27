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

export interface DisconnectGoogleCalendarResult {
  ok: boolean;
  warning?: string;
}

interface DisconnectResponseBody {
  warning?: { message?: string };
}

function extractWarning(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const body = data as DisconnectResponseBody;
  return body.warning?.message;
}

export async function disconnectGoogleCalendar(orgId: string): Promise<DisconnectGoogleCalendarResult> {
  try {
    const params = new URLSearchParams({ orgId });
    const data = await fetchFromBackend('DELETE', `/agents/google-oauth/connections?${params.toString()}`);
    return { ok: true, warning: extractWarning(data) };
  } catch {
    return { ok: false };
  }
}
