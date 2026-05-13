'use client';

import { useCallback, useEffect, useReducer } from 'react';

const API_BASE_URL = '/api/messaging';

interface WhatsAppStatus {
  integrated: boolean;
  data?: string;
}

interface IntegrationsResponse {
  whatsapp?: WhatsAppStatus;
}

export interface ChannelStatus {
  connected: boolean;
  phone: string | null;
  loading: boolean;
}

async function fetchHeaders(): Promise<Record<string, string>> {
  const { getAuthToken } = await import('@/app/components/messages/services/auth');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const apiKey = process.env.NEXT_PUBLIC_CLOSER_API_KEY;
  if (apiKey) headers.api_key = apiKey;

  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

async function fetchIntegrations(tenantId: string): Promise<IntegrationsResponse | null> {
  const headers = await fetchHeaders();
  const url = `${API_BASE_URL}/projects/${tenantId}/integrations`;
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) return null;
  return await (res.json() as Promise<IntegrationsResponse>);
}

function parseWhatsAppStatus(data: IntegrationsResponse | null): ChannelStatus {
  const wa = data?.whatsapp;
  if (wa?.integrated) {
    return { connected: true, phone: wa.data ?? null, loading: false };
  }
  return { connected: false, phone: null, loading: false };
}

/**
 * Fetches the WhatsApp integration status for a given tenant.
 * Returns connection status, phone number (if connected), and a refresh callback.
 */
export function useWhatsAppStatus(tenantId: string): ChannelStatus & { refresh: () => void } {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const [status, dispatch] = useReducer((_prev: ChannelStatus, next: ChannelStatus) => next, {
    connected: false,
    phone: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    void fetchIntegrations(tenantId).then((data) => {
      if (!cancelled) dispatch(parseWhatsAppStatus(data));
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, tick]);

  const refresh = useCallback(() => {
    bump();
  }, []);

  return { ...status, refresh };
}
